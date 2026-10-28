import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Download, Monitor, Smartphone, ShieldCheck, MailCheck, MailWarning } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader, Field, Spinner, Modal, Skeleton, ErrorState } from '../components/ui.jsx';
import { PasswordField, PasswordRules, FormError, FormNote, passwordOk } from '../components/authKit.jsx';
import ExcelButton from '../components/ExcelButton.jsx';
import { useAuth } from '../store/auth.js';
import { useFetch } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtMoney, timeAgo } from '../lib/format.js';
import { usePortfolio } from '../lib/usePortfolio.js';

const SECTIONS = [['profile', 'Profile'], ['email', 'Email'], ['password', 'Password'], ['security', 'Two-factor'], ['sessions', 'Sessions'], ['data', 'Paper account & data']];

function Section({ id, title, desc, children }) {
  return (
    <section id={id} className="scroll-mt-24 grid md:grid-cols-[220px_minmax(0,1fr)] gap-x-10 gap-y-3 py-7 border-t border-line first:border-t-0 first:pt-0">
      <div><h2 className="text-[0.9375rem] font-semibold">{title}</h2>{desc && <p className="text-[0.9375rem] text-mute mt-1 leading-relaxed">{desc}</p>}</div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </section>
  );
}

function Profile() {
  const user = useAuth((s) => s.user); const patch = useAuth((s) => s.patchUser);
  const [name, setName] = useState(user.name); const [username, setUsername] = useState(user.username || ''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dirty = name !== user.name || username !== (user.username || '');
  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/auth/profile', { method: 'PATCH', body: { name, username } }); patch(r.user); toast.success('Profile saved'); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required /></Field>
      <Field label="Username" hint="Optional. You can sign in with it instead of your email."><input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="e.g. night_owl" /></Field>
      <dl className="flex gap-10 text-sm"><div><dt className="label">Role</dt><dd className="mt-1 capitalize">{user.role}</dd></div><div><dt className="label">Member since</dt><dd className="mt-1">{fmtDate(user.createdAt, 'dd MMM yyyy')}</dd></div></dl>
      <FormError>{err}</FormError>
      <button className="btn btn-primary" disabled={busy || !dirty || name.trim().length < 2}>{busy ? <Spinner /> : 'Save profile'}</button>
    </form>
  );
}

function EmailSection() {
  const user = useAuth((s) => s.user); const reload = useAuth((s) => s.reloadUser);
  const [f, setF] = useState({ newEmail: '', password: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [resend, setResend] = useState({ busy: false, left: 0 });
  useEffect(() => { if (resend.left <= 0) return undefined; const t = setTimeout(() => setResend((r) => ({ ...r, left: r.left - 1 })), 1000); return () => clearTimeout(t); }, [resend.left]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/auth/change-email', { method: 'POST', body: f }); toast.success(`Confirmation link sent to ${f.newEmail}`); setF({ newEmail: '', password: '' }); await reload(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const resendVerify = async () => {
    setResend({ busy: true, left: 0 });
    try { await api('/auth/resend-verification', { method: 'POST' }); toast.success('Verification email sent'); setResend({ busy: false, left: 60 }); } catch (e) { toast.error(e.message); setResend({ busy: false, left: e.retryAfter || 0 }); }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 text-sm">
        {user.emailVerified ? <MailCheck size={18} className="text-up mt-0.5 shrink-0" /> : <MailWarning size={18} className="text-accent-2 mt-0.5 shrink-0" />}
        <div className="min-w-0"><div className="font-medium break-all">{user.email}</div>
          <div className="text-[0.9375rem] text-mute">{user.emailVerified ? 'Verified' : 'Not verified. Signals and paper trading stay locked until you confirm it.'}</div>
          {!user.emailVerified && <button className="btn btn-ghost btn-sm mt-2" onClick={resendVerify} disabled={resend.busy || resend.left > 0}>{resend.left > 0 ? `Resend in ${resend.left}s` : 'Resend verification email'}</button>}
        </div>
      </div>
      {user.pendingEmail && <FormNote>Waiting for you to confirm <b className="font-semibold">{user.pendingEmail}</b>. Open the link we sent to that address. Your current email keeps working until then.</FormNote>}
      <form onSubmit={submit} className="space-y-4 pt-1">
        <Field label="New email address"><input className="input" type="email" autoComplete="email" value={f.newEmail} onChange={(e) => setF({ ...f, newEmail: e.target.value })} required /></Field>
        <Field label="Current password"><PasswordField value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></Field>
        <FormError>{err}</FormError>
        <button className="btn btn-ghost" disabled={busy || !f.newEmail || !f.password}>{busy ? <Spinner /> : 'Send confirmation link'}</button>
      </form>
    </div>
  );
}

function PasswordSection() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const mismatch = f.confirmPassword && f.newPassword !== f.confirmPassword;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!passwordOk(f.newPassword)) return setErr('Choose a stronger password. See the rules below the field.');
    if (mismatch) return setErr('Passwords do not match.');
    setBusy(true);
    try { const r = await api('/auth/change-password', { method: 'POST', body: f }); toast.success(r.otherSessionsRevoked ? `Password changed. ${r.otherSessionsRevoked} other device${r.otherSessionsRevoked > 1 ? 's' : ''} signed out.` : 'Password changed'); setF({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password"><PasswordField value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
      <div><Field label="New password"><PasswordField value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" /></Field><PasswordRules value={f.newPassword} /></div>
      <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : ''}><PasswordField value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} autoComplete="new-password" invalid={!!mismatch} /></Field>
      <FormError>{err}</FormError>
      <button className="btn btn-primary" disabled={busy || !f.currentPassword || !f.newPassword || !f.confirmPassword}>{busy ? <Spinner /> : 'Update password'}</button>
    </form>
  );
}

