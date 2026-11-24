import { LayoutDashboard, Plane, Receipt, Inbox, Landmark, BarChart3, Settings2, ShieldCheck, Archive, Network, LifeBuoy } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/travel', label: 'Travel', icon: Plane },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/approvals', label: 'Approvals', icon: Inbox, badge: 'approvals' },
  { to: '/org', label: 'Org chart', icon: Network },
  { to: '/finance', label: 'Finance', icon: Landmark, roles: ['FINANCE', 'ADMIN'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR'] },
  { to: '/audit', label: 'Audit trail', icon: ShieldCheck, roles: ['ADMIN', 'AUDITOR', 'FINANCE'] },
  { to: '/compliance', label: 'Retention & holds', icon: Archive, roles: ['ADMIN', 'FINANCE', 'AUDITOR'] },
  { to: '/admin', label: 'Administration', icon: Settings2, roles: ['ADMIN'] },
  { to: '/help', label: 'Help', icon: LifeBuoy },
];
