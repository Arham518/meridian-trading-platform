import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MailCheck, MailX, Loader2 } from 'lucide-react';
import { Field, Spinner } from '../components/ui.jsx';
import { AuthLayout, PasswordField, PasswordRules, FormError, FormNote, passwordOk, fieldErrors } from '../components/authKit.jsx';
import { useAuth } from '../store/auth.js';
import { api } from '../lib/api.js';

const home = (u) => (u.role === 'admin' ? '/admin' : '/app');

/* ---------------------------------------------------------------- Login (+ two-factor challenge) */
export function Login() {
  const { user, login, login2fa } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [f, setF] = useState({ identifier: '', password: '', remember: false });
  const [challenge, setChallenge] = useState(null); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [locked, setLocked] = useState(0);
  useEffect(() => { if (locked <= 0) return undefined; const t = setTimeout(() => setLocked((n) => n - 1), 1000); return () => clearTimeout(t); }, [locked]);
  if (user) return <Navigate to={loc.state?.from || home(user)} replace />;
  const done = (u) => { toast.success(`Signed in as ${u.name.split(' ')[0]}`); nav(loc.state?.from || home(u), { replace: true }); };
  const fail = (e) => { setErr(e.message); if (e.code === 'locked' && e.retryAfter) setLocked(Math.min(e.retryAfter, 1800)); if (e.code === 'challenge_expired') setChallenge(null); };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await login(f.identifier, f.password, f.remember); if (r.requires2fa) setChallenge(r.challenge); else done(r.user); }
    catch (e2) { fail(e2); } finally { setBusy(false); }
  };
  const submit2 = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { done(await login2fa(challenge, code, f.remember)); } catch (e2) { fail(e2); } finally { setBusy(false); }
  };

  if (challenge) {
    return (
      <AuthLayout title="Two-step check" subtitle="Enter the 6-digit code from your authenticator app, or one of your backup codes." footer={<button className="link" onClick={() => { setChallenge(null); setCode(''); setErr(''); }}>Use a different account</button>}>
        <form onSubmit={submit2} className="space-y-4" noValidate>
          <Field label="Authentication code"><input className="input num !h-11 !text-lg tracking-[0.25em]" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" maxLength={11} /></Field>
          <FormError>{err}</FormError>
          <button className="btn btn-primary w-full !h-11" disabled={busy || code.trim().length < 6}>{busy ? <Spinner /> : 'Verify and sign in'}</button>
        </form>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Sign in" subtitle="Dashboard, signals desk and your paper account." footer={<>No account yet? <Link to="/register" className="link">Register</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email or username"><input className="input" autoComplete="username" autoFocus value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} placeholder="you@example.com" required /></Field>
        <Field label={<span className="flex justify-between normal-case tracking-normal"><span className="label">Password</span><Link to="/forgot-password" className="text-[0.875rem] text-mute hover:text-ink" tabIndex={-1}>Forgot password?</Link></span>}>
          <PasswordField value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        </Field>
        <label className="flex items-center gap-2 text-[0.9375rem] text-mute cursor-pointer select-none"><input type="checkbox" className="accent-[#1a5ad7] size-3.5" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />Keep me signed in for 30 days</label>
        <FormError>{locked > 0 ? `Too many failed attempts. Try again in ${locked >= 90 ? `${Math.ceil(locked / 60)} minutes` : `${locked}s`}.` : err}</FormError>
        <button className="btn btn-primary w-full !h-11" disabled={busy || locked > 0 || !f.identifier || !f.password}>{busy ? <Spinner /> : 'Sign in'}</button>
      </form>
    </AuthLayout>
  );
}

