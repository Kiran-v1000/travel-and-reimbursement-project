import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plane, Receipt, CheckCircle2, Wallet } from 'lucide-react';
import { Logo } from './Logo.jsx';

const FEATURES = [
  { icon: Plane, title: 'Trips approved in hours', body: 'Smart routing sends each request to the right approvers.' },
  { icon: Receipt, title: 'Expenses without the chase', body: 'Drop in receipts and policy checks run as you type.' },
  { icon: Wallet, title: 'See every rupee move', body: 'Track each claim from submission to payment.' },
];

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0b0f24] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 animate-gradient-pan bg-[length:200%_200%] bg-[radial-gradient(1200px_600px_at_10%_10%,rgba(99,102,241,.45),transparent_60%),radial-gradient(900px_500px_at_90%_80%,rgba(168,85,247,.35),transparent_60%),radial-gradient(700px_400px_at_60%_30%,rgba(14,165,233,.22),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative z-10">
          <Logo invert />
        </div>

        <div className="relative z-10 my-auto max-w-md">
          <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-[40px] font-semibold leading-[1.08] tracking-tight">
            Business travel,
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">beautifully simple.</span>
          </motion.h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/65">Request trips, claim expenses and get reimbursed faster, with approvals your Finance team can trust.</p>

          <div className="mt-10 space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1, duration: 0.45 }} className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <f.icon className="h-4.5 w-4.5 h-[18px] w-[18px] text-indigo-200" />
                </span>
                <div>
                  <p className="text-[14px] font-medium">{f.title}</p>
                  <p className="text-[13px] text-white/55">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="relative z-10 flex animate-float items-center gap-3 self-start rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-md"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          <div className="text-[13px]">
            <p className="font-medium">EX-2026-0042 reimbursed</p>
            <p className="text-white/55">₹28,470 paid to your bank account</p>
          </div>
        </motion.div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
