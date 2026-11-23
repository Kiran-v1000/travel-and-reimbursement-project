/**
 * Rate limits sized for a 100k-person company where thousands of people share one office
 * internet IP (NAT). Limits are keyed per signed-in session / per account, never IP-only
 * for authenticated traffic, so one busy office can't lock everyone out.
 *
 * The default store is in-process memory (per API instance). Behind a load balancer each
 * instance enforces its own budget, which is fine for abuse protection; plug a shared store
 * (e.g. rate-limit-redis) here if strict global limits are ever needed.
 */
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { AUTH_COOKIE } from './index.js';
import { env } from '../../config/env.js';

const hash = (s) => crypto.createHash('sha256').update(s).digest('base64url').slice(0, 22);
// With app.set('trust proxy', 1) this is the real client address behind nginx.
const ip = (req) => req.ip ?? 'unknown';
const message = (msg) => ({ error: { code: 'RATE_LIMITED', message: msg } });

/** General API traffic: per session when signed in, generous per-IP ceiling otherwise. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => (req.cookies?.[AUTH_COOKIE] ? env.API_RATE_LIMIT_PER_MIN : 5000),
  keyGenerator: (req) => {
    const token = req.cookies?.[AUTH_COOKIE];
    return token ? `s:${hash(token)}` : `ip:${ip(req)}`;
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many requests - please slow down for a moment.'),
});

/** Password sign-in: per account + IP, so one person's typos never block the office. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `l:${String(req.body?.email ?? '').toLowerCase()}:${ip(req)}`,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many failed sign-in attempts for this account. Try again in 15 minutes.'),
});

/** SSO redirects: high per-IP ceiling (Monday-morning office sign-in burst). */
export const ssoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5000,
  keyGenerator: (req) => `sso:${ip(req)}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many sign-in attempts from this network. Please retry shortly.'),
});