/* ---------------------------------------------------------------- Register */
export function Register() {
  const { user, register } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '', acceptTerms: false });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [touched, setTouched] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const mismatch = f.confirmPassword && f.password !== f.confirmPassword;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setTouched(true);
    if (!passwordOk(f.password)) return setErr('Choose a stronger password. See the rules below the field.');
    if (f.password !== f.confirmPassword) return setFe({ confirmPassword: 'Passwords do not match' });
    if (!f.acceptTerms) return setFe({ acceptTerms: 'Please agree to the Terms of Service and Privacy Policy to continue.' });
    setBusy(true);
    try { await register({ ...f, username: f.username || undefined }); toast.success('Account created. Check your inbox to confirm your email.'); nav('/app', { replace: true }); }
    catch (e2) { setErr(Object.keys(fieldErrors(e2)).length ? '' : e2.message); setFe(fieldErrors(e2)); if (e2.status === 409) setFe(e2.message.includes('username') ? { username: e2.message } : { email: e2.message }); } finally { setBusy(false); }
  };
  return (
    <AuthLayout wide title="Create an account" subtitle="Free. You get a 100,000 USD paper account and the live signals desk after confirming your email." footer={<>Already registered? <Link to="/login" className="link">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name" error={fe.name}><input className="input" autoComplete="name" value={f.name} onChange={set('name')} required /></Field>
          <Field label="Username (optional)" error={fe.username} hint="Sign in with it instead of your email."><input className="input" autoComplete="username" value={f.username} onChange={set('username')} placeholder="e.g. night_owl" /></Field>
        </div>
        <Field label="Email" error={fe.email}><input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" required /></Field>
        <div>
          <Field label="Password" error={fe.password}><PasswordField value={f.password} onChange={set('password')} autoComplete="new-password" invalid={touched && !passwordOk(f.password)} /></Field>
          <PasswordRules value={f.password} />
        </div>
        <Field label="Confirm password" error={fe.confirmPassword || (mismatch ? 'Passwords do not match' : '')}><PasswordField value={f.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" placeholder="Repeat password" invalid={!!mismatch} /></Field>
        <FormError>{err}</FormError>
        <div>
          <label className="flex items-start gap-2.5 text-[0.9375rem] text-mute cursor-pointer select-none">
            <input type="checkbox" className="accent-[#1a5ad7] size-4 mt-0.5 shrink-0" checked={f.acceptTerms} onChange={(e) => { setF((p) => ({ ...p, acceptTerms: e.target.checked })); setFe((x) => ({ ...x, acceptTerms: undefined })); }} aria-invalid={fe.acceptTerms ? 'true' : undefined} data-testid="accept-terms" required />
            <span>I agree to the <Link to="/terms" target="_blank" className="link">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="link">Privacy Policy</Link>, and I have read the <Link to="/risk" target="_blank" className="link">Risk Disclosure</Link>.</span>
          </label>
          {fe.acceptTerms && <span className="text-xs text-down mt-1.5 block" role="alert">{fe.acceptTerms}</span>}
        </div>
        <button className="btn btn-primary w-full !h-11" disabled={busy || !f.name || !f.email || !f.password || !f.confirmPassword || !f.acceptTerms}>{busy ? <Spinner /> : 'Create account'}</button>
        <p className="text-[0.8125rem] text-dim">Signals are educational and trading involves risk. Paper trading uses virtual money.</p>
      </form>
    </AuthLayout>
  );
}

/* ---------------------------------------------------------------- Forgot / reset password */
export function ForgotPassword() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/auth/forgot-password', { method: 'POST', body: { email } }); setSent(true); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="Enter the email you registered with. If it matches an account, we send a link that works once for 60 minutes." footer={<Link to="/login" className="link">Back to sign in</Link>}>
      {sent ? (
        <div className="space-y-4">
          <FormNote tone="ok">If an account exists for <b className="font-semibold">{email}</b>, a reset link is on its way. Check spam if it does not arrive within a few minutes.</FormNote>
          <button className="btn btn-ghost w-full" onClick={() => setSent(false)}>Use another email</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email"><input className="input" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></Field>
          <FormError>{err}</FormError>
          <button className="btn btn-primary w-full !h-11" disabled={busy || !email}>{busy ? <Spinner /> : 'Send reset link'}</button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams(); const token = sp.get('token') || ''; const nav = useNavigate();
  const [f, setF] = useState({ password: '', confirmPassword: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false); const [dead, setDead] = useState(!token);
  const mismatch = f.confirmPassword && f.password !== f.confirmPassword;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!passwordOk(f.password)) return setErr('Choose a stronger password. See the rules below the field.');
    if (mismatch) return setErr('Passwords do not match.');
    setBusy(true);
    try { await api('/auth/reset-password', { method: 'POST', body: { token, ...f } }); setDone(true); toast.success('Password updated'); setTimeout(() => nav('/login'), 2200); }
    catch (e2) { if (e2.code === 'invalid_token') setDead(true); else setErr(e2.message); } finally { setBusy(false); }
  };
  if (dead) return (
    <AuthLayout title="Link expired" subtitle="This reset link is invalid, expired or was already used. Reset links work once and last 60 minutes." footer={<Link to="/login" className="link">Back to sign in</Link>}>
      <Link to="/forgot-password" className="btn btn-primary w-full !h-11">Request a new link</Link>
    </AuthLayout>
  );
  return (
    <AuthLayout wide title="Choose a new password" subtitle="You will be signed out everywhere and asked to sign in again." footer={<Link to="/login" className="link">Back to sign in</Link>}>
      {done ? <FormNote tone="ok">Password updated. Redirecting to sign in...</FormNote> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div><Field label="New password"><PasswordField value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" autoFocus /></Field><PasswordRules value={f.password} /></div>
          <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : ''}><PasswordField value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} autoComplete="new-password" placeholder="Repeat password" invalid={!!mismatch} /></Field>
          <FormError>{err}</FormError>
          <button className="btn btn-primary w-full !h-11" disabled={busy || !f.password || !f.confirmPassword}>{busy ? <Spinner /> : 'Update password'}</button>
        </form>
      )}
    </AuthLayout>
  );
}

