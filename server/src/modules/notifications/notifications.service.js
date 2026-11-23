import nodemailer from 'nodemailer';
import { prisma } from '../../db/pool.js';
import { env } from '../../config/env.js';

let transport = null;
if (env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function sendMail(to, subject, text, link) {
  if (!transport) return; // Email not configured - in-app only.
  const url = link ? `${env.CLIENT_URL}${link}` : env.CLIENT_URL;
  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      text: `${text}\n\nOpen: ${url}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#0f172a">
        <p>${escapeHtml(text)}</p>
        <p><a href="${escapeHtml(url)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Voyage</a></p></div>`,
    });
  } catch (err) {
    console.error('[mail] send failed', err.message);
  }
}

/** Create in-app notifications and (if configured) send email. Never throws. */
export async function notify(userIds, { type, title, body, link }) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type, title, body, link })) });
    const emailOn = await prisma.setting.findUnique({ where: { key: 'emailNotifications' } });
    if (emailOn?.value === false) return;
    const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { email: true } });
    await Promise.all(users.map((u) => sendMail(u.email, title, body, link)));
  } catch (err) {
    console.error('[notify] failed', err.message);
  }
}

export const list = (userId, onlyUnread) =>
  prisma.notification.findMany({
    where: { userId, ...(onlyUnread ? { read: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

export const unreadCount = (userId) => prisma.notification.count({ where: { userId, read: false } });

export const markRead = (userId, id) => prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });

export const markAllRead = (userId) => prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
