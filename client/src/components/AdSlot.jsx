import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { useSettings } from '../store/settings.js';

/*
  Admin-managed ad units. Always labelled "Advertisement"; renders nothing when no ad is enabled for the slot.
  Slots: top (banner on top of the app and home page), landing (home page, under the hero), dashboard (beside the
  dashboard), signals (beside the signals list), between_signals (inside the signals feed).
  Types: link (text ad), image (banner image + link), adsense (Google AdSense unit; the server adds Google's domains to
  the Content Security Policy while such a unit is enabled).
*/

let adsenseLoaded = null;
function loadAdsense(client) {
  if (adsenseLoaded) return adsenseLoaded;
  adsenseLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.onload = resolve; s.onerror = () => { adsenseLoaded = null; reject(new Error('AdSense blocked')); };
    document.head.appendChild(s);
  });
  return adsenseLoaded;
}

function AdsenseUnit({ ad, layout }) {
  const ref = useRef(null);
  useEffect(() => {
    let done = false;
    loadAdsense(ad.adClient).then(() => {
      if (done || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* unit already filled */ }
    }).catch(() => {});
    return () => { done = true; };
  }, [ad.adClient, ad.adSlot]);
  return (
    <ins ref={ref} className="adsbygoogle block w-full" style={{ display: 'block', minHeight: layout === 'banner' ? 90 : 250 }}
      data-ad-client={ad.adClient} data-ad-slot={ad.adSlot} data-ad-format={layout === 'banner' ? 'horizontal' : 'auto'} data-full-width-responsive="true" />
  );
}

const Label = () => <span className="label !text-[0.75rem] !tracking-[0.08em] !text-dim">Advertisement</span>;

/** One ad. layout: 'banner' (wide strip), 'box' (sidebar card), 'card' (inside a feed). */
export function Ad({ ad, layout = 'banner', className = '', preview = false }) {
  const tid = preview ? `ad-preview-${ad.slot}` : `ad-${ad.slot}`;
  if (ad.type === 'adsense') {
    return (
      <aside aria-label="Advertisement" className={clsx('glass p-3 overflow-hidden', className)} data-testid={tid} data-ad-type="adsense">
        <div className="mb-2"><Label /></div>
        <AdsenseUnit ad={ad} layout={layout} />
      </aside>
    );
  }
  if (ad.type === 'image') {
    return (
      <aside aria-label="Advertisement" className={clsx('glass overflow-hidden', className)} data-testid={tid} data-ad-type="image">
        <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" className="group block relative">
          <img src={ad.image} alt={ad.title || 'Advertisement'} loading="lazy" decoding="async"
            className={clsx('w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]', layout === 'banner' ? 'aspect-[4/1] sm:aspect-[6/1] lg:aspect-[8/1]' : 'h-auto max-h-[300px]')} />
          <span className="absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#475467]">Ad</span>
        </a>
        {(ad.title || ad.text) && layout !== 'banner' && (
          <div className="p-3.5 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[1rem] font-semibold truncate">{ad.title}</p>{ad.text && <p className="text-[0.875rem] text-mute truncate">{ad.text}</p>}</div>
            <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" className="btn btn-ghost btn-sm shrink-0">{ad.cta}<ArrowUpRight size={13} /></a></div>
        )}
      </aside>
    );
  }
  return (
    <aside aria-label="Advertisement" data-testid={tid} data-ad-type="link"
      className={clsx('glass', layout === 'banner' ? 'px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-x-5 gap-y-1.5' : 'p-4 flex flex-col gap-3', className)}>
      <Label />
      <div className="min-w-0 flex-1"><p className="text-[1rem] font-semibold">{ad.title}</p>{ad.text && <p className="text-[0.9375rem] text-mute mt-0.5">{ad.text}</p>}</div>
      <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" className="btn btn-ghost btn-sm shrink-0 self-start sm:self-auto">{ad.cta}<ArrowUpRight size={13} /></a>
    </aside>
  );
}

export const useAds = (slot) => useSettings((s) => s.ads).filter((a) => a.slot === slot);

/** First enabled ad for a slot (legacy prop `variant`: 'strip' = banner, 'box'). */
export default function AdSlot({ slot, className = '', variant = 'strip', layout }) {
  const ads = useAds(slot);
  if (!ads.length) return null;
  return <Ad ad={ads[0]} layout={layout || (variant === 'box' ? 'box' : 'banner')} className={className} />;
}
