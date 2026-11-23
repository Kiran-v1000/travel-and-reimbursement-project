import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { asyncHandler as h } from '../../shared/middlewares/index.js';
import { badRequest } from '../../shared/errors/AppError.js';
import * as c from './attachments.controller.js';
import { uploadDir, ALLOWED } from './attachments.service.js';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(badRequest('Only JPG, PNG, WEBP or PDF files are allowed'))),
});

router.post('/', upload.array('files', 5), h(c.upload));
router.get('/:id', h(c.download));
router.delete('/:id', h(c.remove));

export default router;
