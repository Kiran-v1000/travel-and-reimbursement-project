import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore, hasRole } from './store.js';
import { useSessionBootstrap, LoginPage, ChangePasswordPage } from '../features/auth/index.js';
import { MainLayout } from '../layouts/MainLayout.jsx';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { SkeletonRows } from '../shared/components/ui/primitives.jsx';

const DashboardPage = lazy(() => import('../features/dashboard/index.js').then((m) => ({ default: m.DashboardPage })));
const TravelListPage = lazy(() => import('../features/travel/index.js').then((m) => ({ default: m.TravelListPage })));
const TravelFormPage = lazy(() => import('../features/travel/index.js').then((m) => ({ default: m.TravelFormPage })));
const TravelDetailPage = lazy(() => import('../features/travel/index.js').then((m) => ({ default: m.TravelDetailPage })));
const ExpenseListPage = lazy(() => import('../features/expenses/index.js').then((m) => ({ default: m.ExpenseListPage })));
const ExpenseNewPage = lazy(() => import('../features/expenses/index.js').then((m) => ({ default: m.ExpenseNewPage })));
const ExpenseDetailPage = lazy(() => import('../features/expenses/index.js').then((m) => ({ default: m.ExpenseDetailPage })));
const ApprovalsPage = lazy(() => import('../features/approvals/index.js').then((m) => ({ default: m.ApprovalsPage })));
const FinancePage = lazy(() => import('../features/finance/index.js').then((m) => ({ default: m.FinancePage })));
const ReportsPage = lazy(() => import('../features/reports/index.js').then((m) => ({ default: m.ReportsPage })));
const AdminPage = lazy(() => import('../features/admin/index.js').then((m) => ({ default: m.AdminPage })));
const AuditPage = lazy(() => import('../features/audit/index.js').then((m) => ({ default: m.AuditPage })));
const ProfilePage = lazy(() => import('../features/profile/index.js').then((m) => ({ default: m.ProfilePage })));

function Guard({ roles, children }) {
  const { user, booting } = useAppStore();
  const location = useLocation();
  if (booting) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // A temporary password must be replaced before anything else is usable.
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (roles && !hasRole(user, ...roles)) return <Navigate to="/" replace />;
  return children;
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-pulse rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-glow" />
    </div>
  );
}

const PageFallback = () => (
  <div className="card">
    <SkeletonRows rows={6} />
  </div>
);

function Inner() {
  useSessionBootstrap();
  const user = useAppStore((s) => s.user);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>
      <Route
        element={
          <Guard>
            <MainLayout fallback={<PageFallback />} />
          </Guard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="travel" element={<TravelListPage />} />
        <Route path="travel/new" element={<TravelFormPage />} />
        <Route path="travel/:id" element={<TravelDetailPage />} />
        <Route path="travel/:id/edit" element={<TravelFormPage />} />
        <Route path="expenses" element={<ExpenseListPage />} />
        <Route path="expenses/new" element={<ExpenseNewPage />} />
        <Route path="expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="finance" element={<Guard roles={['FINANCE', 'ADMIN']}><FinancePage /></Guard>} />
        <Route path="reports" element={<Guard roles={['MANAGER', 'FINANCE', 'ADMIN', 'AUDITOR']}><ReportsPage /></Guard>} />
        <Route path="admin" element={<Guard roles={['ADMIN']}><AdminPage /></Guard>} />
        <Route path="audit" element={<Guard roles={['ADMIN', 'AUDITOR', 'FINANCE']}><AuditPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenLoader />}>
        <Inner />
      </Suspense>
    </BrowserRouter>
  );
}
