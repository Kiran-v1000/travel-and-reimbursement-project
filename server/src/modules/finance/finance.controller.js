import * as svc from './finance.service.js';
import * as exp from './finance.export.service.js';

export const queue = async (req, res) => res.json(await svc.queue(req.query));
export const payments = async (req, res) => res.json(await svc.payments(req.query));
export const decide = async (req, res) => res.json(await svc.decide(req.user, req.params.id, req.body));
export const recode = async (req, res) => res.json(await svc.recode(req.user, req.params.id, req.body));
export const recordPayment = async (req, res) => res.json(await svc.recordPayment(req.user, req.params.id, req.body));

export const exportPreview = async (req, res) => res.json(await exp.preview({ from: String(req.query.from ?? ''), to: String(req.query.to ?? '') }));
export const createExport = async (req, res) => res.status(201).json(await exp.createExport(req.user, req.body));
export const exportHistory = async (_req, res) => res.json(await exp.history());
export const downloadExport = async (req, res) => exp.download(req.user, req.params.id, res);
