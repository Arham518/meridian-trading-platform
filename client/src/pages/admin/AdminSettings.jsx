import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Card, PageHeader, Field, Spinner } from '../../components/ui.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import { api } from '../../lib/api.js';
import { useSettings } from '../../store/settings.js';

const EXPORTS = [['signals', 'Signals'], ['trades', 'Trades'], ['orders', 'Orders'], ['users', 'Users'], ['watchlists', 'Watchlists'], ['activity', 'Login activity']];
const BLANK_AD = { slot: 'landing', title: '', text: '', cta: 'Learn more', url: 'https://', enabled: true };

export default function AdminSettings() {
  const setS = useSettings((s) => s.set); const reload = useSettings((s) => s.load);
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [up, setUp] = useState(false); const file = useRef(null);
  useEffect(() => { api('/admin/settings').then((r) => setF(r.settings)).catch((e) => toast.error(e.message)); }, []);
  if (!f) return <div className="grid place-items-center h-40"><Spinner /></div>;
  const setAd = (i, p) => setF({ ...f, ads: f.ads.map((a, j) => (j === i ? { ...a, ...p } : a)) });

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api('/admin/settings', { method: 'PUT', body: { site_name: f.site_name, tagline: f.tagline, hero_video_url: f.hero_video_url, ads: f.ads } });
      setF(r.settings); await reload(); toast.success('Settings saved');
    } catch (e2) { toast.error(e2.message); } finally { setBusy(false); }
  };
  const upload = async (e) => {
    const v = e.target.files?.[0]; if (!v) return; setUp(true);
    try { const fd = new FormData(); fd.append('video', v); const r = await api('/admin/hero-video', { method: 'POST', form: fd }); setF({ ...f, hero_video_url: r.heroVideoUrl }); setS({ heroVideoUrl: r.heroVideoUrl }); toast.success('Hero video uploaded'); }
    catch (e2) { toast.error(e2.message); } finally { setUp(false); e.target.value = ''; }
  };
  const removeVideo = async () => { try { await api('/admin/hero-video', { method: 'DELETE' }); setF({ ...f, hero_video_url: '' }); setS({ heroVideoUrl: null }); toast.success('Hero video removed, the 3D scene is back'); } catch (e2) { toast.error(e2.message); } };

  return (
    <div className="max-w-5xl">
      <PageHeader title="Site settings: ads and media" subtitle="Branding, ads and media, and data export." />
      <form onSubmit={save} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Branding">
            <div className="space-y-4">
              <Field label="Site name" hint="Shown in the logo, page title and exports."><input className="input" value={f.site_name} onChange={(e) => setF({ ...f, site_name: e.target.value })} minLength={2} maxLength={40} required /></Field>
              <Field label="Tagline"><input className="input" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} maxLength={140} /></Field>
            </div>
          </Card>
          <Card title="Media: hero video" subtitle="Optional. Leave empty to show the 3D scene.">
            <div className="space-y-3">
              <Field label="Video URL" hint="An https:// link to an MP4 or WebM, or upload a file below (up to 25 MB)."><input className="input" value={f.hero_video_url} onChange={(e) => setF({ ...f, hero_video_url: e.target.value })} placeholder="https://example.com/promo.mp4" maxLength={500} data-testid="hero-video-url" /></Field>
              <div className="flex flex-wrap gap-2">
                <input ref={file} type="file" accept="video/mp4,video/webm" className="hidden" onChange={upload} data-testid="hero-video-file" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => file.current?.click()} disabled={up}>{up ? <Spinner /> : <Upload size={14} />}Upload video</button>
                {f.hero_video_url && <button type="button" className="btn btn-ghost btn-sm" onClick={removeVideo}>Remove video</button>}
              </div>
              <p className="text-xs text-dim">The video plays muted and looped in the hero. Save settings after editing the URL.</p>
            </div>
          </Card>
        </div>

        <Card title="Ads" subtitle="Up to four. Every ad is shown with an Advertisement label. Disabled ads are not sent to visitors."
          actions={f.ads.length < 4 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, ads: [...f.ads, { ...BLANK_AD }] })}><Plus size={14} />Add ad</button>}>
          {!f.ads.length ? <p className="text-sm text-mute">No ads configured. Nothing is shown on the site.</p> : (
            <div className="divide-y divide-[color:var(--color-line)] -my-4">
              {f.ads.map((a, i) => (
                <div key={i} className="py-4 grid gap-3 md:grid-cols-[130px_1fr_1fr_auto]" data-testid={`ad-row-${i}`}>
                  <Field label="Placement"><select className="input" value={a.slot} onChange={(e) => setAd(i, { slot: e.target.value })}><option value="landing">Landing page</option><option value="dashboard">Dashboard</option></select></Field>
                  <Field label="Title"><input className="input" value={a.title} onChange={(e) => setAd(i, { title: e.target.value })} maxLength={60} required /></Field>
                  <Field label="Link (https://)"><input className="input" value={a.url} onChange={(e) => setAd(i, { url: e.target.value })} maxLength={500} required /></Field>
                  <div className="flex items-end gap-2 pb-0.5"><label className="flex items-center gap-2 text-sm h-9"><input type="checkbox" className="accent-[#d9a441]" checked={a.enabled} onChange={(e) => setAd(i, { enabled: e.target.checked })} />Enabled</label><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove ad" onClick={() => setF({ ...f, ads: f.ads.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></div>
                  <div className="md:col-start-2"><Field label="Text"><input className="input" value={a.text} onChange={(e) => setAd(i, { text: e.target.value })} maxLength={140} /></Field></div>
                  <Field label="Button label"><input className="input" value={a.cta} onChange={(e) => setAd(i, { cta: e.target.value })} maxLength={24} /></Field>
                </div>
              ))}
            </div>
          )}
        </Card>
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Save settings'}</button>
      </form>

      <Card title="Excel export controls" subtitle="Filtered, formatted .xlsx downloads of the full database" className="mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{EXPORTS.map(([k, l]) => <ExcelButton key={k} path={`/export/${k}?scope=all`} label={l} />)}</div>
        <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-4"><p className="text-xs text-mute flex-1 min-w-[240px]">The master workbook (all sheets in one file) is rewritten automatically a moment after any change: new signals, registrations, trades and edits.</p><ExcelButton path="/export/master" label="Download master workbook" small={false} ghost={false} /></div>
      </Card>
    </div>
  );
}
