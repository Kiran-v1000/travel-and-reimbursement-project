import { Router } from 'express';
import { asyncHandler as h, requireRole, validate } from '../../shared/middlewares/index.js';
import * as c from './users.controller.js';
import { createSchema, updateSchema, delegationSchema } from './users.validation.js';

const router = Router();

router.get('/directory', h(c.directory));
router.get('/delegations', h(c.myDelegations));
router.post('/delegations', requireRole('MANAGER', 'FINANCE', 'ADMIN'), validate(delegationSchema), h(c.createDelegation));
router.delete('/delegations/:id', h(c.revokeDelegation));

router.get('/', requireRole('ADMIN', 'AUDITOR'), h(c.list));
router.post('/', requireRole('ADMIN'), validate(createSchema), h(c.create));
router.patch('/:id', requireRole('ADMIN'), validate(updateSchema), h(c.update));

export default router;
