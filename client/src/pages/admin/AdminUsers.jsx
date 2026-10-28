import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil, UserPlus, Trash2, Download } from 'lucide-react';
import DataTable from '../../components/DataTable.jsx';
import FilterBar from '../../components/FilterBar.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { Card, PageHeader, Modal, Spinner } from '../../components/ui.jsx';
import { UserForm, DeleteUser, UserDrawer } from '../../components/UserEditor.jsx';
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
const POLL_MS = 30000; // safety net; live updates normally arrive through the socket

export default function AdminUsers() {
  const me = useAuth((s) => s.user);
  const usersTick = useMarket((s) => s.usersTick);
  const r = useRecords('/admin/users', {});
  const [modal, setModal] = useState(null); // { kind: 'create' | 'delete', u }
  // ?edit=<id> opens the edit drawer (links from the overview and activity rows)
  const [params, setParams] = useSearchParams();
  const editId = Number(params.get('edit')) || null;
  const openEdit = (id) => setParams((p) => { const n = new URLSearchParams(p); n.set('edit', String(id)); return n; });
  const closeEdit = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('edit'); return n; }, { replace: true });
  const { refresh } = r;
  // live: the socket bumps usersTick on registrations / logins / edits; poll as a fallback while the page is open
  useEffect(() => { if (usersTick) refresh(); }, [usersTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setModal(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const exportCsv = async () => { setCsvBusy(true); try { await download(`/admin/users/export.csv${r.exportQuery}`, 'users.csv'); } catch (e) { toast.error(e.message); } finally { setCsvBusy(false); } };
  const saved = () => { setModal(null); r.refresh(); };
  const patch = async (u, body, msg) => { try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); toast.success(msg); r.refresh(); } catch (e) { toast.error(e.message); } };
    const cols = [
    { header: 'User', accessorKey: 'name', cell: (c) => <button type="button" onClick={() => openEdit(c.row.original.id)} className="flex items-center gap-2.5 text-left group" title="Edit user"><div className="size-8 rounded-xl bg-accent-soft text-accent-2 grid place-items-center text-xs font-bold">{c.getValue()[0]}</div><div><div className="font-medium group-hover:text-accent-2 group-hover:underline underline-offset-2">{c.getValue()}{c.row.original.is_demo ? <span className="badge badge-neutral ml-2">Demo</span> : null}</div><div className="text-[11px] text-mute">{c.row.original.email}{c.row.original.username ? ` · @${c.row.original.username}` : ''}</div></div></button> },
    { header: 'Role', accessorKey: 'role', cell: (c) => <select className="input !h-8 !w-[96px] !text-xs capitalize" value={c.getValue()} disabled={c.row.original.id === me.id} onChange={(e) => patch(c.row.original, { role: e.target.value }, `Role changed to ${e.target.value}`)} aria-label={`Role for ${c.row.original.email}`}><option value="user">User</option><option value="admin">Admin</option></select> },
    { header: 'Status', accessorKey: 'status', cell: (c) => { const u = c.row.original; const locked = u.locked_until && new Date(u.locked_until) > new Date(); return <div className="flex flex-wrap gap-1"><span className={`badge ${c.getValue() === 'active' ? 'badge-up' : 'badge-down'}`}>{c.getValue()}</span>{locked && <span className="badge badge-warn">locked</span>}</div>; } },
    { header: 'Email', accessorKey: 'email_verified_at', cell: (c) => c.getValue() ? <span className="badge badge-up" title={fmtDate(c.getValue())}>verified</span> : <span className="badge badge-warn">unverified</span> },
    { header: '2FA', accessorKey: 'totp_enabled', cell: (c) => <span className={c.getValue() ? 'text-ink text-xs' : 'text-dim text-xs'}>{c.getValue() ? 'On' : 'Off'}</span> },
    { header: 'Paper balance', accessorKey: 'balance', meta: { right: true }, cell: (c) => <span className="num">{fmtMoney(c.getValue())}</span> },
    { header: 'Registered', accessorKey: 'created_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: 'Last login', accessorKey: 'last_login_at', cell: (c) => <span className="text-mute">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: 'Actions', id: 'a', meta: { right: true, sticky: true }, cell: (c) => {
      const u = c.row.original; const self = u.id === me.id;
      return (
        <div className="flex justify-end gap-1.5 whitespace-nowrap">
          <button className="btn btn-primary btn-sm" onClick={() => openEdit(u.id)} aria-label={`Edit ${u.email}`} data-testid={`edit-user-${u.id}`}><Pencil size={13} />Edit</button>
          {!self && (u.status === 'active' ? <button className="btn btn-danger btn-sm" onClick={() => patch(u, { status: 'disabled' }, 'User disabled')}>Disable</button> : <button className="btn btn-ghost btn-sm" onClick={() => patch(u, { status: 'active' }, 'User enabled')}>Enable</button>)}
          {!self && <button className="btn btn-danger btn-sm btn-icon" onClick={() => setModal({ kind: 'delete', u })} aria-label={`Delete ${u.email}`} title="Delete user" data-testid={`delete-user-${u.id}`}><Trash2 size={13} /></button>}
          {self && <span className="text-xs text-dim self-center px-1">You</span>}
        </div>
      );
    } },
  ];
  return (
    <div>
      <PageHeader title="Users" subtitle="Every registered member, updated live. Click a name or Edit to change profile, role, status, balance or password, or to delete the user. Hashes and secrets are never shown or exported."
        actions={<div className="flex flex-wrap gap-2"><button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'create' })}><UserPlus size={14} />Create user</button><button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={csvBusy} data-testid="export-users-csv">{csvBusy ? <Spinner /> : <Download size={14} />}Export CSV</button><ExcelButton path={`/export/users${r.exportQuery}`} /></div>} />
      <Card pad={false} title={`${r.total} users`}>
        <FilterBar fields={FIELDS} values={r.filters} onChange={r.patch} onReset={r.reset} />
        <DataTable columns={cols} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={1180} emptyTitle="No users found" />
      </Card>
      <Modal open={!!modal} onClose={close} width="max-w-xl"
        title={modal?.kind === 'delete' ? 'Delete user' : 'Create user'}>
        {modal?.kind === 'delete' ? <DeleteUser u={modal.u} onClose={close} onDone={saved} /> : modal && <UserForm key="new" u={null} me={me} onClose={close} onSaved={saved} />}
      </Modal>
      <UserDrawer userId={editId} me={me} onClose={closeEdit} onChanged={r.refresh} />
    </div>
  );
}
