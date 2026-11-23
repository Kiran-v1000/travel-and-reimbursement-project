import * as svc from './notifications.service.js';

export const list = async (req, res) => {
  const [items, unread] = await Promise.all([svc.list(req.user.id, req.query.unread === 'true'), svc.unreadCount(req.user.id)]);
  res.json({ items, unread });
};
export const markAllRead = async (req, res) => res.json(await svc.markAllRead(req.user.id));
export const markRead = async (req, res) => res.json(await svc.markRead(req.user.id, req.params.id));