function BackupCodes({ codes, onDone }) {
  const text = codes.join('\n');
  const copy = () => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => toast.error('Copy failed'));
  const save = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`Meridian backup codes\n\n${text}\n`], { type: 'text/plain' })); a.download = 'meridian-backup-codes.txt'; a.click(); };
  return (
    <div className="space-y-4">
      <FormNote>Save these backup codes now. Each works once if you lose your phone. They are not shown again.</FormNote>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 num text-[0.9375rem] border border-line-2 rounded-md p-4" data-testid="backup-codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex gap-2"><button className="btn btn-ghost btn-sm" onClick={copy}><Copy size={13} />Copy</button><button className="btn btn-ghost btn-sm" onClick={save}><Download size={13} />Download .txt</button><button className="btn btn-primary btn-sm ml-auto" onClick={onDone}>I have saved them</button></div>
    </div>
  );
}

function TwoFactor() {
  const user = useAuth((s) => s.user); const reload = useAuth((s) => s.reloadUser);
  const info = useFetch(() => api('/auth/2fa'), [user.twoFactorEnabled]);
  const [setup, setSetup] = useState(null); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [codes, setCodes] = useState(null);
  const [off, setOff] = useState(false); const [offF, setOffF] = useState({ password: '', code: '' }); const [regen, setRegen] = useState(false);
  const start = async () => { setErr(''); setBusy(true); try { setSetup(await api('/auth/2fa/setup', { method: 'POST' })); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const enable = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/auth/2fa/enable', { method: 'POST', body: { code } }); setSetup(null); setCode(''); setCodes(r.backupCodes); await reload(); toast.success('Two-factor authentication is on'); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const sensitive = (path, after) => async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api(path, { method: 'POST', body: offF }); setOffF({ password: '', code: '' }); after(r); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  if (codes) return <BackupCodes codes={codes} onDone={() => setCodes(null)} />;
  if (user.twoFactorEnabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 text-sm"><ShieldCheck size={18} className="text-up" /><span className="font-medium">Enabled</span><span className="text-mute text-[0.9375rem]">{info.data ? `${info.data.backupCodesLeft} backup codes left` : ''}</span></div>
        <div className="flex gap-2"><button className="btn btn-ghost btn-sm" onClick={() => { setRegen(true); setErr(''); }}>New backup codes</button><button className="btn btn-danger btn-sm" onClick={() => { setOff(true); setErr(''); }}>Turn off</button></div>
        {[[off, setOff, 'Turn off two-factor', '/auth/2fa/disable', () => { setOff(false); reload(); toast.success('Two-factor authentication is off'); }, 'Turn off'], [regen, setRegen, 'Generate new backup codes', '/auth/2fa/backup-codes', (r) => { setRegen(false); setCodes(r.backupCodes); }, 'Generate']].map(([open, setOpen, title, path, after, cta]) => (
          <Modal key={title} open={open} onClose={() => setOpen(false)} title={title} width="max-w-sm" footer={<><button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" form={`f-${path}`} disabled={busy || !offF.password || offF.code.length < 6}>{busy ? <Spinner /> : cta}</button></>}>
            <form id={`f-${path}`} onSubmit={sensitive(path, after)} className="space-y-4">
              <Field label="Password"><PasswordField value={offF.password} onChange={(e) => setOffF({ ...offF, password: e.target.value })} autoComplete="current-password" /></Field>
              <Field label="Authenticator or backup code"><input className="input num" inputMode="numeric" value={offF.code} onChange={(e) => setOffF({ ...offF, code: e.target.value })} autoComplete="one-time-code" /></Field>
              <FormError>{err}</FormError>
            </form>
          </Modal>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {!setup ? (
        <>
          <p className="text-sm text-mute leading-relaxed">Add a second step with an authenticator app (Google Authenticator, 1Password, Authy). Strongly recommended for administrators.</p>
          <FormError>{err}</FormError>
          <button className="btn btn-primary" onClick={start} disabled={busy}>{busy ? <Spinner /> : 'Set up two-factor'}</button>
        </>
      ) : (
        <form onSubmit={enable} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <img src={setup.qr} alt="QR code for your authenticator app" width="176" height="176" className="rounded-md border border-line-2 bg-bg p-1.5" data-testid="totp-qr" />
            <div className="text-[0.9375rem] text-mute space-y-2 min-w-0">
              <p>1. Scan the code with your authenticator app.</p>
              <p>2. Or enter this key manually:</p>
              <code className="num block break-all text-ink text-[0.9375rem] border border-line-2 rounded-lg px-2 py-1.5" data-testid="totp-secret">{setup.secret}</code>
              <p>3. Type the 6-digit code it shows.</p>
            </div>
          </div>
          <Field label="6-digit code"><input className="input num !text-base tracking-[0.2em] max-w-[180px]" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" maxLength={8} autoFocus /></Field>
          <FormError>{err}</FormError>
          <div className="flex gap-2"><button className="btn btn-primary" disabled={busy || code.length < 6}>{busy ? <Spinner /> : 'Turn on'}</button><button type="button" className="btn btn-ghost" onClick={() => { setSetup(null); setCode(''); setErr(''); }}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

function deviceName(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { label: `${b} on ${o}`, mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

function Sessions() {
  const nav = useNavigate(); const logoutAll = useAuth((s) => s.logoutAll);
  const q = useFetch(() => api('/auth/sessions'), []);
  const [busy, setBusy] = useState(''); const rows = q.data?.sessions || [];
  const revoke = async (id) => { setBusy(id); try { await api(`/auth/sessions/${id}`, { method: 'DELETE' }); toast.success('Session signed out'); q.refresh(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
  const others = async () => { setBusy('others'); try { const r = await api('/auth/sessions/revoke-others', { method: 'POST' }); toast.success(`${r.revoked} other session${r.revoked === 1 ? '' : 's'} signed out`); q.refresh(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
  const all = async () => { setBusy('all'); try { await logoutAll(); toast.success('Signed out of all devices'); nav('/login'); } catch (e) { toast.error(e.message); setBusy(''); } };
  if (q.loading && !q.data) return <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <div>
      <ul className="border border-line rounded-md divide-y divide-[color:var(--color-line)]" data-testid="session-list">
        {rows.map((s) => { const d = deviceName(s.userAgent); const Icon = d.mobile ? Smartphone : Monitor; return (
          <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
            <Icon size={17} className="text-mute shrink-0" />
            <div className="min-w-0 flex-1"><div className="text-sm font-medium flex items-center gap-2 flex-wrap">{d.label}{s.current && <span className="badge badge-accent">This device</span>}</div>
              <div className="text-[0.875rem] text-mute num truncate">{s.ip || 'unknown IP'} · active {timeAgo(s.lastUsedAt)} · {s.remember ? 'kept for 30 days' : 'until you close the browser'}</div></div>
            {!s.current && <button className="btn btn-ghost btn-sm" onClick={() => revoke(s.id)} disabled={busy === s.id}>{busy === s.id ? <Spinner /> : 'Sign out'}</button>}
          </li>); })}
      </ul>
      <div className="flex flex-wrap gap-2 mt-4">
        <button className="btn btn-ghost btn-sm" onClick={others} disabled={rows.length < 2 || !!busy}>Sign out other devices</button>
        <button className="btn btn-danger btn-sm" onClick={all} disabled={!!busy}>Sign out of all devices</button>
      </div>
    </div>
  );
}

export default function Account() {
  const pf = usePortfolio(); const loc = useLocation();
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 150); }, [loc.hash]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Account" subtitle="Profile, sign-in security and your data." />
      <div className="flex gap-x-5 gap-y-1 flex-wrap text-[0.9375rem] mb-7 border-b border-line pb-3">{SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`} className="text-mute hover:text-ink">{t}</a>)}</div>
      <Section id="profile" title="Profile" desc="How you appear on the platform."><Profile /></Section>
      <Section id="email" title="Email address" desc="Used to sign in and for security notices. A change is confirmed from the new address."><EmailSection /></Section>
      <Section id="password" title="Password" desc="Changing it signs out every other device."><PasswordSection /></Section>
      <Section id="security" title="Two-factor authentication" desc="A one-time code from your phone on every sign-in."><TwoFactor /></Section>
      <Section id="sessions" title="Active sessions" desc="Devices that are signed in to your account."><Sessions /></Section>
      <Section id="data" title="Paper account & data" desc="Virtual money only. Nothing here moves real funds.">
        <dl className="flex gap-10 mb-5"><div><dt className="label">Cash balance</dt><dd className="num text-xl mt-1">{fmtMoney(pf.data?.balance)}</dd></div><div><dt className="label">Equity</dt><dd className="num text-xl mt-1">{fmtMoney(pf.data?.equity)}</dd></div></dl>
        <p className="text-[0.9375rem] text-mute mb-4">One workbook with your trades, orders, watchlist, sign-in activity and the signal archive. Password hashes and secrets are never exported.</p>
        <ExcelButton path="/export/my" label="Download my workbook (.xlsx)" small={false} />
      </Section>
    </div>
  );
}
