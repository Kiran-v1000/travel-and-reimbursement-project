import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as h, requireRole, validate } from '../../shared/middlewares/index.js';
import * as svc from './help.service.js';

const feedbackSchema = z.object({
  // Article slugs are file names in the web app's guide (lowercase words and dashes).
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/, 'Unknown article'),
  helpful: z.boolean(),
});

const router = Router();
router.post('/feedback', validate(feedbackSchema), h(async (req, res) => res.json(await svc.recordFeedback(req.user, req.body))));
router.get('/feedback', requireRole('ADMIN'), h(async (_req, res) => res.json(await svc.feedbackSummary())));

export default router;
