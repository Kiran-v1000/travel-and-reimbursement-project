import * as svc from './approvals.service.js';

export const inbox = async (req, res) => res.json(await svc.inbox(req.user));
export const history = async (req, res) => res.json(await svc.history(req.user));
export const bulkApprove = async (req, res) => res.json(await svc.bulkApprove(req.user, req.body.stepIds, req.body.comment));
export const act = async (req, res) => res.json(await svc.act(req.user, req.params.stepId, req.body.action, req.body.comment));
