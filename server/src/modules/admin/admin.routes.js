import { Router } from 'express';
import { asyncHandler as h, requireRole, validate } from '../../shared/middlewares/index.js';
import * as c from './admin.controller.js';
import { ruleSchema, simulateSchema, categorySchema, currencySchema, deptSchema, costCenterSchema, settingsSchema } from './admin.validation.js';

const router = Router();

// Reference data for every signed-in user (categories, currencies, cost centers, policy hints).
router.get('/reference', h(c.reference));

router.use(requireRole('ADMIN'));
router.get('/rules', h(c.listRules));
router.post('/rules/simulate', validate(simulateSchema), h(c.simulate));
router.post('/rules', validate(ruleSchema), h(c.createRule));
router.put('/rules/:id', validate(ruleSchema), h(c.updateRule));
router.delete('/rules/:id', h(c.deleteRule));

router.get('/categories', h(c.listCategories));
router.post('/categories', validate(categorySchema), h(c.createCategory));
router.put('/categories/:id', validate(categorySchema), h(c.updateCategory));

router.get('/currencies', h(c.listCurrencies));
router.put('/currencies/:code', validate(currencySchema), h(c.upsertCurrency));

router.get('/departments', h(c.listDepartments));
router.post('/departments', validate(deptSchema), h(c.createDepartment));
router.put('/departments/:id', validate(deptSchema), h(c.updateDepartment));

router.get('/cost-centers', h(c.listCostCenters));
router.post('/cost-centers', validate(costCenterSchema), h(c.createCostCenter));
router.put('/cost-centers/:id', validate(costCenterSchema), h(c.updateCostCenter));

router.get('/settings', h(c.getSettings));
router.put('/settings', validate(settingsSchema), h(c.updateSettings));

export default router;
