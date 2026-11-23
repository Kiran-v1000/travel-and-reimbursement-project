import { Router } from 'express';
import multer from 'multer';
import { asyncHandler as h, requireRole, validate } from '../../shared/middlewares/index.js';
import * as c from './users.controller.js';
import { createSchema, updateSchema, delegationSchema, importOptionsSchema } from './users.validation.js';

const router = Router();
// HR files stay in memory (a 100k-row CSV is ~10 MB) and are never written to disk.
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

router.get('/directory', h(c.directory));
router.get('/delegations', h(c.myDelegations));
router.post('/delegations', requireRole('MANAGER', 'FINANCE', 'ADMIN'), validate(delegationSchema), h(c.createDelegation));
router.delete('/delegations/:id', h(c.revokeDelegation));

// Bulk HR import (CSV)
router.get('/import/template', requireRole('ADMIN'), c.importTemplate);
router.get('/import/jobs', requireRole('ADMIN'), h(c.importJobs));
router.get('/import/jobs/:id', requireRole('ADMIN'), h(c.importJob));
router.post('/import', requireRole('ADMIN'), csvUpload.single('file'), validate(importOptionsSchema), h(c.startImport));

router.get('/', requireRole('ADMIN', 'AUDITOR'), h(c.list));
router.post('/', requireRole('ADMIN'), validate(createSchema), h(c.create));
router.patch('/:id', requireRole('ADMIN'), validate(updateSchema), h(c.update));

export default router;
