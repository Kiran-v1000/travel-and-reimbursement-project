import { Router } from 'express';
import { asyncHandler as h, authenticate, validate } from '../../shared/middlewares/index.js';
import { loginLimiter, ssoLimiter } from '../../shared/middlewares/rateLimits.js';
import * as c from './auth.controller.js';
import { loginSchema, changePasswordSchema } from './auth.validation.js';

const router = Router();

router.get('/config', c.config);
router.post('/login', loginLimiter, validate(loginSchema), h(c.login));
router.get('/sso/start', ssoLimiter, h(c.ssoStart));
router.get('/sso/callback', ssoLimiter, h(c.ssoCallback));
router.post('/logout', h(c.logout));
router.get('/sessions', authenticate, h(c.sessions));
router.post('/sessions/revoke-others', authenticate, h(c.revokeOtherSessions));
router.get('/me', authenticate, h(c.me));
router.post('/change-password', loginLimiter, authenticate, validate(changePasswordSchema), h(c.changePassword));

export default router;
