/**
 * Reference data shared by the demo seed and the production seed:
 * currencies, expense categories, default policy settings and approval rules.
 * Values are sensible starting points - Finance can change all of them in Administration.
 */

// [code, name, symbol, rate to INR] - administrator-maintained rates.
export const CURRENCIES = [
  ['INR', 'Indian Rupee', '₹', 1],
  ['USD', 'US Dollar', '$', 83.2],
  ['EUR', 'Euro', '€', 90.1],
  ['GBP', 'British Pound', '£', 105.4],
  ['SGD', 'Singapore Dollar', 'S$', 61.8],
  ['AED', 'UAE Dirham', 'AED', 22.65],
  ['JPY', 'Japanese Yen', '¥', 0.56],
];

// [code, name, icon, per-item limit (null = none), receipt required above, accounting ledger]
export const CATEGORIES = [
  ['AIRFARE', 'Airfare', 'plane', null, 0, 'Travel - Airfare'],
  ['RAIL', 'Train & bus', 'train', 10000, 300, 'Travel - Rail & Bus'],
  ['LODGING', 'Hotel & lodging', 'bed', 25000, 0, 'Travel - Lodging'],
  ['MEALS', 'Meals', 'utensils', 3000, 500, 'Travel - Meals'],
  ['TAXI', 'Taxi & local transport', 'car', 5000, 300, 'Local Conveyance'],
  ['VISA', 'Visa & travel fees', 'stamp', null, 0, 'Travel - Visa & Fees'],
  ['CLIENT', 'Client entertainment', 'wine', 10000, 500, 'Business Promotion'],
  ['INTERNET', 'Phone & internet', 'wifi', 2000, 500, 'Telephone & Internet'],
  ['MISC', 'Other business expense', 'receipt', 5000, 500, 'Miscellaneous Expenses'],
];

export const DEFAULT_SETTINGS = {
  baseCurrency: 'INR',
  leadDaysDomestic: 7,
  leadDaysInternational: 21,
  maxTripDays: 30,
  lodgingCapDomestic: 8000,
  lodgingCapInternational: 22000,
  mealsPerDiem: 2500,
  submissionDeadlineDays: 60,
  estimateTolerancePct: 10,
  approvalTimeoutHours: 48,
  escalationEnabled: true,
  resubmitRule: 'RESTART',
  emailNotifications: true,
  retentionYears: 8,
  // Purging is off until an administrator reviews the preview and switches it on.
  retentionAutoPurge: false,
  // Accounting export: payments are credited to this ledger; rounding / partial-payment
  // differences go to the adjustment ledger so every voucher balances.
  accountingBankLedger: 'Bank Account',
  accountingAdjustmentLedger: 'Reimbursement Adjustments',
  // Who the user guide tells people to contact when they are stuck (name, team or email).
  helpContact: 'your Finance team',
};

export const LEVELS = {
  manager: { label: 'Reporting manager', approvers: [{ type: 'MANAGER' }] },
  skip: { label: 'Skip-level manager', approvers: [{ type: 'SKIP_MANAGER' }] },
  head: { label: 'Department head', approvers: [{ type: 'DEPT_HEAD' }] },
  finance: { label: 'Finance controller', approvers: [{ type: 'ROLE', role: 'FINANCE' }] },
  ceo: { label: 'CEO', approvers: [{ type: 'TOP_OF_LINE' }] },
};

/**
 * Functional hierarchy: every request starts with the reporting manager; larger or
 * out-of-policy requests climb further, and ₹5,00,000+ goes up to the CEO.
 * Exception rules are always chosen first, so the CEO variants carry their own exception copies.
 */
export const CEO_THRESHOLD = 500000;
export function defaultRules(L = LEVELS) {
  return [
    { name: 'CEO approval: travel ₹5,00,000+ (exception)', entityType: 'TRAVEL', priority: 4, minAmount: CEO_THRESHOLD, onPolicyException: true, levels: [L.manager, L.head, L.finance, L.ceo] },
    { name: 'CEO approval: travel ₹5,00,000+', entityType: 'TRAVEL', priority: 8, minAmount: CEO_THRESHOLD, levels: [L.manager, L.head, L.finance, L.ceo] },
    { name: 'CEO approval: expenses ₹5,00,000+ (exception)', entityType: 'EXPENSE', priority: 4, minAmount: CEO_THRESHOLD, onPolicyException: true, levels: [L.manager, L.head, L.ceo] },
    { name: 'CEO approval: expenses ₹5,00,000+', entityType: 'EXPENSE', priority: 8, minAmount: CEO_THRESHOLD, levels: [L.manager, L.head, L.ceo] },
    { name: 'Travel policy exception', entityType: 'TRAVEL', priority: 5, onPolicyException: true, levels: [L.manager, L.head, L.finance] },
    { name: 'International travel', entityType: 'TRAVEL', priority: 10, travelType: 'INTERNATIONAL', levels: [L.manager, L.head, L.finance] },
    { name: 'High-value domestic travel', entityType: 'TRAVEL', priority: 20, travelType: 'DOMESTIC', minAmount: 75000, levels: [L.manager, L.skip] },
    { name: 'Standard travel', entityType: 'TRAVEL', priority: 100, levels: [L.manager] },
    { name: 'Expense policy exception', entityType: 'EXPENSE', priority: 5, onPolicyException: true, levels: [L.manager, L.head] },
    { name: 'High-value expense report', entityType: 'EXPENSE', priority: 20, minAmount: 50000, levels: [L.manager, L.head] },
    { name: 'Standard expense report', entityType: 'EXPENSE', priority: 100, levels: [L.manager] },
  ];
}

/** Strong-password rule for local (non-SSO) accounts. Returns an error message or null. */
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'at least 12 characters';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) return 'upper and lower case letters, a number and a symbol';
  return null;
}
