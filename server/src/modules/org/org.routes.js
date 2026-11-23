import { Router } from 'express';
import { asyncHandler as h } from '../../shared/middlewares/index.js';
import * as c from './org.controller.js';

// The org chart is a company directory: every signed-in employee can browse it.
const router = Router();
router.get('/chart', h(c.chart));
router.get('/roots', h(c.roots));

export default router;
