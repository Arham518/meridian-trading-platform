import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { KeyRound, Trash2, AlertTriangle, X, UserCog, MailCheck, LockOpen, RotateCcw } from 'lucide-react';
import { Field, Spinner, Skeleton, Segmented } from './ui.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtMoney } from '../lib/format.js';

const PW_HINT = '10+ characters, mixing at least three of: lowercase, uppercase, numbers, symbols.';

/** Create (u = null) or edit a user. */
export function UserForm({ u, me, onClose, onSaved }) {
  const creating = !u;
  const [f, setF] = useState(() => (creating
    ? { name: '', email: '', username: '', password: '', role: 'user', verified: true, balance: '' }
    : { name: u.name, email: u.email, username: u.username || '', role: u.role, status: u.status, verified: !!u.email_verified_at, balance: String(u.balance ?? '') }));
  const [busy, setBusy] = useState(false);
  const self = !creating && u.id === me.id;
  const set = (p) => setF((cur) => ({ ...cur, ...p }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const body = { name: f.name, email: f.email, username: f.username.trim() || null, role: f.role, verified: f.verified };
    if (f.balance !== '') body.balance = Number(f.balance);
    if (creating) body.password = f.password; else body.status = f.status;
    try {
      const r = creating ? await api('/admin/users', { method: 'POST', body }) : await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      toast.success(creating ? `User ${r.user.email} created` : 'User updated'); onSaved();
    } catch (e2) { toast.error(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="user-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} minLength={2} maxLength={60} required /></Field>
        <Field label="Username" hint="Optional. 3-24: letters, numbers, dot, underscore."><input className="input" value={f.username} onChange={(e) => set({ username: e.target.value })} maxLength={24} placeholder="optional" /></Field>
      </div>
      <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} maxLength={120} required /></Field>
      {creating && <Field label="Password" hint={PW_HINT}><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set({ password: e.target.value })} minLength={10} maxLength={100} required /></Field>}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Role" hint={self ? 'You cannot demote yourself.' : undefined}><select className="input" value={f.role} disabled={self} onChange={(e) => set({ role: e.target.value })}><option value="user">User</option><option value="admin">Admin</option></select></Field>
        {!creating && <Field label="Status"><select className="input" value={f.status} disabled={self} onChange={(e) => set({ status: e.target.value })}><option value="active">Active</option><option value="disabled">Disabled</option></select></Field>}
        <Field label="Paper balance (USD)"><input className="input num" type="number" min="0" step="0.01" value={f.balance} onChange={(e) => set({ balance: e.target.value })} placeholder={creating ? 'default' : ''} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#1a5ad7]" checked={f.verified} onChange={(e) => set({ verified: e.target.checked })} />Email address verified</label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : creating ? 'Create user' : 'Save changes'}</button>
      </div>
    </form>
  );
}

export function PasswordForm({ u, onClose, onSaved }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { toast.error('Passwords do not match'); return; }
    setBusy(true);
    try { const r = await api(`/admin/users/${u.id}/password`, { method: 'POST', body: { password: pw, confirmPassword: pw2 } }); toast.success(`Password changed, ${r.sessionsRevoked} session(s) signed out`); onSaved(); }
    catch (e2) { toast.error(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="password-form">
      <p className="text-sm text-mute">Sets a new password for <span className="text-ink">{u.email}</span>. They are signed out on every device and get an email that the password changed.</p>
      <Field label="New password" hint={PW_HINT}><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={10} maxLength={100} required /></Field>
      <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={10} maxLength={100} required /></Field>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Set password'}</button>
      </div>
    </form>
  );
}

/** Permanent delete with an explicit confirmation step. */
export function DeleteUser({ u, onClose, onDone }) {
  const [typed, setTyped] = useState(''); const [busy, setBusy] = useState(false);
  const ok = typed.trim().toLowerCase() === u.email.toLowerCase();
  const submit = async (e) => {
    e.preventDefault(); if (!ok) return; setBusy(true);
    try { const r = await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast.success(`${r.deleted.email} deleted (${r.deleted.trades} trades, ${r.deleted.orders} orders removed)`); onDone(); }
    catch (e2) { toast.error(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="delete-user-form">
      <div className="flex gap-3 rounded-xl border border-down/25 bg-[#fff1f2] px-4 py-3 text-[0.9375rem] text-[#8f1d2c]">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <p>This permanently deletes <b>{u.name}</b> ({u.email}) with their paper trades, orders, watchlist, sessions and 2FA codes. Their sign-in history and emails are kept for audit but anonymised. Signals they published stay. This cannot be undone.</p>
      </div>
      <Field label={`Type ${u.email} to confirm`}><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus data-testid="delete-confirm-input" /></Field>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-down" disabled={!ok || busy} data-testid="delete-confirm">{busy ? <Spinner /> : <><Trash2 size={14} />Delete user</>}</button>
      </div>
    </form>
  );
}


/**
 * Edit drawer for one user: opened from the Users table, the admin overview (latest sign-ups, sign-in activity) or
 * anywhere else with a user id. Loads the user fresh, then offers profile / role / status / balance, password and delete.
 */
export function UserDrawer({ userId, me, onClose, onChanged }) {
  const [u, setU] = useState(null); const [err, setErr] = useState(''); const [tab, setTab] = useState('profile'); const [activity, setActivity] = useState([]);
  const load = () => api(`/admin/users/${userId}`).then((r) => { setU(r.user); setActivity(r.activity || []); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { if (!userId) return undefined; setU(null); setTab('profile'); load(); return undefined; }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [userId, onClose]);
  const self = u && me && u.id === me.id;
  const locked = u?.locked_until && new Date(u.locked_until) > new Date();
  const done = () => { onChanged?.(); load(); };
  const act = async (path, msg) => { try { await api(`/admin/users/${u.id}/${path}`, { method: 'POST' }); toast.success(msg); done(); } catch (e) { toast.error(e.message); } };
  return (
    <AnimatePresence>
      {userId && (
        <motion.div className="fixed inset-0 z-[80]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-night/40 backdrop-blur-[6px]" onClick={onClose} aria-hidden />
          <motion.aside role="dialog" aria-modal="true" aria-label="Edit user" data-testid="user-drawer"
            className="glass glass-strong absolute flex flex-col inset-x-0 bottom-0 max-h-[92dvh] !rounded-b-none sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[520px] sm:max-h-none sm:!rounded-[24px]"
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <header className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-line">
              <span className="size-12 rounded-2xl grid place-items-center text-[1.125rem] font-bold text-white bg-[linear-gradient(135deg,#3b7bf0,#0f2a66)] shrink-0">{u?.name?.[0]?.toUpperCase() || <UserCog size={18} />}</span>
              <div className="min-w-0 flex-1">
                <p className="label">Edit user</p>
                {u ? <><h2 className="text-[1.15rem] font-semibold truncate">{u.name}</h2><p className="text-[0.9375rem] text-mute truncate">{u.email}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2"><span className={clsx('badge', u.role === 'admin' ? 'badge-accent' : 'badge-neutral')}>{u.role}</span><span className={clsx('badge', u.status === 'active' ? 'badge-up' : 'badge-down')}>{u.status}</span><span className={clsx('badge', u.email_verified_at ? 'badge-up' : 'badge-warn')}>{u.email_verified_at ? 'verified' : 'unverified'}</span>{locked && <span className="badge badge-down">locked</span>}<span className="badge badge-neutral num">{fmtMoney(u.balance)}</span></div></>
                  : err ? <p className="text-down text-sm mt-1">{err}</p> : <Skeleton className="h-10 w-56 mt-1" />}
              </div>
              <button className="btn btn-ghost btn-sm btn-icon !rounded-full" onClick={onClose} aria-label="Close"><X size={16} /></button>
            </header>
            {u && (
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
                <Segmented ariaLabel="Edit section" value={tab} onChange={setTab} options={[{ value: 'profile', label: 'Profile & access' }, ...(self ? [] : [{ value: 'password', label: 'Set password' }, { value: 'delete', label: 'Delete' }])]} />
                {tab === 'profile' && <UserForm key={u.id} u={u} me={me} onClose={onClose} onSaved={() => { done(); }} />}
                {tab === 'password' && <PasswordForm u={u} onClose={() => setTab('profile')} onSaved={() => { setTab('profile'); done(); }} />}
                {tab === 'delete' && <DeleteUser u={u} onClose={() => setTab('profile')} onDone={() => { onChanged?.(); onClose(); }} />}
                {tab === 'profile' && !self && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!u.email_verified_at && <button className="btn btn-ghost btn-sm" onClick={() => act('resend-verification', 'Verification email sent')}><MailCheck size={13} />Resend verification</button>}
                    {locked && <button className="btn btn-ghost btn-sm" onClick={() => act('unlock', 'Account unlocked')}><LockOpen size={13} />Unlock</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Force a password reset for ${u.email}? They are signed out everywhere and emailed a reset link.`)) act('force-reset', 'Reset email sent, sessions revoked'); }}><RotateCcw size={13} />Force reset</button>
                  </div>
                )}
                {tab === 'profile' && (
                  <section>
                    <h3 className="label mb-2">Recent sign-in activity</h3>
                    {activity.length ? <ul className="divide-y divide-[var(--color-line)] rounded-xl border border-line bg-white/50">{activity.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[0.9375rem]"><span className="capitalize">{a.event.replaceAll('_', ' ')}</span><span className="text-mute num">{fmtDate(a.created_at, 'dd MMM, HH:mm')}</span><span className={clsx('badge', a.success ? 'badge-up' : 'badge-down')}>{a.success ? 'OK' : 'Failed'}</span></li>
                    ))}</ul> : <p className="text-[0.9375rem] text-mute">No sign-ins recorded yet.</p>}
                    <p className="text-[0.875rem] text-dim mt-3">Registered {fmtDate(u.created_at, 'dd MMM yyyy')} · last login {u.last_login_at ? fmtDate(u.last_login_at, 'dd MMM yyyy, HH:mm') : 'never'} · {u.trades_count} paper trades</p>
                  </section>
                )}
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
