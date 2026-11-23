import { Router } from 'express';
import { asyncHandler as h, requireRole, validate } from '../../shared/middlewares/index.js';
import * as c from './finance.controller.js';
import { decideSchema, recodeSchema, paymentSchema, exportSchema } from './finance.validation.js';

const router = Router();
router.use(requireRole('FINANCE', 'ADMIN'));

router.get('/queue', h(c.queue));
router.get('/payments', h(c.payments));
router.get('/accounting-export/preview', h(c.exportPreview));
router.get('/accounting-exports', h(c.exportHistory));
router.post('/accounting-exports', validate(exportSchema), h(c.createExport));
router.get('/accounting-exports/:id/download', h(c.downloadExport));
router.post('/:id/decide', validate(decideSchema), h(c.decide));
router.post('/:id/recode', validate(recodeSchema), h(c.recode));
router.post('/:id/payment', validate(paymentSchema), h(c.recordPayment));

export default router;
