import jwt from 'jsonwebtoken';
import { env, isProd } from '../../config/env.js';
import { AUTH_COOKIE } from '../../shared/middlewares/index.js';
import { prisma } from '../../db/pool.js';
import { audit } from '../audit/audit.service.js';
import * as svc from './auth.service.js';
import * as sso from './auth.sso.service.js';

const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: 8 * 60 * 60 * 1000 };
const SSO_TX_COOKIE = 'tr_sso_tx';
const txCookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/api/auth/sso', maxAge: 10 * 60 * 1000 };
const clientBase = () => env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '');

export const config = (_req, res) =>
  res.json({ ssoEnabled: sso.ssoConfigured(), ssoProvider: 'microsoft', ssoDomains: env.SSO_ALLOWED_DOMAINS });

export const login = async (req, res) => {
  const { token, user } = await svc.login(req.body.email, req.body.password);
  res.cookie(AUTH_COOKIE, token, cookieOpts);
  res.json({ user });
};

/** Browser navigation: redirect to Microsoft. */
export const ssoStart = async (req, res) => {
  try {
    const { url, transaction } = await sso.startLogin(req.query.returnTo);
    res.cookie(SSO_TX_COOKIE, transaction, txCookieOpts);
    res.redirect(url);
  } catch (err) {
    res.redirect(`${clientBase()}/login?sso_error=${encodeURIComponent(err.message)}`);
  }
};

/** Browser navigation back from Microsoft: open a session and return to the app. */
export const ssoCallback = async (req, res) => {
  const { maxAge, ...clearTx } = txCookieOpts;
  res.clearCookie(SSO_TX_COOKIE, clearTx);
  try {
    const { user, returnTo } = await sso.completeLogin(req.query, req.cookies?.[SSO_TX_COOKIE]);
    const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user, 'auth.login', 'USER', user.id, { method: 'sso' });
    res.cookie(AUTH_COOKIE, token, cookieOpts);
    res.redirect(`${clientBase()}${returnTo}`);
  } catch (err) {
    await audit(null, 'auth.sso_failed', 'USER', null, { reason: err.code ?? 'ERROR', message: err.message });
    res.redirect(`${clientBase()}/login?sso_error=${encodeURIComponent(err.message)}`);
  }
};

export const logout = (_req, res) => {
  const { maxAge, ...opts } = cookieOpts;
  res.clearCookie(AUTH_COOKIE, opts);
  res.json({ ok: true });
};

export const me = async (req, res) => res.json(await svc.me(req.user.id));

export const changePassword = async (req, res) => {
  const token = await svc.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  res.cookie(AUTH_COOKIE, token, cookieOpts);
  res.json(await svc.me(req.user.id));
};
