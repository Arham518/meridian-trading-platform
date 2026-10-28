import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, BarChart3, CandlestickChart, Radio, History, Database, UserCircle, ShieldCheck, Megaphone, Users, FileSpreadsheet, Settings, LogOut, Menu, X, ArrowUpRight, ArrowDownRight, MailWarning, ShieldAlert, CircleCheck, CircleX, Target, Download, Mail, Search, Bell, ChevronDown, LineChart, MoreHorizontal, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, ArrowLeft, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Logo, { LogoTile } from './Logo.jsx';
import TickerTape from './TickerTape.jsx';
import { Skeleton } from './ui.jsx';
import AdSlot from './AdSlot.jsx';
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

/** Sidebar width modes, remembered per browser: 'open' (icons + labels), 'mini' (icons only), 'hidden'. */
const RAIL_KEY = 'meridian_rail';
export function useRail() {
  const [mode, setMode] = useState(() => {
    try { const v = localStorage.getItem(RAIL_KEY); if (v === 'open' || v === 'mini' || v === 'hidden') return v; } catch { /* private mode */ }
    return typeof window !== 'undefined' && window.innerWidth < 1280 ? 'mini' : 'open';
  });
  const set = (m) => { setMode(m); try { localStorage.setItem(RAIL_KEY, m); } catch { /* ignore */ } };
  return [mode, set];
}

