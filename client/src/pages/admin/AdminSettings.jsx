import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Plus, Trash2, Upload, Link2, Film, ImagePlus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, PageHeader, Field, Spinner } from '../../components/ui.jsx';
import ExcelButton from '../../components/ExcelButton.jsx';
import HeroMedia from '../../components/HeroMedia.jsx';
import { Ad } from '../../components/AdSlot.jsx';
import { api } from '../../lib/api.js';
import { useSettings } from '../../store/settings.js';

const EXPORTS = [['signals', 'Signals'], ['trades', 'Trades'], ['orders', 'Orders'], ['users', 'Users'], ['watchlists', 'Watchlists'], ['activity', 'Login activity']];
const SLOTS = [['top', 'Top banner (every page)'], ['landing', 'Landing, under the hero'], ['dashboard', 'Beside the dashboard'], ['signals', 'Beside the signals'], ['between_signals', 'Between signal cards']];
const TYPES = [['link', 'Text link'], ['image', 'Image banner'], ['adsense', 'Google AdSense']];
const MAX_ADS = 12;
const VIDEO_MAX = 25 * 1024 * 1024; const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const IMAGE_MAX = 2 * 1024 * 1024; const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const BLANK_AD = { slot: 'top', type: 'link', title: '', text: '', cta: 'Learn more', url: 'https://', image: '', adClient: '', adSlot: '', enabled: true };
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Same rules as the server's describeVideo, so the preview matches what visitors will see. */
export function describeVideoClient(v) {
  const s = String(v || '').trim(); if (!s) return null;
  if (/^\/uploads\/hero-[\w.-]+$/.test(s)) return { kind: 'file', src: s };
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let yt = null;
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') yt = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1];
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&playsinline=1&rel=0&modestbranding=1` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') { const id = (u.pathname.match(/(\d{6,12})/) || [])[1]; if (id) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}?background=1&autoplay=1&muted=1&loop=1&dnt=1` }; }
  return { kind: 'file', src: s };
}

