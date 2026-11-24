import { audit, listAudit, verifyChain, exportAuditCsv } from './audit.service.js';

export const list = async (req, res) => res.json(await listAudit(req.query));
export const verify = async (_req, res) => res.json(await verifyChain());
export const exportCsv = async (req, res) => {
  const csv = await exportAuditCsv(req.query);
  await audit(req.user, 'audit.exported', 'AUDIT', null, { filters: req.query }, { strict: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(csv);
};
