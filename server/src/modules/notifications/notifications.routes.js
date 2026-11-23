import { Router } from 'express';
import { asyncHandler as h } from '../../shared/middlewares/index.js';
import * as c from './notifications.controller.js';

const router = Router();

router.get('/', h(c.list));
router.post('/read-all', h(c.markAllRead));
router.post('/:id/read', h(c.markRead));

export default router;
