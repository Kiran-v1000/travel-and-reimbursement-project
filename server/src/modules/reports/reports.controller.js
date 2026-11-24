import { audit } from '../audit/audit.service.js';
import * as svc from './reports.service.js';

const KINDS = ['approvals', 'exceptions', 'categories'];

export const dashboard = async (req, res) => res.json(await svc.dashboard(req.user));
export const analytics = async (req, res) => res.json(await svc.analytics(req.user, req.query));
export const exportAnalytics = async (req, res) => {
  const kind = KINDS.includes(req.params.kind) ? req.params.kind : 'categories';
  const csv = await svc.exportAnalytics(req.user, req.query, kind);
  await audit(req.user, 'report.exported', 'REPORT', null, { kind, filters: req.query }, { strict: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-report.csv"`);
  res.send(csv);
};