function HeroVideoCard({ value, onChange }) {
  const setS = useSettings((s) => s.set);
  const [url, setUrl] = useState(/^https:/.test(value) ? value : ''); const [busy, setBusy] = useState(''); const [failed, setFailed] = useState(false);
  const file = useRef(null);
  const current = describeVideoClient(value);
  useEffect(() => setFailed(false), [value]);
  const apply = (r) => { onChange(r.heroVideoUrl || ''); setS({ heroVideoUrl: r.heroVideoUrl || null, heroVideo: r.heroVideo || null }); };

  const saveUrl = async () => {
    const v = url.trim();
    if (!v.startsWith('https://')) return toast.error('Use an https:// link (http:// videos are blocked by browsers on an https site).');
    setBusy('url');
    try { apply(await api('/admin/hero-video', { method: 'PUT', body: { url: v } })); toast.success('Hero video saved. It is live on the home page now.'); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const upload = async (e) => {
    const v = e.target.files?.[0]; e.target.value = ''; if (!v) return;
    if (v.type && !VIDEO_TYPES.includes(v.type)) return toast.error('Use an MP4 (H.264), WebM or MOV file.');
    if (v.size > VIDEO_MAX) return toast.error(`This file is ${mb(v.size)}. The limit is 25 MB: compress it, or upload it to YouTube / Vimeo and paste the link.`);
    setBusy(`Uploading ${mb(v.size)}…`);
    try { const fd = new FormData(); fd.append('video', v); apply(await api('/admin/hero-video', { method: 'POST', form: fd })); setUrl(''); toast.success('Hero video uploaded. It is live on the home page now.'); }
    catch (e2) { toast.error(e2.message); } finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('remove');
    try { await api('/admin/hero-video', { method: 'DELETE' }); apply({ heroVideoUrl: null }); setUrl(''); toast.success('Hero video removed. The live market widgets are shown instead.'); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <Card title="Media: hero video" subtitle="Plays muted and looped beside the headline on the home page. Saved immediately.">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <div className="space-y-4 min-w-0">
          <Field label="Video link" hint="A direct https:// .mp4 / .webm file, or a YouTube or Vimeo link.">
            <div className="flex gap-2"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/… or https://cdn…/promo.mp4" maxLength={500} data-testid="hero-video-url" />
              <button type="button" className="btn btn-primary shrink-0" onClick={saveUrl} disabled={!!busy || !url.trim()} data-testid="hero-video-save">{busy === 'url' ? <Spinner /> : <Link2 size={14} />}Use link</button></div>
          </Field>
          <div className="rounded-xl border border-dashed border-line-2 bg-white/40 p-4">
            <p className="text-[0.9375rem] font-medium">Or upload a file</p>
            <p className="text-[0.875rem] text-mute mt-1">MP4 (H.264), WebM or MOV, up to 25 MB. Short loops of 10–20 seconds at 1280×720 work best.</p>
            <input ref={file} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="hidden" onChange={upload} data-testid="hero-video-file" />
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => file.current?.click()} disabled={!!busy}>{busy.startsWith('Uploading') ? <><Spinner />{busy}</> : <><Upload size={14} />Choose video</>}</button>
              {value && <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={!!busy}><Trash2 size={14} />Remove video</button>}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <p className="label mb-2">Live preview</p>
          {current ? (
            <>
              {failed ? <div className="aspect-video rounded-xl grid place-items-center text-center p-5 bg-[#fff1f2] text-[#8f1d2c] text-[0.9375rem] border border-down/25"><div><AlertTriangle className="mx-auto mb-2" size={20} />This link does not play as a video. Use a direct .mp4 / .webm file or a YouTube / Vimeo link. Visitors see the market widgets instead.</div></div>
                : <HeroMedia key={current.src} video={current} onFail={() => setFailed(true)} className="rounded-xl border border-line" />}
              <p className="text-[0.875rem] text-mute mt-2 break-all flex gap-1.5"><CheckCircle2 size={14} className={clsx('shrink-0 mt-px', failed ? 'text-down' : 'text-up')} />{current.kind === 'file' ? value : `${current.kind === 'youtube' ? 'YouTube' : 'Vimeo'} embed`}</p>
            </>
          ) : <div className="aspect-video rounded-xl grid place-items-center bg-ink/[0.04] border border-line text-mute text-[0.9375rem]"><div className="text-center"><Film className="mx-auto mb-2" size={20} />No video. The home page shows live market widgets.</div></div>}
        </div>
      </div>
    </Card>
  );
}

function AdRow({ a, i, err, set, remove }) {
  const [up, setUp] = useState(false); const img = useRef(null);
  const e = (k) => err?.[k];
  const pickImage = async (ev) => {
    const f = ev.target.files?.[0]; ev.target.value = ''; if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) return toast.error('Use a PNG, JPEG, WebP or GIF image.');
    if (f.size > IMAGE_MAX) return toast.error(`The image is ${mb(f.size)}. The limit is 2 MB.`);
    setUp(true);
    try { const fd = new FormData(); fd.append('image', f); const r = await api('/admin/ad-image', { method: 'POST', form: fd }); set({ image: r.image }); toast.success('Image uploaded. Save settings to publish.'); }
    catch (er) { toast.error(er.message); } finally { setUp(false); }
  };
  const paste = (code) => {
    const client = (code.match(/ca-pub-\d{10,20}/) || [])[0]; const slot = (code.match(/data-ad-slot\s*=\s*["']?(\d{6,20})/i) || [])[1];
    if (!client && !slot) return toast.error('No AdSense publisher id (ca-pub-…) or data-ad-slot found in the pasted code.');
    set({ ...(client && { adClient: client }), ...(slot && { adSlot: slot }) }); toast.success('AdSense ids read from the code.');
  };
  const inv = (k) => clsx('input', e(k) && '!border-down');
  const msg = (k) => e(k) && <span className="block text-[0.875rem] text-down mt-1" role="alert">{e(k)}</span>;
  return (
    <div className={clsx('glass p-4 sm:p-5 !rounded-xl', !a.enabled && 'opacity-75')} data-testid={`ad-row-${i}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_auto]">
        <Field label="Placement"><select className="input" value={a.slot} onChange={(ev) => set({ slot: ev.target.value })} data-testid={`ad-slot-${i}`}>{SLOTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Type"><select className="input" value={a.type} onChange={(ev) => set({ type: ev.target.value })} data-testid={`ad-type-${i}`}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <div className="flex items-end gap-2"><label className="flex items-center gap-2 text-sm h-10 px-1"><input type="checkbox" className="size-4 accent-[#1a5ad7]" checked={a.enabled} onChange={(ev) => set({ enabled: ev.target.checked })} />Enabled</label>
          <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ad ${i + 1}`} onClick={remove}><Trash2 size={15} /></button></div>
      </div>

      {a.type === 'adsense' ? (
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Paste the AdSense ad unit code" hint="We read the publisher id and slot id; the script itself is loaded by the site."><textarea className="input !h-20 !py-2 font-mono text-[0.875rem]" placeholder={'<ins class="adsbygoogle" data-ad-client="ca-pub-…" data-ad-slot="…">'} onBlur={(ev) => ev.target.value.trim() && paste(ev.target.value)} /></Field>
          <div className="grid gap-3">
            <label className="block"><span className="label block mb-1.5">Publisher id</span><input className={inv('adClient')} value={a.adClient} onChange={(ev) => set({ adClient: ev.target.value.trim() })} placeholder="ca-pub-1234567890123456" data-testid={`ad-client-${i}`} />{msg('adClient')}</label>
            <label className="block"><span className="label block mb-1.5">Ad slot id</span><input className={inv('adSlot')} value={a.adSlot} onChange={(ev) => set({ adSlot: ev.target.value.trim() })} placeholder="1234567890" inputMode="numeric" data-testid={`ad-adslot-${i}`} />{msg('adSlot')}</label>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <label className="block"><span className="label block mb-1.5">Title{a.type === 'image' && ' (optional)'}</span><input className={inv('title')} value={a.title} onChange={(ev) => set({ title: ev.target.value })} maxLength={60} data-testid={`ad-title-${i}`} />{msg('title')}</label>
          <label className="block"><span className="label block mb-1.5">Link (https://)</span><input className={inv('url')} value={a.url} onChange={(ev) => set({ url: ev.target.value })} maxLength={500} data-testid={`ad-url-${i}`} />{msg('url')}</label>
          {a.type === 'image' ? (
            <div className="sm:col-span-2">
              <span className="label block mb-1.5">Image (PNG, JPEG, WebP or GIF, up to 2 MB; wide banners around 1200×200 work best)</span>
              <div className="flex flex-wrap gap-2 items-start">
                <input className={clsx(inv('image'), 'flex-1 min-w-[220px]')} value={a.image} onChange={(ev) => set({ image: ev.target.value })} placeholder="https://… or upload" maxLength={500} data-testid={`ad-image-${i}`} />
                <input ref={img} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pickImage} />
                <button type="button" className="btn btn-ghost" onClick={() => img.current?.click()} disabled={up}>{up ? <Spinner /> : <ImagePlus size={14} />}Upload image</button>
              </div>{msg('image')}
            </div>
          ) : null}
          <label className="block"><span className="label block mb-1.5">Text</span><input className="input" value={a.text} onChange={(ev) => set({ text: ev.target.value })} maxLength={160} /></label>
          <label className="block"><span className="label block mb-1.5">Button label</span><input className="input" value={a.cta} onChange={(ev) => set({ cta: ev.target.value })} maxLength={24} /></label>
        </div>
      )}
      {a.type !== 'adsense' && (a.type === 'link' ? a.title : a.image) && (
        <div className="mt-4"><p className="label mb-2">Preview</p><Ad ad={a} layout={a.slot === 'top' || a.slot === 'landing' ? 'banner' : a.slot === 'between_signals' ? 'card' : 'box'} preview /></div>
      )}
    </div>
  );
}

export default function AdminSettings() {
  const reload = useSettings((s) => s.load);
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState({});
  useEffect(() => { api('/admin/settings').then((r) => setF(r.settings)).catch((e) => toast.error(e.message)); }, []);
  if (!f) return <div className="grid place-items-center h-40"><Spinner /></div>;
  const setAd = (i, p) => setF((cur) => ({ ...cur, ads: cur.ads.map((a, j) => (j === i ? { ...a, ...p } : a)) }));

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({});
    try {
      const r = await api('/admin/settings', { method: 'PUT', body: { site_name: f.site_name, tagline: f.tagline, ads: f.ads } });
      setF(r.settings); await reload(); toast.success('Settings saved');
    } catch (e2) {
      const map = {};
      for (const d of e2.details || []) { const m = d.field.match(/^ads\.(\d+)\.(\w+)/); if (m) { map[m[1]] = { ...(map[m[1]] || {}), [m[2]]: d.message }; } }
      setErrs(map);
      const n = Object.keys(map).length;
      toast.error(n ? `Fix ${n === 1 ? 'the highlighted ad' : `the ${n} highlighted ads`} and save again.` : e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Site settings" subtitle="Branding, hero video, ads and data export." />
      <div className="space-y-5">
        <form onSubmit={save} className="space-y-5" id="settings-form">
          <Card title="Branding">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Site name" hint="Shown in the logo, page title, link previews and exports."><input className="input" value={f.site_name} onChange={(e) => setF({ ...f, site_name: e.target.value })} minLength={2} maxLength={40} required /></Field>
              <Field label="Tagline"><input className="input" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} maxLength={140} /></Field>
            </div>
          </Card>
        </form>

        <HeroVideoCard value={f.hero_video_url} onChange={(v) => setF((cur) => ({ ...cur, hero_video_url: v }))} />

        <Card title="Ads" subtitle={`Up to ${MAX_ADS}. Every ad carries an "Ad" label. Disabled ads are not sent to visitors. Google AdSense scripts are only allowed by the security policy while an AdSense ad is enabled.`}
          actions={f.ads.length < MAX_ADS && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, ads: [...f.ads, { ...BLANK_AD }] })} data-testid="add-ad"><Plus size={14} />Add ad</button>}>
          {!f.ads.length ? <p className="text-sm text-mute">No ads configured. Nothing is shown on the site.</p> : (
            <div className="space-y-3">
              {f.ads.map((a, i) => <AdRow key={a.id || `new${i}`} a={a} i={i} err={errs[i]} set={(p) => setAd(i, p)} remove={() => setF({ ...f, ads: f.ads.filter((_, j) => j !== i) })} />)}
            </div>
          )}
        </Card>
        <div className="sticky bottom-[76px] lg:bottom-4 z-10 flex justify-end">
          <button form="settings-form" className="btn btn-primary !h-11 !px-6 shadow-[var(--shadow-float)]" disabled={busy} data-testid="save-settings">{busy ? <Spinner /> : 'Save settings'}</button>
        </div>

        <Card title="Excel export controls" subtitle="Filtered, formatted .xlsx downloads of the full database">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{EXPORTS.map(([k, l]) => <ExcelButton key={k} path={`/export/${k}?scope=all`} label={l} />)}</div>
          <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-4"><p className="text-xs text-mute flex-1 min-w-[240px]">The master workbook (all sheets in one file) is rebuilt a few seconds after changes, at most once every 5 minutes. Downloading it always includes the latest changes.</p><ExcelButton path="/export/master" label="Download master workbook" small={false} ghost={false} /></div>
        </Card>
      </div>
    </div>
  );
}
