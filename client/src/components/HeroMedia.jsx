import { useEffect, useRef, useState } from 'react';

/**
 * Hero video from Admin > Site settings: an uploaded file, a direct https:// video, or a YouTube / Vimeo embed.
 * Plays muted, looped and inline (required for autoplay on phones). If the video cannot play (broken link, a web page
 * instead of a video file, unsupported codec) `onFail` is called so the page can show its normal visual instead.
 */
export default function HeroMedia({ video, onFail, className = '' }) {
  const ref = useRef(null); const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || video?.kind !== 'file') return undefined;
    el.muted = true; el.defaultMuted = true; el.setAttribute('muted', ''); // React does not reflect `muted` to the attribute
    const p = el.play(); if (p?.catch) p.catch(() => { /* autoplay refused: the poster frame stays, controls are not needed */ });
    return undefined;
  }, [video?.src, video?.kind]);
  if (!video) return null;
  if (video.kind === 'youtube' || video.kind === 'vimeo') {
    return (
      <div className={`relative w-full aspect-video overflow-hidden ${className}`} data-testid="hero-video" data-kind={video.kind}>
        <iframe src={video.src} title="Product video" className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      </div>
    );
  }
  return (
    <div className={`relative w-full aspect-video overflow-hidden bg-night ${className}`} data-testid="hero-video" data-kind="file">
      <video ref={ref} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`} src={video.src}
        autoPlay muted loop playsInline preload="metadata" aria-label="Product video" onCanPlay={() => setReady(true)} onError={() => onFail?.()} />
    </div>
  );
}
