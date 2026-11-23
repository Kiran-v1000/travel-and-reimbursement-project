import { Router } from 'express';
import { asyncHandler as h, requireRole, validate } from '../../shared/middlewares/index.js';
import * as c from './compliance.controller.js';
import { holdSchema, releaseSchema } from './compliance.validation.js';

// Auditors can see holds and retention; Finance and Admin place / release holds;
// only an Admin can start a purge.
const router = Router();
router.use(requireRole('ADMIN', 'FINANCE', 'AUDITOR'));

router.get('/holds', h(c.listHolds));
router.post('/holds', requireRole('ADMIN', 'FINANCE'), validate(holdSchema), h(c.placeHold));
router.post('/holds/:id/release', requireRole('ADMIN', 'FINANCE'), validate(releaseSchema), h(c.releaseHold));
router.get('/retention', h(c.retentionPreview));
router.get('/retention/runs', h(c.retentionRuns));
router.post('/retention/run', requireRole('ADMIN'), h(c.startRetention));

export default router;
