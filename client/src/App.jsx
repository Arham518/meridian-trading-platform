import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './store/auth.js';
import { useSettings } from './store/settings.js';
import AppShell from './components/AppShell.jsx';
import { Spinner } from './components/ui.jsx';
import { LogoMark } from './components/Logo.jsx';

// every route is code-split
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Login = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.ResetPassword })));
const VerifyEmail = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.VerifyEmail })));
const ConfirmEmailChange = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.ConfirmEmailChange })));
const ResendVerification = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.ResendVerification })));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Markets = lazy(() => import('./pages/Markets.jsx'));
const Trade = lazy(() => import('./pages/Trade.jsx'));
const Signals = lazy(() => import('./pages/Signals.jsx'));
const SignalHistory = lazy(() => import('./pages/SignalHistory.jsx'));
const Records = lazy(() => import('./pages/Records.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx'));
const AdminSignals = lazy(() => import('./pages/admin/AdminSignals.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminRecords = lazy(() => import('./pages/admin/AdminRecords.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'));
const AdminEmail = lazy(() => import('./pages/admin/AdminEmail.jsx'));

const Splash = () => <div className="min-h-dvh grid place-items-center"><div className="flex flex-col items-center gap-4"><LogoMark size={40} /><Spinner className="text-mute" /></div></div>;

function Protected({ admin, children }) {
  const { user, ready } = useAuth(); const loc = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (admin && user.role !== 'admin') return <Navigate to="/app" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="min-h-[60dvh] grid place-items-center text-center px-6">
      <div><p className="num text-6xl font-semibold text-accent-2">404</p><h1 className="text-xl font-semibold mt-3">Page not found</h1><p className="text-mute mt-2">The page you are looking for does not exist or has moved.</p><Link to="/" className="btn btn-primary mt-6">Back to home</Link></div>
    </div>
  );
}

export default function App() {
  const init = useAuth((s) => s.init); const ready = useAuth((s) => s.ready); const loadSettings = useSettings((s) => s.load);
  useEffect(() => { init(); loadSettings(); }, [init, loadSettings]);
  return (
    <>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/" element={ready ? <Landing /> : <Splash />} />
          <Route path="/login" element={ready ? <Login /> : <Splash />} />
          <Route path="/register" element={ready ? <Register /> : <Splash />} />
          <Route path="/forgot-password" element={ready ? <ForgotPassword /> : <Splash />} />
          <Route path="/reset-password" element={ready ? <ResetPassword /> : <Splash />} />
          <Route path="/verify-email" element={ready ? <VerifyEmail /> : <Splash />} />
          <Route path="/confirm-email" element={ready ? <ConfirmEmailChange /> : <Splash />} />
          <Route path="/resend-verification" element={ready ? <ResendVerification /> : <Splash />} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route path="/app" element={<Dashboard />} />
            <Route path="/app/markets" element={<Markets />} />
            <Route path="/app/trade" element={<Trade />} />
            <Route path="/app/trade/:symbol" element={<Trade />} />
            <Route path="/app/signals" element={<Signals />} />
            <Route path="/app/signals/history" element={<SignalHistory />} />
            <Route path="/app/records" element={<Records />} />
            <Route path="/app/account" element={<Account />} />
          </Route>
          <Route element={<Protected admin><AppShell /></Protected>}>
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/signals" element={<AdminSignals />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/records" element={<AdminRecords />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/email" element={<AdminEmail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" gutter={10} toastOptions={{
        duration: 3500,
        style: { background: 'rgba(22,22,21,0.82)', color: '#ecebe6', border: '1px solid rgba(236,232,220,0.14)', backdropFilter: 'blur(14px)', fontSize: '0.875rem', borderRadius: '6px' },
        success: { iconTheme: { primary: '#2fbf85', secondary: '#07090d' } }, error: { iconTheme: { primary: '#ec5560', secondary: '#07090d' } },
      }} />
    </>
  );
}
