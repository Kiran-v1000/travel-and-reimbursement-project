import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env, isProd } from '../../config/env.js';
import { prisma } from '../../db/pool.js';
import { AppError, unauthorized, forbidden } from '../errors/AppError.js';

export const AUTH_COOKIE = 'tr_session';

/** Wrap async handlers so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Tiny per-process cache of session users: removes one DB round-trip from every API call.
// Role / active changes take effect within USER_CACHE_TTL_MS.
const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_MAX = 20_000;
const userCache = new Map();
export const forgetCachedUser = (id) => userCache.delete(id);

async function loadSessionUser(id) {
  const hit = userCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.user;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true, managerId: true, departmentId: true },
  });
  if (userCache.size >= USER_CACHE_MAX) userCache.delete(userCache.keys().next().value);
  userCache.set(id, { user, exp: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

/** Verify the session cookie and attach the active user. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = req.cookies?.[AUTH_COOKIE] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw unauthorized('Session expired, please sign in again');
  }
  const user = await loadSessionUser(payload.sub);
  if (!user || !user.active) throw unauthorized('Account is inactive');
  req.user = user;
  next();
});

/** Allow only the given roles. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Validate req[source] against a zod schema and replace it with the parsed value. */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    req[source] = result.data;
    next();
  };

export const notFoundHandler = (req, _res, next) => next(new AppError(404, `Route ${req.method} ${req.path} not found`, 'NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'VALIDATION', message: 'Please check the highlighted fields', fields: err.flatten().fieldErrors },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: { code: 'UPLOAD', message: err.message } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: isProd ? 'Something went wrong' : err.message } });
};
