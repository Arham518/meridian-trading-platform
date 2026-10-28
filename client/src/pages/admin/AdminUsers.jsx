import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, UserPlus, KeyRound, Trash2, Download, AlertTriangle } from 'lucide-react';
import DataTable from '../../components/DataTable.jsx';
import FilterBar from '../../components/FilterBar.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { Card, PageHeader, Modal, Field, Spinner } from '../../components/ui.jsx';
import { useRecords } from '../../lib/useRecords.js';
import { api, download } from '../../lib/api.js';
import { useAuth } from '../../store/auth.js';
import { useMarket } from '../../store/market.js';
import { fmtDate, fmtMoney } from '../../lib/format.js';

const FIELDS = [
  { key: 'q', type: 'search', label: 'Search name, username or email' },
  { key: 'role', type: 'select', label: 'All roles', options: [['user', 'Users'], ['admin', 'Admins']] },
  { key: 'status', type: 'select', label: 'All statuses', options: [['active', 'Active'], ['disabled', 'Disabled']] },
  { key: 'verified', type: 'select', label: 'Email: any', options: [['yes', 'Verified'], ['no', 'Unverified']] },
];
const PW_HINT = '10+ characters, mixing at least three of: lowercase, uppercase, numbers, symbols.';
const POLL_MS = 30000; // safety net; live updates normally arrive through the socket

/** Create (u = null) or edit a user. */
function UserForm({ u, me, onClose, onSaved }) {
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
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#1d5fe0]" checked={f.verified} onChange={(e) => set({ verified: e.target.checked })} />Email address verified</label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : creating ? 'Create user' : 'Save changes'}</button>
      </div>
    </form>
  );
}

