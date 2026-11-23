import fs from 'node:fs';
import * as svc from './attachments.service.js';

export const upload = async (req, res) => res.status(201).json(await svc.upload(req.user, req.files ?? [], req.body));

export const download = async (req, res) => {
  const { att, file } = await svc.getForDownload(req.user, req.params.id);
  res.setHeader('Content-Type', att.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(att.originalName)}"`);
  fs.createReadStream(file).pipe(res);
};

export const remove = async (req, res) => res.json(await svc.remove(req.user, req.params.id));