function NavItem({ item, onClick, slim }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onClick} title={slim ? item.label : undefined} aria-label={slim ? item.label : undefined}
      className={({ isActive }) => clsx('rail-item flex items-center gap-3 h-12 text-[0.9375rem] font-medium', slim ? 'w-12 justify-center mx-auto' : 'px-4', isActive && 'is-active')}>
      <item.icon size={18} strokeWidth={1.9} className="shrink-0" />
      {!slim && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

function SidebarContent({ onNavigate, slim = false, onToggle, admin = false }) {
  const user = useAuth((s) => s.user); const logout = useAuth((s) => s.logout); const nav = useNavigate();
  const siteName = useSettings((s) => s.siteName);
  const connected = useMarket((s) => s.connected); const status = useMarket((s) => s.status);
  const out = async () => { await logout(); nav('/'); toast.success('Signed out'); };
  const group = (t, extra) => (slim ? <div className="mx-auto my-2 w-7 border-t border-ink/15" aria-hidden /> : <div className={clsx('rail-label px-4 mb-2.5 text-[0.75rem] font-semibold uppercase tracking-[0.1em]', extra)}>{t}</div>);
  const adminBlock = user?.role === 'admin' && <div>{group(admin ? 'Admin panel' : 'Administration', '!text-accent-2')}<div className="space-y-1.5">{ADMIN_NAV.map((i) => <NavItem key={i.to} item={i} onClick={onNavigate} slim={slim} />)}</div></div>;
  return (
    <div className="flex flex-col h-full text-ink">
      <div className={clsx('flex shrink-0 relative', slim ? 'flex-col items-center gap-3 pt-5 pb-2' : 'h-[4.75rem] items-center px-5')}>
        <Link to={admin ? '/admin' : '/app'} onClick={onNavigate} aria-label={`${siteName} ${admin ? 'admin' : 'dashboard'}`} className="rounded-full">
          {slim ? <span className="grid place-items-center size-12 rounded-full bg-white/70 border border-white shadow-[0_6px_16px_-10px_rgba(11,20,36,.4)]"><LogoTile size={30} /></span> : <Logo name={siteName} />}
        </Link>
        {onToggle && (
          <button type="button" onClick={onToggle} data-testid="rail-toggle" aria-label={slim ? 'Expand sidebar' : 'Collapse sidebar'} title={slim ? 'Expand sidebar' : 'Collapse sidebar'}
            className={clsx('grid place-items-center size-8 rounded-full bg-white/70 border border-white text-ink hover:bg-white transition-colors shadow-[0_4px_12px_-8px_rgba(11,20,36,.5)]', !slim && 'ml-auto')}>
            {slim ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
      </div>
      <nav className={clsx('flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-6 [scrollbar-width:none]', slim ? 'px-2' : 'px-4')} aria-label="Main">
        {admin && adminBlock}
        {admin && <div>{group('Trading app')}<NavItem item={{ to: '/app', label: 'Back to trading app', icon: ArrowLeft, end: true }} onClick={onNavigate} slim={slim} /></div>}
        {!admin && NAV.map((g) => (
          <div key={g.group}>{group(g.group)}<div className="space-y-1.5">{g.items.map((i) => <NavItem key={i.to} item={i} onClick={onNavigate} slim={slim} />)}</div></div>
        ))}
        {!admin && adminBlock}
      </nav>
      {!slim ? (
        <div className="p-4 space-y-3 shrink-0">
          <div className="flex items-center gap-2 text-[0.8125rem] text-mute px-2">
            <span className={clsx('size-1.5 rounded-full', connected ? 'bg-up live-dot !size-1.5' : 'bg-warn')} />
            <span>{connected ? 'Live feed' : 'Reconnecting'}</span>
            <span className="ml-auto rounded-full border border-ink/15 bg-white/50 px-2 h-6 grid place-items-center num text-[0.75rem]">{status?.cryptoSource === 'binance' ? 'BINANCE' : 'SIM'}</span>
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-2xl bg-white/55 border border-white/80">
            <Avatar name={user?.name} />
            <div className="min-w-0 flex-1"><div className="text-[0.9375rem] font-medium truncate">{user?.name}</div><div className="text-[0.8125rem] text-mute capitalize">{user?.role}</div></div>
            <button className="grid place-items-center size-9 rounded-full hover:bg-white" onClick={out} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
          </div>
        </div>
      ) : <div className="p-3 flex justify-center"><button className="grid place-items-center size-11 rounded-full bg-white/45 border border-white/70 hover:bg-white" onClick={out} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></div>}
    </div>
  );
}

const Avatar = ({ name, size = 'size-9' }) => (
  <span className={clsx(size, 'rounded-full grid place-items-center text-[0.9375rem] font-semibold text-white shrink-0 bg-[linear-gradient(135deg,#3b7bf0,#0f2a66)] ring-2 ring-white/10')} aria-hidden>{name?.[0]?.toUpperCase()}</span>
);

/** Symbol search in the top bar: type a pair or a name, Enter opens it in the terminal. "/" focuses it. */
function TopSearch() {
  const quotes = useMarket((s) => s.quotes); const order = useMarket((s) => s.order); const nav = useNavigate();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0); const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); ref.current?.focus(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, []);
  const res = useMemo(() => {
    const t = q.trim().toLowerCase().replace('/', '');
    if (!t) return [];
    return order.map((s) => quotes[s]).filter((x) => x && (x.symbol.toLowerCase().includes(t) || (x.name || '').toLowerCase().includes(t))).slice(0, 6);
  }, [q, quotes, order]);
  const go = (sym) => { setQ(''); setOpen(false); ref.current?.blur(); nav(`/app/trade/${sym}`); };
  return (
    <div className="relative w-full max-w-[28rem]">
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
      <input ref={ref} className="input !h-10 !pl-10 !pr-10 !rounded-xl !bg-panel-2" placeholder="Search markets, e.g. BTC, EUR/USD, gold" aria-label="Search markets"
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, res.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); } if (e.key === 'Enter' && res[hi]) go(res[hi].symbol); if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }}
        role="combobox" aria-expanded={open && res.length > 0} aria-controls="top-search-list" aria-autocomplete="list" />
      <kbd className="hidden md:grid absolute right-3 top-1/2 -translate-y-1/2 place-items-center h-5 min-w-5 px-1 rounded-md border border-line-2 text-[0.75rem] text-dim font-mono">/</kbd>
      {open && res.length > 0 && (
        <ul id="top-search-list" role="listbox" className="absolute left-0 right-0 top-12 glass glass-strong !rounded-xl p-1.5 z-50">
          {res.map((x, i) => (
            <li key={x.symbol} role="option" aria-selected={i === hi}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(x.symbol)} onMouseEnter={() => setHi(i)}
                className={clsx('w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left', i === hi && 'bg-ink/[0.05]')}>
                <span className="min-w-0"><span className="text-[0.9375rem] font-semibold block">{pairLabel(x.symbol)}</span><span className="text-[0.8125rem] text-mute block truncate">{x.name}</span></span>
                <span className="text-right shrink-0"><span className="num text-[0.9375rem] block">{fmtPrice(x.price, x.decimals)}</span><span className={clsx('num text-[0.8125rem]', x.changePct >= 0 ? 'up' : 'down')}>{x.changePct >= 0 ? '+' : ''}{x.changePct?.toFixed(2)}%</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bell: number of signal events since the member last opened the signals page. */
function SignalBell() {
  const tick = useMarket((s) => s.signalTick); const loc = useLocation();
  const [seen, setSeen] = useState(tick);
  useEffect(() => { if (loc.pathname.startsWith('/app/signals')) setSeen(tick); }, [loc.pathname, tick]);
  const n = Math.max(0, tick - seen);
  return (
    <Link to="/app/signals" className="btn btn-ghost btn-icon !rounded-xl relative" aria-label={n ? `${n} new signal update${n === 1 ? '' : 's'}` : 'Signals'} title="Signals">
      <Bell size={17} />
      {n > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-down text-white text-[0.75rem] font-bold grid place-items-center num">{n > 9 ? '9+' : n}</span>}
    </Link>
  );
}

function UserMenu() {
  const user = useAuth((s) => s.user); const logout = useAuth((s) => s.logout); const nav = useNavigate();
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useEffect(() => { if (!open) return undefined; const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const out = async () => { await logout(); nav('/'); toast.success('Signed out'); };
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-xl hover:bg-ink/[0.04]" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu">
        <Avatar name={user?.name} />
        <span className="hidden md:block text-left leading-tight"><span className="text-[0.9375rem] font-semibold block max-w-[140px] truncate">{user?.name}</span><span className="text-[0.8125rem] text-mute capitalize block">{user?.role}</span></span>
        <ChevronDown size={14} className="text-mute hidden md:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-56 glass glass-strong !rounded-xl p-1.5 z-50">
          <div className="px-3 py-2 border-b border-line mb-1"><div className="text-[0.9375rem] font-semibold truncate">{user?.name}</div><div className="text-[0.8125rem] text-mute truncate">{user?.email}</div></div>
          {[['/app/account', 'Account and security', UserCircle], ['/app/records', 'My records', Database], ...(user?.role === 'admin' ? [['/admin', 'Admin panel', ShieldCheck]] : [])].map(([to, l, I]) => (
            <Link key={to} role="menuitem" to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.9375rem] hover:bg-ink/[0.05]"><I size={15} className="text-mute" />{l}</Link>
          ))}
          <button role="menuitem" onClick={out} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.9375rem] text-down hover:bg-down/[0.07]"><LogOut size={15} />Sign out</button>
        </div>
      )}
    </div>
  );
}

const BOTTOM = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/markets', label: 'Markets', icon: BarChart3 },
  { to: '/app/signals', label: 'Signals', icon: Radio, end: true },
  { to: '/app/records', label: 'History', icon: History },
  { to: '/app/account', label: 'Account', icon: UserCircle },
];
const BOTTOM_ADMIN = [
  { to: '/admin', label: 'Overview', icon: ShieldCheck, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/signals', label: 'Signals', icon: Megaphone },
  { to: '/admin/email', label: 'Email', icon: Mail },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

/** Mobile: floating rounded glass bar (thumb reach). The full menu stays in the top-bar drawer. */
function BottomNav({ admin }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 pointer-events-none" aria-label="Quick navigation">
      <div className="on-dark pointer-events-auto mx-auto max-w-md grid grid-cols-5 rounded-[26px] bg-[linear-gradient(160deg,rgba(40,74,130,.78),rgba(8,20,43,.86))] backdrop-blur-xl border border-white/15 shadow-[0_18px_40px_-12px_rgba(8,20,43,.6),inset_0_1px_0_rgba(255,255,255,.18)] px-1.5 py-1.5">
        {(admin ? BOTTOM_ADMIN : BOTTOM).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => clsx('flex flex-col items-center justify-center gap-0.5 h-[52px] rounded-[20px] text-[0.8125rem] font-medium transition-colors', isActive ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)]' : 'text-[#c4d1e6] hover:text-white')}>
            {({ isActive }) => <><i.icon size={19} strokeWidth={1.8} className={isActive ? 'text-[#9cc3ff]' : ''} />{i.label}</>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function LiveState() {
  const connected = useMarket((s) => s.connected);
  return (
    <span className={clsx('hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-full text-[0.875rem] font-medium border', connected ? 'border-up/25 bg-up/[0.07] text-up' : 'border-line-2 text-mute')}>
      <span className={clsx('size-1.5 rounded-full', connected ? 'bg-up live-dot' : 'bg-warn')} />{connected ? 'Live' : 'Connecting'}
    </span>
  );
}

function PageFallback() {
  return <div className="space-y-4"><Skeleton className="h-9 w-64" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-80" /></div>;
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
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-accent/25 bg-accent-soft rounded-xl px-4 py-3 text-[0.9375rem]">
          <MailWarning size={16} className="text-accent-2 shrink-0" />
          <span className="min-w-0 flex-1">Confirm <b className="font-semibold">{user.email}</b> to open the signals desk and place paper trades. We sent you a link.</span>
          <button className="btn btn-ghost btn-sm" onClick={resend} disabled={busy || left > 0}>{left > 0 ? `Resend in ${left}s` : 'Resend email'}</button>
        </div>
      )}
      {user.role === 'admin' && !user.twoFactorEnabled && !hide2fa && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-panel rounded-xl px-4 py-3 text-[0.9375rem] shadow-[var(--shadow-card)]">
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
  const [rail, setRail] = useRail();
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
          className="frost glass-strong flex items-stretch text-left w-[min(360px,calc(100vw-2rem))] rounded-xl overflow-hidden">
          <span className={clsx('w-1 shrink-0', s.direction === 'BUY' ? 'bg-up' : 'bg-down')} />
          <span className="p-3 pr-4 min-w-0">
            <span className="label !text-accent-2 block">New signal</span>
            <span className="font-semibold text-sm block mt-0.5">{s.direction} {pairLabel(s.pair)} <span className="num text-mute font-normal">@ {fmtPrice(s.entry)}</span></span>
            <span className="text-[0.8125rem] text-mute num block mt-0.5">SL {fmtPrice(s.stopLoss)} / TP1 {fmtPrice(s.tp1)}</span>
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
  const admin = location.pathname.startsWith('/admin');
  const slim = rail === 'mini';
  const pad = rail === 'hidden' ? 'lg:pl-0' : slim ? 'lg:pl-[6.5rem]' : 'lg:pl-[17rem]';

  return (
    <div className={clsx('min-h-dvh transition-[padding] duration-300', pad)} data-rail={rail}>
      {rail !== 'hidden' && (
        <aside className={clsx('hidden lg:block fixed z-40 inset-y-0 left-0 rail rounded-r-[30px] transition-[width] duration-300', slim ? 'w-[5.5rem]' : 'w-[16rem]')} data-testid="sidebar">
          <SidebarContent slim={slim} admin={admin} onToggle={() => setRail(slim ? 'open' : 'mini')} />
        </aside>
      )}

      {/* top bar: sidebar toggle, search (app) or title (admin), live state, notifications, account */}
      <header className="sticky top-0 z-40 h-16 px-4 sm:px-6 xl:px-10 flex items-center gap-3 frost !border-x-0 !border-t-0">
        <button className="hidden lg:grid btn btn-ghost btn-icon !rounded-full" onClick={() => setRail(rail === 'hidden' ? 'open' : 'hidden')} data-testid="rail-hide" aria-label={rail === 'hidden' ? 'Show sidebar' : 'Hide sidebar'} title={rail === 'hidden' ? 'Show sidebar' : 'Hide sidebar'}>
          {rail === 'hidden' ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <Link to={admin ? '/admin' : '/app'} className={clsx('shrink-0', rail === 'hidden' ? '' : 'lg:hidden')} aria-label={`${siteName} ${admin ? 'admin' : 'dashboard'}`}><Logo name={siteName} size={30} compact /></Link>
        {admin ? (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="badge badge-accent !h-7 !px-3 !rounded-full"><ShieldCheck size={13} />Admin panel</span>
            <Link to="/app" className="hidden md:inline-flex btn btn-ghost btn-sm !rounded-full"><ArrowLeft size={13} />Trading app</Link>
          </div>
        ) : <><div className="hidden sm:block flex-1 min-w-0"><TopSearch /></div><div className="sm:hidden flex-1" /></>}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!admin && <LiveState />}
          {!admin && <SignalBell />}
          <UserMenu />
          <button className="lg:hidden btn btn-ghost btn-icon !rounded-full" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}><Menu size={18} /></button>
        </div>
      </header>
      <AnimatePresence>
        {drawer && (
          <motion.div className="lg:hidden fixed inset-0 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-night/45 backdrop-blur-[6px]" onClick={() => setDrawer(false)} aria-hidden />
            <motion.aside role="dialog" aria-label="Menu" className="absolute inset-y-0 left-0 w-[19rem] max-w-[86vw] rail rounded-r-[28px] !bg-[linear-gradient(180deg,rgba(220,233,251,0.92),rgba(233,230,252,0.92))]" initial={{ x: -310 }} animate={{ x: 0 }} exit={{ x: -310 }} transition={{ type: 'spring', stiffness: 340, damping: 34 }}>
              <button className="absolute right-4 top-5 z-10 grid place-items-center size-9 rounded-full bg-white/80 border border-white text-ink hover:bg-white" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={16} /></button>
              <SidebarContent onNavigate={() => setDrawer(false)} admin={admin} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {!admin && <div className="sticky top-16 z-30"><TickerTape /></div>}
      <main className="px-4 sm:px-6 xl:px-10 py-6 sm:py-8 pb-32 lg:pb-10 max-w-[var(--page-max)] mx-auto">
        {!admin && <div className="sm:hidden mb-4"><TopSearch /></div>}
        <AccountNotices />
        {!admin && <AdSlot slot="top" className="mb-5" />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="px-6 pb-28 lg:pb-8 text-center text-[0.875rem] text-dim max-w-3xl mx-auto">
        <p>Trading involves risk. Signals are educational and not financial advice. Paper trading uses virtual money. Crypto prices come from Binance public data when reachable; other instruments are simulated and labelled SIM.</p>
        <p className="mt-2 space-x-3"><Link to="/terms" className="hover:text-ink underline underline-offset-2">Terms of Service</Link><Link to="/privacy" className="hover:text-ink underline underline-offset-2">Privacy Policy</Link><Link to="/risk" className="hover:text-ink underline underline-offset-2">Risk Disclosure</Link></p>
      </footer>
      <BottomNav admin={admin} />
    </div>
  );
}
