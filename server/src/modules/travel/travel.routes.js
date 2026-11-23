import { Router } from 'express';
import { asyncHandler as h, validate } from '../../shared/middlewares/index.js';
import * as c from './travel.controller.js';
import { travelSchema, submitSchema } from './travel.validation.js';

const router = Router();

router.get('/', h(c.list));
router.get('/linkable', h(c.linkable));
router.get('/export', h(c.exportCsv));
router.post('/policy-preview', validate(travelSchema), h(c.policyPreview));
router.post('/', validate(travelSchema), h(c.create));
router.get('/:id', h(c.get));
router.put('/:id', validate(travelSchema), h(c.update));
router.post('/:id/submit', validate(submitSchema), h(c.submit));
router.post('/:id/withdraw', h(c.withdraw));
router.delete('/:id', h(c.remove));

export default router;
