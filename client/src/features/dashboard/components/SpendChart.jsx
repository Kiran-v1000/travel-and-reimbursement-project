import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, money } from '../../../shared/utils/format.js';

const monthLabel = (m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short' });

/** Fill the last 6 months so empty months still show. */
function series(trend = []) {
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ month: key, total: trend.find((t) => t.month === key)?.total ?? 0 });
  }
  return out;
}

function TooltipBox({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="text-[11.5px] text-muted">{new Date(`${p.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
      <p className="num text-[14px] font-semibold">{money(p.total)}</p>
    </div>
  );
}

export function SpendChart({ trend }) {
  const data = series(trend);
  return (
    <div className="h-[220px]" role="img" aria-label={`Spend over the last six months: ${data.map((d) => `${monthLabel(d.month)} ${money(d.total)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 4" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11.5 }} />
          <YAxis tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11.5 }} width={58} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: 'rgb(var(--brand))', strokeOpacity: 0.3 }} />
          <Area type="monotone" dataKey="total" stroke="rgb(var(--brand))" strokeWidth={2.5} fill="url(#spendFill)" animationDuration={900} activeDot={{ r: 5, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
