import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { badRequest, notFound, forbidden, conflict } from '../../shared/errors/AppError.js';
import { assertCanView } from '../../shared/utils/access.js';
import { audit } from '../audit/audit.service.js';
import { recalc } from '../expenses/expenses.service.js';
import { assertChangeable } from '../compliance/compliance.holds.service.js';

export const uploadDir = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

export const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const EDITABLE = ['DRAFT', 'RETURNED'];

/** Check magic bytes so a renamed file cannot pass as an image or PDF. */
function sniff(filePath, mime) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  if (mime === 'application/pdf') return buf.subarray(0, 4).toString() === '%PDF';
  if (mime === 'image/png') return buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG';
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/webp') return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  return false;
}

async function ownerContext({ travelRequestId, expenseLineId }) {
  if (travelRequestId) {
    const t = await prisma.travelRequest.findUnique({ where: { id: travelRequestId }, include: { steps: true } });
    if (!t) return null;
    return { ownerId: t.requesterId, entityType: 'TRAVEL', steps: t.steps, status: t.status, reportId: null };
  }
  const line = await prisma.expenseLine.findUnique({ where: { id: expenseLineId ?? '' }, include: { report: { include: { steps: true } } } });
  if (!line) return null;
  return { ownerId: line.report.employeeId, entityType: 'EXPENSE', steps: line.report.steps, status: line.report.status, reportId: line.reportId };
}

const removeFiles = (files) => files.forEach((f) => fs.rmSync(f.path, { force: true }));

export async function upload(user, files, { travelRequestId, expenseLineId }) {
  try {
    if (!files.length) throw badRequest('Choose a file to upload');
    if (!travelRequestId === !expenseLineId) throw badRequest('Attach the file to a travel request or an expense line');
    const ctx = await ownerContext({ travelRequestId, expenseLineId });
    if (!ctx) throw notFound('Target record');
    if (ctx.ownerId !== user.id) throw forbidden('You can only add files to your own records');
    if (!EDITABLE.includes(ctx.status)) throw conflict('Files can only be added while the item is a draft or returned');
    for (const f of files) if (!sniff(f.path, f.mimetype)) throw badRequest(`${f.originalname} is not a valid ${ALLOWED[f.mimetype]} file`);

    const created = [];
    for (const f of files) {
      created.push(
        await prisma.attachment.create({
          data: {
            originalName: f.originalname.slice(0, 200), storedName: f.filename, mimeType: f.mimetype, size: f.size, uploadedById: user.id,
            travelRequestId: travelRequestId || null, expenseLineId: expenseLineId || null,
          },
          select: { id: true, originalName: true, mimeType: true, size: true },
        }),
      );
    }
    if (ctx.reportId) await recalc(ctx.reportId);
    await audit(user, 'attachment.uploaded', ctx.entityType, travelRequestId || ctx.reportId, { files: created.map((c) => c.originalName) });
    return created;
  } catch (err) {
    removeFiles(files);
    throw err;
  }
}

export async function getForDownload(user, id) {
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) throw notFound('Attachment');
  await assertCanView(user, await ownerContext(att));
  const file = path.join(uploadDir, path.basename(att.storedName));
  if (!fs.existsSync(file)) throw notFound('File');
  return { att, file };
}

export async function remove(user, id) {
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) throw notFound('Attachment');
  const ctx = await ownerContext(att);
  if (ctx.ownerId !== user.id) throw forbidden();
  if (!EDITABLE.includes(ctx.status)) throw conflict('Files can only be removed while the item is a draft or returned');
  await assertChangeable(ctx.entityType, att.travelRequestId
    ? await prisma.travelRequest.findUnique({ where: { id: att.travelRequestId } })
    : await prisma.expenseReport.findUnique({ where: { id: ctx.reportId } }));
  await prisma.attachment.delete({ where: { id: att.id } });
  fs.rmSync(path.join(uploadDir, path.basename(att.storedName)), { force: true });
  if (ctx.reportId) await recalc(ctx.reportId);
  await audit(user, 'attachment.deleted', ctx.entityType, att.travelRequestId || ctx.reportId, { file: att.originalName });
  return { ok: true };
}
