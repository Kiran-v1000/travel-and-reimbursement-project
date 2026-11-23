import * as svc from './finance.service.js';

export const queue = async (req, res) => res.json(await svc.queue(req.query));
export const payments = async (req, res) => res.json(await svc.payments(req.query));
export const decide = async (req, res) => res.json(await svc.decide(req.user, req.params.id, req.body));
export const recode = async (req, res) => res.json(await svc.recode(req.user, req.params.id, req.body));
export const recordPayment = async (req, res) => res.json(await svc.recordPayment(req.user, req.params.id, req.body));
