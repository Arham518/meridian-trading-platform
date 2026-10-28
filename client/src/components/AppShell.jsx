import { Suspense, useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, BarChart3, CandlestickChart, Radio, History, Database, UserCircle, ShieldCheck, Megaphone, Users, FileSpreadsheet, Settings, LogOut, Menu, X, ArrowUpRight, ArrowDownRight, MailWarning, ShieldAlert, CircleCheck, CircleX, Target, Download, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Logo from './Logo.jsx';
import TickerTape from './TickerTape.jsx';
import { Skeleton } from './ui.jsx';
import { useAuth } from '../store/auth.js';
import { useMarket } from '../store/market.js';
import { useSettings } from '../store/settings.js';
import { getToken, api } from '../lib/api.js';
import { pairLabel, fmtPrice, fmtSigned } from '../lib/format.js';

const NAV = [
  { group: 'Trade', items: [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/markets', label: 'Markets', icon: BarChart3 },
    { to: '/app/trade', label: 'Paper trading', icon: CandlestickChart },
  ] },
  { group: 'Signals', items: [
    { to: '/app/signals', label: 'Live signals', icon: Radio, end: true },
    { to: '/app/signals/history', label: 'Signal history', icon: History },
  ] },
  { group: 'Account', items: [
    { to: '/app/records', label: 'My records', icon: Database },
    { to: '/app/account', label: 'Account', icon: UserCircle },
  ] },
];
const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: ShieldCheck, end: true },
  { to: '/admin/signals', label: 'Manage signals', icon: Megaphone },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/records', label: 'All records', icon: FileSpreadsheet },
  { to: '/admin/email', label: 'Email', icon: Mail },
  { to: '/admin/settings', label: 'Site settings', icon: Settings },
];

function NavItem({ item, onClick }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onClick}
      className={({ isActive }) => clsx('group relative flex items-center gap-2.5 h-8 px-3 rounded-[3px] text-[0.8125rem] font-medium transition-colors', isActive ? 'bg-white/[0.06] text-ink' : 'text-mute hover:text-ink hover:bg-white/[0.03]')}>
      {({ isActive }) => (<>
        {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent" />}
        <item.icon size={15} strokeWidth={1.75} className={isActive ? 'text-accent-2' : ''} />{item.label}
      </>)}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const user = useAuth((s) => s.user); const logout = useAuth((s) => s.logout); const nav = useNavigate();
  const siteName = useSettings((s) => s.siteName);
  const connected = useMarket((s) => s.connected); const status = useMarket((s) => s.status);
  const out = async () => { await logout(); nav('/'); toast.success('Signed out'); };
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 px-4 flex items-center border-b border-line shrink-0"><Link to="/app" onClick={onNavigate}><Logo name={siteName} /></Link></div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5" aria-label="Main">
        {NAV.map((g) => (
          <div key={g.group}><div className="label px-3 mb-1.5">{g.group}</div><div className="space-y-0.5">{g.items.map((i) => <NavItem key={i.to} item={i} onClick={onNavigate} />)}</div></div>
        ))}
        {user?.role === 'admin' && <div><div className="label px-3 mb-1.5 text-accent-2">Administration</div><div className="space-y-0.5">{ADMIN_NAV.map((i) => <NavItem key={i.to} item={i} onClick={onNavigate} />)}</div></div>}
      </nav>
      <div className="p-3 border-t border-line space-y-3 shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-mute px-1">
          <span className={clsx('size-1.5 rounded-full', connected ? 'bg-up live-dot !size-1.5' : 'bg-warn')} />
          <span>{connected ? 'Live feed' : 'Reconnecting'}</span>
          <span className="ml-auto badge badge-neutral !h-[18px] num">{status?.cryptoSource === 'binance' ? 'BINANCE' : 'SIM'}</span>
        </div>
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="size-8 rounded-[3px] border border-line-2 grid place-items-center text-[12px] font-semibold text-ink shrink-0">{user?.name?.[0]?.toUpperCase()}</div>
          <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{user?.name}</div><div className="text-[11px] text-mute capitalize">{user?.role}</div></div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={out} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function PageFallback() {
  return <div className="p-6 space-y-4"><Skeleton className="h-9 w-64" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-80" /></div>;
}

function AccountNotices() {
  const user = useAuth((s) => s.user); const [busy, setBusy] = useState(false); const [left, setLeft] = useState(0);
  const [hide2fa, setHide2fa] = useState(() => { try { return sessionStorage.getItem('meridian_hide_2fa') === '1'; } catch { return false; } });
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft((n) => n - 1), 1000); return () => clearTimeout(t); }, [left]);
  if (!user) return null;
  const resend = async () => {
    setBusy(true);
    try { await api('/auth/resend-verification', { method: 'POST' }); toast.success('Verification email sent'); setLeft(60); }
    catch (e) { if (e.retryAfter) setLeft(e.retryAfter); toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      {!user.emailVerified && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-accent/40 bg-accent/[0.06] rounded-md px-3.5 py-2.5 text-[13px]">
          <MailWarning size={16} className="text-accent-2 shrink-0" />
          <span className="min-w-0 flex-1">Confirm <b className="font-semibold">{user.email}</b> to open the signals desk and place paper trades. We sent you a link.</span>
          <button className="btn btn-ghost btn-sm" onClick={resend} disabled={busy || left > 0}>{left > 0 ? `Resend in ${left}s` : 'Resend email'}</button>
        </div>
      )}
      {user.role === 'admin' && !user.twoFactorEnabled && !hide2fa && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-line-2 rounded-md px-3.5 py-2.5 text-[13px]">
          <ShieldAlert size={16} className="text-accent-2 shrink-0" />
          <span className="min-w-0 flex-1">Administrator accounts should use two-factor authentication.</span>
          <Link to="/app/account#security" className="btn btn-ghost btn-sm">Set up 2FA</Link>
          <button className="btn btn-ghost btn-sm btn-icon !border-transparent" aria-label="Dismiss for this session" onClick={() => { setHide2fa(true); try { sessionStorage.setItem('meridian_hide_2fa', '1'); } catch { /* ignore */ } }}><X size={14} /></button>
        </div>
      )}
    </>
  );
}

