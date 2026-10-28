import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Check, Minus } from 'lucide-react';
import clsx from 'clsx';
import Logo from './Logo.jsx';
import { useSettings } from '../store/settings.js';
import { useAuth } from '../store/auth.js';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { pairLabel, fmtPct, timeAgo } from '../lib/format.js';

/** Mirrors the server policy (server/src/validate.js). */
const COMMON = ['password', 'password1', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', '123456', '12345678', 'abc123', 'trading', 'meridian'];
export function passwordChecks(pw = '') {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return { len: pw.length >= 10, mix: classes >= 3, common: pw.length > 0 && !COMMON.some((w) => pw.toLowerCase().includes(w)), classes };
}
export const passwordOk = (pw) => { const c = passwordChecks(pw); return c.len && c.mix && c.common; };

/** field-level messages from a failed API call */
export function fieldErrors(e) {
  const out = {};
  (e?.details || []).forEach((d) => { if (d.field && !out[d.field]) out[d.field] = d.message; });
  return out;
}

export function PasswordField({ id, value, onChange, autoComplete, placeholder = 'Password', invalid, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} className={clsx('input !pr-10', invalid && '!border-down/60')} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} aria-invalid={invalid ? 'true' : undefined} {...rest} />
      <button type="button" tabIndex={-1} className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-icon !border-transparent" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </div>
  );
}

