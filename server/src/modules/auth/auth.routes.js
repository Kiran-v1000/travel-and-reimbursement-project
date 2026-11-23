import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler as h, authenticate, validate } from '../../shared/middlewares/index.js';
import * as c from './auth.controller.js';
import { loginSchema } from './auth.validation.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.get('/config', c.config);
router.post('/login', loginLimiter, validate(loginSchema), h(c.login));
router.get('/sso/start', loginLimiter, h(c.ssoStart));
router.get('/sso/callback', loginLimiter, h(c.ssoCallback));
router.post('/logout', c.logout);
router.get('/me', authenticate, h(c.me));

export default router;
