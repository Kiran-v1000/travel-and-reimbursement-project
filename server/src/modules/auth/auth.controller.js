import { env, isProd } from '../../config/env.js';
import { AUTH_COOKIE } from '../../shared/middlewares/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as svc from './auth.service.js';

const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: 8 * 60 * 60 * 1000 };

export const config = (_req, res) => res.json({ ssoEnabled: env.SSO_ENABLED });

export const login = async (req, res) => {
  const { token, user } = await svc.login(req.body.email, req.body.password);
  res.cookie(AUTH_COOKIE, token, cookieOpts);
  res.json({ user });
};

export const sso = () => {
  throw new AppError(501, 'Single sign-on is not configured yet. Ask IT to connect the company identity provider.', 'SSO_NOT_CONFIGURED');
};

export const logout = (_req, res) => {
  const { maxAge, ...opts } = cookieOpts;
  res.clearCookie(AUTH_COOKIE, opts);
  res.json({ ok: true });
};

export const me = async (req, res) => res.json(await svc.me(req.user.id));