/** Live rule list + a 4-segment strength bar */
export function PasswordRules({ value }) {
  const c = passwordChecks(value);
  const score = value ? (c.len ? 1 : 0) + (c.classes >= 3 ? 1 : 0) + (c.classes >= 4 ? 1 : 0) + (c.len && value.length >= 14 ? 1 : 0) : 0;
  const rules = [[c.len, 'At least 10 characters'], [c.mix, 'Three of: lowercase, uppercase, number, symbol'], [c.common || !value, 'No common words such as "password"']];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={clsx('h-[3px] flex-1 rounded-[1px]', i < score ? (score < 3 ? 'bg-accent' : 'bg-up') : 'bg-line-2')} />)}</div>
      <ul className="mt-2 space-y-1">
        {rules.map(([ok, t]) => (
          <li key={t} className={clsx('flex items-center gap-1.5 text-[0.875rem]', value && ok ? 'text-up' : 'text-dim')}>{value && ok ? <Check size={12} /> : <Minus size={12} />}{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return <p role="alert" className="text-[0.9375rem] text-down border border-down/35 bg-down/[0.06] rounded-md px-3 py-2">{children}</p>;
}
export function FormNote({ children, tone }) {
  return <p role="status" className={clsx('text-[0.9375rem] border rounded-md px-3 py-2', tone === 'ok' ? 'text-up border-up/35 bg-up/[0.06]' : 'text-mute border-line-2')}>{children}</p>;
}

/** Full liquid-glass layout used by every sign-in / recovery page: blurred colour-light backdrop, one frosted card,
 *  and (on wide screens) a second glass card with real, public track-record rows. */
export function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  const siteName = useSettings((s) => s.siteName);
  const stats = useFetch(() => api('/stats'), []);
  const d = stats.data;
  return (
    <div className="min-h-dvh relative isolate text-white" data-testid="auth-glass">
      <div className="liquid-bg -z-10" aria-hidden><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /><span className="orb o4" /><span className="grain" /></div>
      <div className="min-h-dvh max-w-[80rem] mx-auto px-4 sm:px-8 py-6 sm:py-8 flex flex-col">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label={`${siteName} home`} className="on-dark"><Logo name={siteName} /></Link>
          <Link to="/" className="btn btn-glass btn-sm !h-9 !px-4">Back to home</Link>
        </div>
        <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-8 xl:gap-14 items-center py-8 sm:py-10">
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }} className={clsx('w-full mx-auto lg:mx-0 lg:justify-self-end', wide ? 'max-w-[34rem]' : 'max-w-[29rem]')}>
            <div className="liquid-card p-6 sm:p-9">
              <div className="flex items-center justify-between text-[0.875rem] text-white/85 mb-6"><span>{siteName}</span><span>Secure sign-in</span></div>
              <h1 className="display text-[1.6rem] sm:text-[1.9rem]">{title}</h1>
              {subtitle && <p className="text-white/85 mt-2.5 text-[0.9375rem] leading-relaxed">{subtitle}</p>}
              <div className="mt-7">{children}</div>
              {footer && <div className="text-[0.9375rem] text-white/85 mt-7 pt-5 border-t border-white/20 text-center">{footer}</div>}
            </div>
          </motion.div>
          <aside className="hidden lg:block max-w-[30rem]">
            <p className="text-[0.9375rem] font-semibold text-[#bcd5ff] mb-3">Track record</p>
            <p className="display text-[1.98rem] xl:text-[2.28rem]">Every signal is recorded, wins and losses alike.</p>
            <div className="mt-8 liquid-card !rounded-[22px] p-5">
              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-white/20">
                <div><div className="impact text-[2.2rem]">{d?.winRate != null ? `${d.winRate}%` : '--'}</div><div className="label mt-1">Win rate</div></div>
                <div><div className="impact text-[2.2rem]">{d?.total ?? '--'}</div><div className="label mt-1">Signals</div></div>
                <div><div className={clsx('impact text-[2.2rem]', d?.totalResult > 0 ? 'text-up' : d?.totalResult < 0 ? 'text-down' : '')}>{d ? fmtPct(d.totalResult, 1) : '--'}</div><div className="label mt-1">Net result</div></div>
              </div>
              <table className="tbl mt-1 [&_td]:!bg-transparent [&_td]:!border-white/10 [&_tr:hover]:!bg-white/5"><tbody>
                {(d?.recent || []).slice(0, 5).map((r, i) => (
                  <tr key={i}><td className="!pl-0">{pairLabel(r.pair)}</td><td><span className={clsx('num text-[0.8125rem] font-semibold', r.direction === 'BUY' ? 'text-up' : 'text-down')}>{r.direction}</span></td><td className="text-dim">{timeAgo(r.closedAt)}</td><td className={clsx('r num !pr-0', r.resultPct >= 0 ? 'text-up' : 'text-down')}>{fmtPct(r.resultPct)}</td></tr>
                ))}
              </tbody></table>
            </div>
            <p className="text-[0.8125rem] text-white/75 mt-4">Demo rows are labelled as such in the app. Past results do not predict future performance.</p>
          </aside>
        </div>
        <p className="text-[0.8125rem] text-white/80 text-center lg:text-left">Trading involves risk. Signals are educational and not financial advice. <Link to="/terms" className="underline underline-offset-2 hover:text-white">Terms</Link> · <Link to="/privacy" className="underline underline-offset-2 hover:text-white">Privacy</Link> · <Link to="/risk" className="underline underline-offset-2 hover:text-white">Risk</Link></p>
      </div>
    </div>
  );
}

/** Shown instead of the signals desk until the email address is confirmed. */
export function VerifyGate({ what = 'the signals desk' }) {
  const user = useAuth((s) => s.user); const [busy, setBusy] = useState(false); const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft((n) => n - 1), 1000); return () => clearTimeout(t); }, [left]);
  const resend = async () => {
    setBusy(true);
    try { await api('/auth/resend-verification', { method: 'POST' }); toast.success('Verification email sent'); setLeft(60); } catch (e) { toast.error(e.message); if (e.retryAfter) setLeft(e.retryAfter); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-xl py-10" data-testid="verify-gate">
      <p className="eyebrow mb-3">Email confirmation needed</p>
      <h1 className="display text-[1.67rem]">Confirm your email to open {what}.</h1>
      <p className="text-mute mt-4 leading-relaxed">We sent a link to <b className="text-ink font-medium">{user?.email}</b>. Open it and this page unlocks. Charts, watchlist and your paper account stay available meanwhile.</p>
      <div className="flex gap-2 mt-6"><button className="btn btn-primary" onClick={resend} disabled={busy || left > 0}>{left > 0 ? `Resend in ${left}s` : 'Resend email'}</button><Link to="/app/account#email" className="btn btn-ghost">Wrong address?</Link></div>
    </div>
  );
}
