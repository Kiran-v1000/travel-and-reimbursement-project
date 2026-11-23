import { Router } from 'express';
import { asyncHandler as h, validate } from '../../shared/middlewares/index.js';
import * as c from './approvals.controller.js';
import { actSchema, bulkSchema } from './approvals.validation.js';

const router = Router();

router.get('/inbox', h(c.inbox));
router.get('/history', h(c.history));
router.post('/bulk-approve', validate(bulkSchema), h(c.bulkApprove));
router.post('/:stepId/act', validate(actSchema), h(c.act));

export default router;
