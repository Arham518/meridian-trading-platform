import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Send, RefreshCw, Copy } from 'lucide-react';
import DataTable from '../../components/DataTable.jsx';
import FilterBar from '../../components/FilterBar.jsx';
import { Card, PageHeader, Modal, Spinner } from '../../components/ui.jsx';
import { useRecords } from '../../lib/useRecords.js';
import { useFetch } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../store/auth.js';
import { fmtDate } from '../../lib/format.js';

const FIELDS = [
  { key: 'q', type: 'search', label: 'Search recipient or subject' },
  { key: 'status', type: 'select', label: 'Any result', options: [['saved', 'Saved (no SMTP)'], ['sent', 'Sent'], ['failed', 'Failed']] },
];
const STATUS = { saved: 'badge-warn', sent: 'badge-up', failed: 'badge-down' };
const copy = (v) => navigator.clipboard?.writeText(v).then(() => toast.success('Link copied'), () => toast.error('Copy failed'));

function MailView({ id }) {
  const f = useFetch(() => api(`/admin/emails/${id}`), [id]);
  if (f.loading) return <div className="grid place-items-center h-40"><Spinner /></div>;
  if (f.error) return <p className="text-sm text-down">{f.error}</p>;
  const m = f.data.email;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm"><dt className="text-mute">To</dt><dd>{m.to_addr}</dd><dt className="text-mute">Subject</dt><dd>{m.subject}</dd><dt className="text-mute">Time</dt><dd>{fmtDate(m.created_at, 'dd MMM yy, HH:mm:ss')}</dd>{m.error && <><dt className="text-mute">Error</dt><dd className="text-down">{m.error}</dd></>}</dl>
      {m.link && <div className="flex items-center gap-2"><a className="text-accent-2 text-sm break-all underline" href={m.link} target="_blank" rel="noreferrer">{m.link}</a><button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(m.link)} aria-label="Copy link"><Copy size={13} /></button></div>}
      {m.html ? <iframe title="Email preview" sandbox="" srcDoc={m.html} className="w-full h-[420px] rounded-md bg-white border border-line" />
        : <p className="text-sm text-mute">Sent through SMTP: the message body is not stored.</p>}
    </div>
  );
}

export default function AdminEmail() {
  const me = useAuth((s) => s.user);
  const st = useFetch(() => api('/admin/email'), []);
  const r = useRecords('/admin/emails', {});
  const [sending, setSending] = useState(false); const [checking, setChecking] = useState(false); const [view, setView] = useState(null);
  const { refresh } = r;
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) refresh(); }, 15000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sendTest = async () => {
    setSending(true);
    try { const x = await api('/admin/test-email', { method: 'POST' }); toast.success(x.savedToOutbox ? 'No SMTP set: test email saved to the outbox below' : `Test email sent to ${x.to}`); }
    catch (e) { toast.error(e.message); } finally { setSending(false); r.refresh(); }
  };
  const check = async () => {
    setChecking(true);
    try { const x = await api('/admin/email/check', { method: 'POST' }); st.setData(x); if (x.check?.ok) toast.success('SMTP login works'); else toast.error(`SMTP check failed: ${x.check?.error || 'unknown error'}`); }
    catch (e) { toast.error(e.message); } finally { setChecking(false); }
  };
  const s = st.data;
  const cols = [
    { header: 'Time', accessorKey: 'created_at', cell: (c) => <span className="text-mute whitespace-nowrap">{fmtDate(c.getValue(), 'dd MMM yy, HH:mm')}</span> },
    { header: 'To', accessorKey: 'to_addr' },
    { header: 'Subject', accessorKey: 'subject', cell: (c) => <span className="line-clamp-1">{c.getValue()}</span> },
    { header: 'Type', accessorKey: 'kind', cell: (c) => <span className="text-xs text-mute">{c.getValue()}</span> },
    { header: 'Result', accessorKey: 'status', cell: (c) => <span className={`badge ${STATUS[c.getValue()] || 'badge-neutral'}`} title={c.row.original.error || ''}>{c.getValue()}</span> },
    { header: '', id: 'a', meta: { right: true }, cell: (c) => (
      <div className="flex justify-end gap-1.5 whitespace-nowrap">
        {c.row.original.link && <button className="btn btn-ghost btn-sm" onClick={() => copy(c.row.original.link)}><Copy size={13} />Link</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => setView(c.row.original.id)}>Open</button>
      </div>
    ) },
  ];
  return (
    <div>
      <PageHeader title="Email" subtitle="Delivery settings, a test email and every message the site sent or saved." />
      <Card title="Delivery" className="mb-4" actions={<div className="flex gap-2">{s?.smtp && <button className="btn btn-ghost btn-sm" onClick={check} disabled={checking}>{checking ? <Spinner /> : <RefreshCw size={14} />}Check SMTP</button>}<button className="btn btn-primary btn-sm" onClick={sendTest} disabled={sending}>{sending ? <Spinner /> : <Send size={14} />}Send test email</button></div>}>
        {!s ? <Spinner /> : s.smtp ? (
          <div className="text-sm space-y-1">
            <p><span className="badge badge-up mr-2">SMTP configured</span>Emails are delivered to real inboxes.</p>
            <p className="text-mute">Server <span className="text-ink num">{s.smtp.host}:{s.smtp.port}</span>{s.smtp.secure ? ' (SSL)' : ' (STARTTLS)'} · login <span className="text-ink">{s.smtp.user || 'none'}</span> · password {s.smtp.passwordSet ? 'set' : <span className="text-down">missing</span>} · from <span className="text-ink">{s.from}</span></p>
            {s.check?.checked && (s.check.ok ? <p className="text-up text-xs">Last check: login OK ({fmtDate(s.check.at, 'dd MMM yy, HH:mm')})</p> : <p className="text-down text-xs">Last check failed: {s.check.error}</p>)}
          </div>
        ) : (
          <div className="text-sm space-y-1">
            <p><span className="badge badge-warn mr-2">SMTP not configured</span>Emails are NOT delivered. They are saved and listed below, so you can open a verification or reset link yourself.</p>
            <p className="text-mute text-xs">To send real email add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM to the server environment and restart. The test email goes to {me.email}.</p>
          </div>
        )}
      </Card>
      <Card pad={false} title={`${r.total} emails`} subtitle="Newest first. The latest 300 are kept.">
        <FilterBar fields={FIELDS} values={r.filters} onChange={r.patch} onReset={r.reset} />
        <DataTable columns={cols} data={r.rows} loading={r.loading} error={r.error} onRetry={r.reload} page={r.page} pages={r.pages} total={r.total} pageSize={r.pageSize} onPage={r.setPage} minWidth={860} emptyTitle="No emails yet" />
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title="Email" width="max-w-3xl">{view && <MailView id={view} />}</Modal>
    </div>
  );
}