/* ---------------------------------------------------------------- Verify email / confirm email change (link landing pages) */
function TokenResult({ endpoint, okTitle, okText, failTitle, resend }) {
  const [sp] = useSearchParams(); const token = sp.get('token');
  const [state, setState] = useState(token ? 'working' : 'fail'); const [msg, setMsg] = useState('');
  const reloadUser = useAuth((s) => s.reloadUser); const user = useAuth((s) => s.user);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api(endpoint, { method: 'POST', body: { token } })
      .then((r) => { if (cancelled) return; setMsg(r.email || ''); setState('ok'); if (user) reloadUser().catch(() => {}); })
      .catch((e) => { if (!cancelled) { setMsg(e.message); setState('fail'); } });
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthLayout title={state === 'ok' ? okTitle : state === 'working' ? 'Checking link' : failTitle} subtitle={state === 'ok' ? `${okText}${msg ? ` ${msg}` : ''}`.trim() : state === 'working' ? 'One moment.' : (msg || 'This link is missing its token.')}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 border border-line-2 rounded-md px-4 py-3.5" role="status" data-testid="token-result" data-state={state}>
          {state === 'working' && <Loader2 className="animate-spin text-mute" size={20} />}
          {state === 'ok' && <MailCheck className="text-up" size={20} />}
          {state === 'fail' && <MailX className="text-down" size={20} />}
          <span className="text-sm">{state === 'ok' ? 'Done.' : state === 'working' ? 'Working...' : 'The link could not be used.'}</span>
        </div>
        {state === 'ok' && <Link to={user ? '/app' : '/login'} className="btn btn-primary w-full !h-11">{user ? 'Continue to dashboard' : 'Sign in'}</Link>}
        {state === 'fail' && resend && <Link to="/resend-verification" className="btn btn-primary w-full !h-11">Send a new link</Link>}
        {state === 'fail' && !resend && <Link to={user ? '/app/account' : '/login'} className="btn btn-ghost w-full !h-10">{user ? 'Back to account' : 'Sign in'}</Link>}
      </div>
    </AuthLayout>
  );
}
export const VerifyEmail = () => <TokenResult endpoint="/auth/verify-email" okTitle="Email confirmed" okText="Your address is verified." failTitle="Link not valid" resend />;
export const ConfirmEmailChange = () => <TokenResult endpoint="/auth/confirm-email-change" okTitle="New email confirmed" okText="You now sign in with" failTitle="Link not valid" />;

/* ---------------------------------------------------------------- Resend verification (public) */
export function ResendVerification() {
  const user = useAuth((s) => s.user);
  const [email, setEmail] = useState(user?.email || ''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState(''); const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft((n) => n - 1), 1000); return () => clearTimeout(t); }, [left]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/auth/resend-verification', { method: 'POST', body: { email } }); setSent(true); setLeft(60); }
    catch (e2) { setErr(e2.message); if (e2.retryAfter) setLeft(e2.retryAfter); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Send a new link" subtitle="Enter your address and we will send a fresh confirmation link. The previous one stops working." footer={<Link to="/login" className="link">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email"><input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></Field>
        {sent && <FormNote tone="ok">If that address belongs to an unconfirmed account, a link is on its way.</FormNote>}
        <FormError>{err}</FormError>
        <button className="btn btn-primary w-full !h-11" disabled={busy || left > 0 || !email}>{busy ? <Spinner /> : left > 0 ? `Resend in ${left}s` : 'Send link'}</button>
      </form>
    </AuthLayout>
  );
}
