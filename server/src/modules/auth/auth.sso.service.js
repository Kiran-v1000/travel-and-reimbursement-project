/**
 * Microsoft Entra ID (Azure AD) single sign-on - OpenID Connect authorization-code flow with PKCE.
 *
 * start    -> redirect to Microsoft with state + nonce + PKCE challenge (kept in a signed, short-lived cookie)
 * callback -> verify state, redeem the code, verify nonce, tenant and email domain,
 *             then link or auto-provision the user and open a normal session.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { audit } from '../audit/audit.service.js';
import { syncFromDirectory } from './auth.directory.service.js';

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const cryptoProvider = new CryptoProvider();
let client = null;

export const ssoConfigured = () => !!(env.SSO_ENABLED && env.AZURE_AD_TENANT_ID && env.AZURE_AD_CLIENT_ID && env.AZURE_AD_CLIENT_SECRET);

function msal() {
  if (!ssoConfigured()) throw new AppError(501, 'Single sign-on is not configured yet. Ask IT to connect Microsoft Entra ID.', 'SSO_NOT_CONFIGURED');
  if (!client) {
    client = new ConfidentialClientApplication({
      auth: {
        clientId: env.AZURE_AD_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}`,
        clientSecret: env.AZURE_AD_CLIENT_SECRET,
      },
    });
  }
  return client;
}

/** Build the Microsoft sign-in URL and the signed transaction to keep in a cookie. */
export async function startLogin(returnTo = '/') {
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = crypto.randomBytes(24).toString('base64url');
  const nonce = crypto.randomBytes(24).toString('base64url');
  const url = await msal().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: env.AZURE_AD_REDIRECT_URI,
    state,
    nonce,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    prompt: 'select_account',
    domainHint: env.SSO_ALLOWED_DOMAINS[0],
    responseMode: 'query',
  });
  const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  const transaction = jwt.sign({ state, nonce, verifier, returnTo: safeReturn }, env.JWT_SECRET, { expiresIn: '10m' });
  return { url, transaction };
}

/** Pure claim checks (unit tested). Returns the normalised identity or throws. */
export function verifyClaims(claims, { tenantId, allowedDomains, nonce }) {
  if (!claims) throw new AppError(401, 'Microsoft did not return an identity', 'SSO_FAILED');
  if (nonce && claims.nonce !== nonce) throw new AppError(401, 'Sign-in could not be verified (nonce mismatch). Please try again.', 'SSO_FAILED');
  if (tenantId && claims.tid !== tenantId) throw new AppError(403, 'This Microsoft account belongs to a different organisation.', 'SSO_WRONG_TENANT');
  const email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
  const domain = email.split('@')[1];
  if (!email || !domain || !allowedDomains.includes(domain)) {
    throw new AppError(403, `Only ${allowedDomains.map((d) => `@${d}`).join(', ')} accounts can sign in.`, 'SSO_DOMAIN_NOT_ALLOWED');
  }
  if (!claims.oid) throw new AppError(401, 'Microsoft did not return an account id', 'SSO_FAILED');
  return { email, oid: claims.oid, name: claims.name || email.split('@')[0] };
}

/** Redeem the code, validate, then link / provision the user. Returns the active user. */
export async function completeLogin(query, transactionToken) {
  if (query.error) {
    throw new AppError(401, query.error_description?.split('\n')[0] || 'Microsoft sign-in was cancelled', 'SSO_FAILED');
  }
  let tx;
  try {
    tx = jwt.verify(transactionToken ?? '', env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'Your sign-in session expired. Please try again.', 'SSO_FAILED');
  }
  if (!query.state || query.state !== tx.state) throw new AppError(401, 'Sign-in could not be verified (state mismatch). Please try again.', 'SSO_FAILED');

  const result = await msal().acquireTokenByCode({ code: query.code, scopes: SCOPES, redirectUri: env.AZURE_AD_REDIRECT_URI, codeVerifier: tx.verifier });
  const identity = verifyClaims(result.idTokenClaims, { tenantId: env.AZURE_AD_TENANT_ID, allowedDomains: env.SSO_ALLOWED_DOMAINS, nonce: tx.nonce });

  let user = (await prisma.user.findUnique({ where: { azureOid: identity.oid } })) ?? (await prisma.user.findUnique({ where: { email: identity.email } }));
  if (user && user.azureOid && user.azureOid !== identity.oid) {
    throw new AppError(403, 'This email is linked to a different Microsoft account. Contact an administrator.', 'SSO_CONFLICT');
  }
  if (!user) {
    if (!env.SSO_AUTO_PROVISION) throw new AppError(403, 'Your account has not been set up in Voyage yet. Contact an administrator.', 'SSO_NOT_PROVISIONED');
    user = await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        azureOid: identity.oid,
        employeeId: `SSO-${identity.oid.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
        role: 'EMPLOYEE',
      },
    });
    await audit(user, 'user.sso_provisioned', 'USER', user.id, { email: user.email });
  } else if (!user.azureOid) {
    user = await prisma.user.update({ where: { id: user.id }, data: { azureOid: identity.oid } });
    await audit(user, 'user.sso_linked', 'USER', user.id, { email: user.email });
  }
  if (!user.active) throw new AppError(403, 'Your account is inactive. Contact an administrator.', 'SSO_INACTIVE');
  user = await syncFromDirectory(user, result.accessToken);
  return { user, returnTo: tx.returnTo };
}
