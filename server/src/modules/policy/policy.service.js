/**
 * Policy checks. Each flag: { code, severity: 'warning' | 'violation', message, lineId? }.
 * Violations are policy exceptions: they require a justification and may add approval levels.
 */
import { prisma } from '../../db/pool.js';
import { getSettings, num, daysBetween } from '../../shared/utils/index.js';

const fmt = (n, cur = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

export async function checkTravel(t) {
  const s = await getSettings();
  const flags = [];
  const lead = t.travelType === 'INTERNATIONAL' ? Number(s.leadDaysInternational ?? 21) : Number(s.leadDaysDomestic ?? 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToStart = daysBetween(today, t.startDate);
  if (daysToStart < lead) {
    flags.push({ code: 'LEAD_TIME', severity: 'violation', message: `Submitted ${Math.max(daysToStart, 0)} day(s) before travel; policy asks for ${lead} days for ${t.travelType.toLowerCase()} trips.` });
  }
  const tripDays = daysBetween(t.startDate, t.endDate) + 1;
  const maxDays = Number(s.maxTripDays ?? 30);
  if (tripDays > maxDays) flags.push({ code: 'TRIP_LENGTH', severity: 'violation', message: `Trip is ${tripDays} days; the limit is ${maxDays} days.` });
  const nights = Math.max(tripDays - 1, 1);
  const lodgingCap = Number((t.travelType === 'INTERNATIONAL' ? s.lodgingCapInternational : s.lodgingCapDomestic) ?? 0);
  if (lodgingCap && t.lodgingBase / nights > lodgingCap) {
    flags.push({ code: 'LODGING_CAP', severity: 'violation', message: `Lodging averages ${fmt(t.lodgingBase / nights)} per night; the cap is ${fmt(lodgingCap)}.` });
  }
  const mealsCap = Number(s.mealsPerDiem ?? 0);
  if (mealsCap && t.mealsBase / tripDays > mealsCap) {
    flags.push({ code: 'MEALS_PER_DIEM', severity: 'warning', message: `Meals average ${fmt(t.mealsBase / tripDays)} per day; the per-diem is ${fmt(mealsCap)}.` });
  }
  if (!t.purpose || t.purpose.trim().length < 15) flags.push({ code: 'PURPOSE', severity: 'warning', message: 'Add a clearer business purpose to speed up approval.' });
  return flags;
}

/** Run all expense checks for a report (and its lines). */
export async function checkExpense(report) {
  const s = await getSettings();
  const flags = [];
  const lines = report.lines ?? [];
  const cats = await prisma.expenseCategory.findMany();
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const deadline = Number(s.submissionDeadlineDays ?? 60);
  const now = new Date();

  // Other lines by the same employee, for duplicate detection across reports.
  const others = await prisma.expenseLine.findMany({
    where: { report: { employeeId: report.employeeId, status: { notIn: ['WITHDRAWN', 'REJECTED'] } }, reportId: { not: report.id ?? '' } },
    select: { id: true, date: true, amount: true, merchant: true, report: { select: { code: true } } },
  });

  lines.forEach((l, i) => {
    const cat = catById[l.categoryId];
    const label = `Line ${i + 1} (${l.merchant || 'expense'})`;
    const base = num(l.baseAmount);
    if (cat?.perItemLimit != null && base > num(cat.perItemLimit)) {
      flags.push({ code: 'CATEGORY_LIMIT', severity: 'violation', lineId: l.id, message: `${label} is ${fmt(base)}, above the ${cat.name} limit of ${fmt(num(cat.perItemLimit))}.` });
    }
    const hasReceipt = (l.attachments?.length ?? l._count?.attachments ?? 0) > 0;
    if (!hasReceipt && base >= num(cat?.receiptThreshold ?? 500)) {
      flags.push({ code: 'MISSING_RECEIPT', severity: 'violation', lineId: l.id, message: `${label} needs a receipt (required above ${fmt(num(cat?.receiptThreshold ?? 500))}).` });
    }
    const age = daysBetween(l.date, now);
    if (age > deadline) flags.push({ code: 'OUT_OF_PERIOD', severity: 'violation', lineId: l.id, message: `${label} is ${age} days old; claims must be filed within ${deadline} days.` });
    if (new Date(l.date) > now) flags.push({ code: 'FUTURE_DATE', severity: 'violation', lineId: l.id, message: `${label} is dated in the future.` });

    const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
    const norm = (m) => (m || '').trim().toLowerCase();
    const dupInReport = lines.some((o, j) => j < i && sameDay(o.date, l.date) && num(o.amount) === num(l.amount) && norm(o.merchant) === norm(l.merchant));
    const dupElsewhere = others.find((o) => sameDay(o.date, l.date) && num(o.amount) === num(l.amount) && norm(o.merchant) === norm(l.merchant));
    if (dupInReport || dupElsewhere) {
      flags.push({ code: 'DUPLICATE', severity: 'warning', lineId: l.id, message: `${label} looks like a duplicate${dupElsewhere ? ` of a line in ${dupElsewhere.report.code}` : ' of another line in this report'}.` });
    }

    if (report.travelRequest) {
      const start = new Date(report.travelRequest.startDate);
      const end = new Date(report.travelRequest.endDate);
      start.setDate(start.getDate() - 2);
      end.setDate(end.getDate() + 2);
      if (new Date(l.date) < start || new Date(l.date) > end) {
        flags.push({ code: 'OUTSIDE_TRIP', severity: 'warning', lineId: l.id, message: `${label} falls outside the trip dates of ${report.travelRequest.code}.` });
      }
    }
  });

  if (report.travelRequest) {
    const total = lines.reduce((a, l) => a + num(l.baseAmount), 0);
    const est = num(report.travelRequest.estTotalBase);
    const tolerance = Number(s.estimateTolerancePct ?? 10);
    if (est > 0 && total > est * (1 + tolerance / 100)) {
      flags.push({ code: 'OVER_ESTIMATE', severity: 'violation', message: `Total ${fmt(total)} exceeds the approved estimate of ${fmt(est)} by more than ${tolerance}%.` });
    }
  }
  return flags;
}

export const hasViolation = (flags) => flags.some((f) => f.severity === 'violation');
