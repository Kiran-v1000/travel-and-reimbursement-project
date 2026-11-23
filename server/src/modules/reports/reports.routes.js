import { Router } from 'express';
import { asyncHandler as h, requireRole } from '../../shared/middlewares/index.js';
import * as c from './reports.controller.js';

const router = Router();
const analysts = requireRole('MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR');

router.get('/dashboard', h(c.dashboard));
router.get('/analytics', analysts, h(c.analytics));
router.get('/analytics/export/:kind', analysts, h(c.exportAnalytics));

export default router;
