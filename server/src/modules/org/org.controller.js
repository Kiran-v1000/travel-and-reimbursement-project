import * as svc from './org.service.js';

export const chart = async (req, res) => res.json(await svc.chart(req.user, req.query.u ? String(req.query.u) : null));
export const roots = async (_req, res) => res.json(await svc.roots());
