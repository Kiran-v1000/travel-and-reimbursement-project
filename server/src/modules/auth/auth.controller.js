import jwt from 'jsonwebtoken';
import { env, isProd } from '../../config/env.js';
import { createSession, listSessions, revokeAllSessions, revokeSession } from './auth.sessions.js';
import { AUTH_COOKIE } from '../../shared/middlewares/index.js';
import { prisma } from '../../db/pool.js';
import { audit } from '../audit/audit.service.js';
import * as svc from './auth.service.js';
import * as sso from './auth.sso.service.js';

// Cookie lifetime follows the session's own lifetime (shorter for Finance / Administrators).
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' };
const SSO_TX_COOKIE = 'tr_sso_tx';
const txCookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/api/auth/sso', maxAge: 10 * 60 * 1000 };
const clientBase = () => env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '');

export const config = (_req, res) =>
  res.json({ ssoEnabled: sso.ssoConfigured(), ssoProvider: 'microsoft', ssoDomains: env.SSO_ALLOWED_DOMAINS });

export const login = async (req, res) => {
  const { token, maxAge, user } = await svc.login(req.body.email, req.body.password, req);
  res.cookie(AUTH_COOKIE, token, { ...cookieOpts, maxAge });
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
    const { token, maxAge } = await createSession(user, req, 'SSO');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user, 'auth.login', 'USER', user.id, { method: 'sso', ip: req.ip });
    res.cookie(AUTH_COOKIE, token, { ...cookieOpts, maxAge });
    res.redirect(`${clientBase()}${returnTo}`);
  } catch (err) {
    await audit(null, 'auth.sso_failed', 'USER', null, { reason: err.code ?? 'ERROR', message: err.message });
    res.redirect(`${clientBase()}/login?sso_error=${encodeURIComponent(err.message)}`);
  }
};

/** Sign out: end the session on the server (the token stops working everywhere), clear the cookie. */
export const logout = async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (token) {
    try {
      const { sub, sid } = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true });
      if (sid) {
        await revokeSession(sid, 'SIGN_OUT');
        const who = await prisma.user.findUnique({ where: { id: sub }, select: { id: true, name: true } });
        await audit(who, 'auth.logout', 'USER', sub, {});
      }
    } catch {
      /* invalid token: nothing to end */
    }
  }
  res.clearCookie(AUTH_COOKIE, cookieOpts);
  res.json({ ok: true });
};

/** Signed-in devices of the current person. */
export const sessions = async (req, res) =>
  res.json((await listSessions(req.user.id)).map((s) => ({ ...s, current: s.id === req.sessionId })));

/** Sign out every other device (keeps this one). */
export const revokeOtherSessions = async (req, res) => {
  const ended = await revokeAllSessions(req.user.id, 'SIGNED_OUT_ELSEWHERE', { except: req.sessionId });
  await audit(req.user, 'auth.sessions_revoked', 'USER', req.user.id, { ended });
  res.json({ ended });
};

export const me = async (req, res) => res.json(await svc.me(req.user.id));

export const changePassword = async (req, res) => {
  const { token, maxAge } = await svc.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword, req);
  res.cookie(AUTH_COOKIE, token, { ...cookieOpts, maxAge });
  res.json(await svc.me(req.user.id));
};
