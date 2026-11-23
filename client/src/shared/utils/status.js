// One source of truth for status labels, tones and icons (never colour alone).
export const STATUS = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'pencil' },
  PENDING: { label: 'Awaiting approval', tone: 'info', icon: 'clock' },
  RETURNED: { label: 'Returned', tone: 'warn', icon: 'undo' },
  APPROVED: { label: 'Approved', tone: 'ok', icon: 'check' },
  REJECTED: { label: 'Rejected', tone: 'bad', icon: 'x' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral', icon: 'minus' },
  FINANCE_REVIEW: { label: 'Finance review', tone: 'brand', icon: 'landmark' },
  SCHEDULED: { label: 'Payment scheduled', tone: 'brand', icon: 'calendar' },
  PAID: { label: 'Paid', tone: 'ok', icon: 'wallet' },
  WAITING: { label: 'Up next', tone: 'neutral', icon: 'dot' },
  SKIPPED: { label: 'Skipped', tone: 'neutral', icon: 'skip' },
  CANCELLED: { label: 'Closed', tone: 'neutral', icon: 'minus' },
};

export const TONES = {
  neutral: 'bg-subtle text-muted ring-line',
  info: 'bg-info/10 text-info ring-info/20',
  warn: 'bg-warn/10 text-warn ring-warn/25',
  ok: 'bg-ok/10 text-ok ring-ok/20',
  bad: 'bg-bad/10 text-bad ring-bad/20',
  brand: 'bg-brand/10 text-brand-ink ring-brand/20',
};

export const EXPENSE_STAGES = ['DRAFT', 'PENDING', 'FINANCE_REVIEW', 'SCHEDULED', 'PAID'];
export const TRAVEL_STAGES = ['DRAFT', 'PENDING', 'APPROVED'];

export const ROLE_LABEL = { EMPLOYEE: 'Employee', MANAGER: 'Manager', FINANCE: 'Finance', ADMIN: 'Administrator', AUDITOR: 'Auditor' };

export const PAYMENT_METHODS = {
  PERSONAL_CARD: 'Personal card',
  CASH: 'Cash',
  UPI: 'UPI',
  CORPORATE_CARD: 'Corporate card',
  BANK_TRANSFER: 'Bank transfer',
  PAYROLL: 'With payroll',
  CHEQUE: 'Cheque',
};
