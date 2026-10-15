import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import FilterBar from '../../components/FilterBar.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { Card, PageHeader } from '../../components/ui.jsx';
import { useRecords } from '../../lib/useRecords.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../store/auth.js';
import { fmtDate, fmtMoney } from '../../lib/format.js';

const FIELDS = [
  { key: 'q', type: 'search', label: 'Search name or email' },
  { key: 'role', type: 'select', label: 'All roles', options: [['user', 'Users'], ['admin', 'Admins']] },
  { key: 'status', type: 'select', label: 'All statuses', options: [['active', 'Active'], ['disabled', 'Disabled']] },
  { key: 'verified', type: 'select', label: 'Email: any', options: [['yes', 'Verified'], ['no', 'Unverified']] },
];

export default function AdminUsers() {
  const me = useAuth((s) => s.user);
  const r = useRecords('/admin/users', {});
  const patch = async (u, body, msg) => { try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); toast.success(msg); r.refresh(); } catch (e) { toast.error(e.message); } };
  const act = async (u, path, msg) => { try { await api(`/admin/users/${u.id}/${path}`, { method: 'POST' }); toast.success(msg); r.refresh(); } catch (e) { toast.error(e.message); } };
  const cols = [
    { header: 'User', accessorKey: 'name', cell: (c) => <div className="flex items-center gap-2.5"><div className="size-7 rounded-[3px] border border-line-2 grid place-items-center text-xs font-semibold text-mute">{c.getValue()[0]}</div><div><div className="font-medium">{c.getValue()}{c.row.original.is_demo ? <span className="badge badge-neutral ml-2">Demo</span> : null}</div><div className="text-[11px] text-mute">{c.row.original.email}</div></div></div> },
    { header: 'Role', accessorKey: 'role', cell: (c) => <select className="input !h-8 !w-[96px] !text-xs capitalize" value={c.getValue()} disabled={c.row.original.id === me.id} onChange={(e) => patch(c.row.original, { role: e.target.value }, `Role changed to ${e.target.value}`)} aria-label={`Role for ${c.row.original.email}`}><option value="user">User</option><option value="admin">Admin</option></select> },
    { header: 'Status', accessorKey: 'status', cell: (c) => { const u = c.row.original; const locked = u.locked_until && new Date(u.locked_until) > new Date(); return <div className="flex flex-wrap gap-1"><span className={`badge ${c.getValue() === 'active' ? 'badge-up' : 'badge-down'}`}>{c.getValue()}</span>{locked && <span className="badge badge-warn">locked</span>}</div>; } },
    { header: 'Email', accessorKey: 'email_verified_at', cell: (c) => c.getValue() ? <span className="badge badge-up" title={fmtDate(c.getValue())}>verified</span> : <span className="badge badge-warn">unverified</span> },
    { header: '2FA', accessorKey: 'totp_enabled', cell: (c) => <span className={c.getValue() ? 'text-ink text-xs' : 'text-dim text-xs'}>{c.getValue() ? 'On' : 'Off'}</span> },
    { header: 'Paper balance', accessorKey: 'balance', meta: { right: true }, cell: (c) => <span className="num">{fmtMoney(c.getValue())}</span> },
    { header: 'Last login', accessorKey: 'last_login_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: '', id: 'a', meta: { right: true }, cell: (c) => {
      const u = c.row.original; if (u.id === me.id) return <span className="text-xs text-dim">You</span>;
      const locked = u.locked_until && new Date(u.locked_until) > new Date();
      return (
        <div className="flex justify-end gap-1.5 whitespace-nowrap">
          {!u.email_verified_at && <button className="btn btn-ghost btn-sm" onClick={() => act(u, 'resend-verification', 'Verification email sent')}>Resend</button>}
          {locked && <button className="btn btn-ghost btn-sm" onClick={() => act(u, 'unlock', 'Account unlocked')}>Unlock</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Force a password reset for ${u.email}? They are signed out everywhere and emailed a reset link.`)) act(u, 'force-reset', 'Reset email sent, sessions revoked'); }}>Force reset</button>
          {u.status === 'active' ? <button className="btn btn-danger btn-sm" onClick={() => patch(u, { status: 'disabled' }, 'User disabled')}>Disable</button> : <button className="btn btn-ghost btn-sm" onClick={() => patch(u, { status: 'active' }, 'User enabled')}>Enable</button>}
        </div>
      );
    } },
  ];
  return (
    <div>
      <PageHeader title="Users" subtitle="Manage members: verification status, 2FA, lockouts, access and roles. Hashes and secrets are never shown or exported." actions={<ExcelButton path={`/export/users${r.exportQuery}`} />} />
      <Card pad={false} title={`${r.total} users`}>
        <FilterBar fields={FIELDS} values={r.filters} onChange={r.patch} onReset={r.reset} />
        <DataTable columns={cols} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={1000} emptyTitle="No users found" />
      </Card>
    </div>
  );
}