function PasswordForm({ u, onClose, onSaved }) {
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
function DeleteUser({ u, onClose, onDone }) {
  const [typed, setTyped] = useState(''); const [busy, setBusy] = useState(false);
  const ok = typed.trim().toLowerCase() === u.email.toLowerCase();
  const submit = async (e) => {
    e.preventDefault(); if (!ok) return; setBusy(true);
    try { const r = await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast.success(`${r.deleted.email} deleted (${r.deleted.trades} trades, ${r.deleted.orders} orders removed)`); onDone(); }
    catch (e2) { toast.error(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="delete-user-form">
      <div className="flex gap-3 rounded-xl border border-down/25 bg-[#fff1f2] px-4 py-3 text-[13px] text-[#8f1d2c]">
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

export default function AdminUsers() {
  const me = useAuth((s) => s.user);
  const usersTick = useMarket((s) => s.usersTick);
  const r = useRecords('/admin/users', {});
  const [modal, setModal] = useState(null); // { kind: 'create' | 'edit' | 'password', u }
  const { refresh } = r;
  // live: the socket bumps usersTick on registrations / logins / edits; poll as a fallback while the page is open
  useEffect(() => { if (usersTick) refresh(); }, [usersTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setModal(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const exportCsv = async () => { setCsvBusy(true); try { await download(`/admin/users/export.csv${r.exportQuery}`, 'users.csv'); } catch (e) { toast.error(e.message); } finally { setCsvBusy(false); } };
  const saved = () => { setModal(null); r.refresh(); };
  const patch = async (u, body, msg) => { try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); toast.success(msg); r.refresh(); } catch (e) { toast.error(e.message); } };
  const act = async (u, path, msg) => { try { await api(`/admin/users/${u.id}/${path}`, { method: 'POST' }); toast.success(msg); r.refresh(); } catch (e) { toast.error(e.message); } };
  const cols = [
    { header: 'User', accessorKey: 'name', cell: (c) => <div className="flex items-center gap-2.5"><div className="size-8 rounded-xl bg-accent-soft text-accent-2 grid place-items-center text-xs font-bold">{c.getValue()[0]}</div><div><div className="font-medium">{c.getValue()}{c.row.original.is_demo ? <span className="badge badge-neutral ml-2">Demo</span> : null}</div><div className="text-[11px] text-mute">{c.row.original.username ? `@${c.row.original.username} · ` : ''}{c.row.original.email}</div></div></div> },
    { header: 'Role', accessorKey: 'role', cell: (c) => <select className="input !h-8 !w-[96px] !text-xs capitalize" value={c.getValue()} disabled={c.row.original.id === me.id} onChange={(e) => patch(c.row.original, { role: e.target.value }, `Role changed to ${e.target.value}`)} aria-label={`Role for ${c.row.original.email}`}><option value="user">User</option><option value="admin">Admin</option></select> },
    { header: 'Status', accessorKey: 'status', cell: (c) => { const u = c.row.original; const locked = u.locked_until && new Date(u.locked_until) > new Date(); return <div className="flex flex-wrap gap-1"><span className={`badge ${c.getValue() === 'active' ? 'badge-up' : 'badge-down'}`}>{c.getValue()}</span>{locked && <span className="badge badge-warn">locked</span>}</div>; } },
    { header: 'Email', accessorKey: 'email_verified_at', cell: (c) => c.getValue() ? <span className="badge badge-up" title={fmtDate(c.getValue())}>verified</span> : <span className="badge badge-warn">unverified</span> },
    { header: '2FA', accessorKey: 'totp_enabled', cell: (c) => <span className={c.getValue() ? 'text-ink text-xs' : 'text-dim text-xs'}>{c.getValue() ? 'On' : 'Off'}</span> },
    { header: 'Paper balance', accessorKey: 'balance', meta: { right: true }, cell: (c) => <span className="num">{fmtMoney(c.getValue())}</span> },
    { header: 'Registered', accessorKey: 'created_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: 'Last login', accessorKey: 'last_login_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: '', id: 'a', meta: { right: true }, cell: (c) => {
      const u = c.row.original; const self = u.id === me.id;
      const locked = u.locked_until && new Date(u.locked_until) > new Date();
      return (
        <div className="flex justify-end gap-1.5 whitespace-nowrap">
          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'edit', u })} aria-label={`Edit ${u.email}`}><Pencil size={13} />Edit</button>
          {self ? <span className="text-xs text-dim self-center px-1">You</span> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'password', u })} aria-label={`Set password for ${u.email}`}><KeyRound size={13} />Password</button>
            {!u.email_verified_at && <button className="btn btn-ghost btn-sm" onClick={() => act(u, 'resend-verification', 'Verification email sent')}>Resend</button>}
            {locked && <button className="btn btn-ghost btn-sm" onClick={() => act(u, 'unlock', 'Account unlocked')}>Unlock</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Force a password reset for ${u.email}? They are signed out everywhere and emailed a reset link.`)) act(u, 'force-reset', 'Reset email sent, sessions revoked'); }}>Force reset</button>
            {u.status === 'active' ? <button className="btn btn-danger btn-sm" onClick={() => patch(u, { status: 'disabled' }, 'User disabled')}>Disable</button> : <button className="btn btn-ghost btn-sm" onClick={() => patch(u, { status: 'active' }, 'User enabled')}>Enable</button>}
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setModal({ kind: 'delete', u })} aria-label={`Delete ${u.email}`} title="Delete user" data-testid={`delete-user-${u.id}`}><Trash2 size={13} /></button>
          </>}
        </div>
      );
    } },
  ];
  return (
    <div>
      <PageHeader title="Users" subtitle="Every registered member, updated live. Create and edit users, change roles, passwords and access. Hashes and secrets are never shown or exported."
        actions={<div className="flex flex-wrap gap-2"><button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'create' })}><UserPlus size={14} />Create user</button><button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={csvBusy} data-testid="export-users-csv">{csvBusy ? <Spinner /> : <Download size={14} />}Export CSV</button><ExcelButton path={`/export/users${r.exportQuery}`} /></div>} />
      <Card pad={false} title={`${r.total} users`}>
        <FilterBar fields={FIELDS} values={r.filters} onChange={r.patch} onReset={r.reset} />
        <DataTable columns={cols} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={1180} emptyTitle="No users found" />
      </Card>
      <Modal open={!!modal} onClose={close} width="max-w-xl"
        title={modal?.kind === 'create' ? 'Create user' : modal?.kind === 'password' ? 'Set new password' : modal?.kind === 'delete' ? 'Delete user' : `Edit ${modal?.u?.email || 'user'}`}>
        {modal?.kind === 'delete' ? <DeleteUser u={modal.u} onClose={close} onDone={saved} /> : modal?.kind === 'password' ? <PasswordForm u={modal.u} onClose={close} onSaved={saved} />
          : modal && <UserForm key={modal.u?.id || 'new'} u={modal.u || null} me={me} onClose={close} onSaved={saved} />}
      </Modal>
    </div>
  );
}
