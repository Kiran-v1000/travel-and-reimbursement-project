import { Router } from 'express';
import { asyncHandler as h, requireRole } from '../../shared/middlewares/index.js';
import * as c from './audit.controller.js';

const router = Router();
router.use(requireRole('ADMIN', 'AUDITOR', 'FINANCE'));

router.get('/', h(c.list));
router.get('/verify', h(c.verify));
router.get('/export', h(c.exportCsv));

export default router;