export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation(); const nav = useNavigate(); const outlet = useOutlet();
  const token = useAuth((s) => s.user?.id);
  const startLive = useMarket((s) => s.startLive); const stopLive = useMarket((s) => s.stopLive); const loadWatch = useMarket((s) => s.loadWatchlist);
  const siteName = useSettings((s) => s.siteName);

  useEffect(() => {
    if (!token) return undefined;
    startLive({
      onSignalNew: (s) => toast.custom((tt) => (
        <motion.button initial={{ opacity: 0, y: -8 }} animate={{ opacity: tt.visible ? 1 : 0, y: 0 }} transition={{ duration: 0.2 }}
          onClick={() => { toast.dismiss(tt.id); nav('/app/signals'); }}
          className="frost flex items-stretch text-left w-[min(360px,calc(100vw-2rem))] rounded-md overflow-hidden">
          <span className={clsx('w-1 shrink-0', s.direction === 'BUY' ? 'bg-up' : 'bg-down')} />
          <span className="p-3 pr-4 min-w-0">
            <span className="label !text-accent-2 block">New signal</span>
            <span className="font-semibold text-sm block mt-0.5">{s.direction} {pairLabel(s.pair)} <span className="num text-mute font-normal">@ {fmtPrice(s.entry)}</span></span>
            <span className="text-[11px] text-mute num block mt-0.5">SL {fmtPrice(s.stopLoss)} / TP1 {fmtPrice(s.tp1)}</span>
          </span>
        </motion.button>
      ), { duration: 8000, position: 'top-right' }),
      onSignalUpdate: (s) => { if (s.status !== 'active') toast(`${pairLabel(s.pair)} signal: ${s.status === 'hit_sl' ? 'stopped out' : s.status === 'cancelled' ? 'cancelled' : 'target hit'}`, { icon: s.status.startsWith('hit_tp') ? <CircleCheck size={16} className="text-up" /> : s.status === 'hit_sl' ? <CircleX size={16} className="text-down" /> : null }); },
      onTrade: (e) => toast(`${e.type === 'order_filled' ? 'Limit order filled' : e.type === 'stop_loss' ? 'Stop loss hit' : 'Take profit hit'}: ${e.side} ${pairLabel(e.symbol)}${e.pnl != null ? ` (${fmtSigned(e.pnl)} USD)` : ''}`, { icon: e.type === 'take_profit' ? <Target size={16} className="text-up" /> : e.type === 'stop_loss' ? <CircleX size={16} className="text-down" /> : <Download size={16} /> }),
    });
    loadWatch();
    return () => stopLive();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setDrawer(false); window.scrollTo({ top: 0 }); }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[248px] rail z-40"><SidebarContent /></aside>

      {/* mobile header */}
      <header className="lg:hidden sticky top-0 z-40 h-14 px-4 flex items-center justify-between frost !rounded-none !border-x-0 !border-t-0">
        <Link to="/app"><Logo name={siteName} size={28} /></Link>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}><Menu size={18} /></button>
      </header>
      <AnimatePresence>
        {drawer && (
          <motion.div className="lg:hidden fixed inset-0 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-hidden />
            <motion.aside role="dialog" aria-label="Menu" className="absolute inset-y-0 left-0 w-[284px] max-w-[86vw] rail" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 340, damping: 34 }}>
              <button className="btn btn-ghost btn-sm btn-icon absolute right-3 top-4 z-10" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={16} /></button>
              <SidebarContent onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky top-14 lg:top-0 z-30"><TickerTape /></div>
      <main className="px-4 sm:px-6 py-4 sm:py-6 max-w-[1680px] mx-auto">
        <AccountNotices />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="px-6 pb-8 text-center text-[11px] text-dim max-w-3xl mx-auto">
        Trading involves risk. Signals are educational and not financial advice. Paper trading uses virtual money. Crypto prices come from Binance public data when reachable; other instruments are simulated and labelled SIM.
      </footer>
    </div>
  );
}
