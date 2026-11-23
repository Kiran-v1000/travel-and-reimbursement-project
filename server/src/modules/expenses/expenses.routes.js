import { Router } from 'express';
import { asyncHandler as h, validate } from '../../shared/middlewares/index.js';
import * as c from './expenses.controller.js';
import { reportSchema, lineSchema, submitSchema } from './expenses.validation.js';

const router = Router();

router.get('/', h(c.list));
router.get('/export', h(c.exportCsv));
router.post('/', validate(reportSchema), h(c.create));
router.get('/:id', h(c.get));
router.put('/:id', validate(reportSchema), h(c.update));
router.get('/:id/policy', h(c.policy));
router.post('/:id/lines', validate(lineSchema), h(c.addLine));
router.put('/:id/lines/:lineId', validate(lineSchema), h(c.updateLine));
router.delete('/:id/lines/:lineId', h(c.deleteLine));
router.post('/:id/submit', validate(submitSchema), h(c.submit));
router.post('/:id/withdraw', h(c.withdraw));
router.delete('/:id', h(c.remove));

export default router;
