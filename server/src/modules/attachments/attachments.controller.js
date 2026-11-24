import fs from 'node:fs';
import * as svc from './attachments.service.js';

export const upload = async (req, res) => res.status(201).json(await svc.upload(req.user, req.files ?? [], req.body));

export const download = async (req, res) => {
  const { att, file } = await svc.getForDownload(req.user, req.params.id);
  res.setHeader('Content-Type', att.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Receipts are personal: never cached by browsers or proxies, never embeddable by other sites.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Shown inline, a file must not be able to run script in the app's origin. Images are fully
  // sandboxed; PDFs get a script-free policy (browsers refuse to render PDFs inside a sandbox).
  res.setHeader('Content-Security-Policy', att.mimeType === 'application/pdf'
    ? "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'"
    : "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'");
  const safeName = att.originalName.replace(/[^\w.\- ()]/g, '_');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(att.originalName)}`);
  fs.createReadStream(file).pipe(res);
};

export const remove = async (req, res) => res.json(await svc.remove(req.user, req.params.id));
