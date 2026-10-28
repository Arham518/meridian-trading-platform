// Hero video + ads: validation and the public (visitor-safe) shape of both.
import { z } from 'zod';
import { getSettings } from '../db.js';

// ---------------------------------------------------------------- hero video
const YT = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/i;
const VIMEO = /^https:\/\/(?:www\.)?(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d{6,12})/i;
const UPLOAD = /^\/uploads\/hero-[a-f0-9]{8,32}\.(mp4|webm|mov)$/i;
const FILE_URL = /^https:\/\/[^\s/?#]+[^\s]*$/i;

/**
 * Describes a hero video value: an uploaded file, a direct https:// video file, or a YouTube / Vimeo link.
 * Returns null for anything that cannot be played (http://, javascript:, empty ...).
 */
export function describeVideo(v) {
  v = String(v || '').trim();
  if (!v) return null;
  if (UPLOAD.test(v)) return { kind: 'file', src: v };
  let m = v.match(YT);
  if (m) return { kind: 'youtube', id: m[1], src: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}&controls=0&playsinline=1&rel=0&modestbranding=1` };
  m = v.match(VIMEO);
  if (m) return { kind: 'vimeo', id: m[1], src: `https://player.vimeo.com/video/${m[1]}?background=1&autoplay=1&muted=1&loop=1&dnt=1` };
  if (FILE_URL.test(v) && v.length <= 500) return { kind: 'file', src: v };
  return null;
}
export const heroVideoSchema = z.string().trim().max(500)
  .refine((v) => v === '' || describeVideo(v), 'must be an https:// link to an MP4/WebM file, a YouTube or Vimeo link, or an uploaded file');

// ---------------------------------------------------------------- ads
export const AD_SLOTS = ['top', 'landing', 'dashboard', 'signals', 'between_signals'];
const https = z.string().trim().max(500).regex(/^https:\/\/[^\s]+$/i, 'must start with https://');
const imageSrc = z.string().trim().max(500).regex(/^(https:\/\/[^\s]+|\/uploads\/ad-[a-f0-9]{8,32}\.(png|jpe?g|webp|gif))$/i, 'must be an https:// image link or an uploaded image');

/** Pulls the publisher id and slot id out of a pasted AdSense snippet (or accepts them as typed). */
export function parseAdsense(code = '') {
  const s = String(code);
  const client = (s.match(/ca-pub-\d{10,20}/) || [])[0] || null;
  const slot = (s.match(/data-ad-slot\s*=\s*["']?(\d{6,20})/i) || [])[1] || (/^\s*\d{6,20}\s*$/.test(s) ? s.trim() : null);
  return { client, slot };
}

export const adSchema = z.object({
  id: z.string().trim().max(40).optional(),
  slot: z.enum(AD_SLOTS),
  type: z.enum(['link', 'image', 'adsense']).default('link'),
  title: z.string().trim().max(60).default(''),
  text: z.string().trim().max(160).default(''),
  cta: z.string().trim().max(24).default('Learn more'),
  url: z.string().trim().max(500).default(''),
  image: z.string().trim().max(500).default(''),
  adClient: z.string().trim().max(40).default(''),
  adSlot: z.string().trim().max(30).default(''),
  enabled: z.boolean().default(true),
}).superRefine((a, ctx) => {
  const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (a.type === 'link') {
    if (!a.title) bad('title', 'is required for a text ad');
    if (!https.safeParse(a.url).success) bad('url', 'must start with https://');
  }
  if (a.type === 'image') {
    if (!imageSrc.safeParse(a.image).success) bad('image', 'must be an https:// image link or an uploaded image');
    if (!https.safeParse(a.url).success) bad('url', 'must start with https://');
  }
  if (a.type === 'adsense') {
    if (!/^ca-pub-\d{10,20}$/.test(a.adClient)) bad('adClient', 'must look like ca-pub-1234567890123456');
    if (!/^\d{6,20}$/.test(a.adSlot)) bad('adSlot', 'must be the numeric ad unit (data-ad-slot) id');
  }
});

/** Old ads (before image/AdSense support) were plain text ads: give them a type. */
export const normalizeAd = (a, i) => ({ id: a.id || `ad${i + 1}`, type: 'link', image: '', adClient: '', adSlot: '', ...a });

export function readAds(raw) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object').map(normalizeAd) : []; } catch { return []; }
}

/** Only enabled, valid ads, and only the fields a visitor needs. */
export function publicAds(raw) {
  return readAds(raw).filter((a) => a.enabled && adSchema.safeParse(a).success).map((a) => {
    const base = { id: a.id, slot: a.slot, type: a.type };
    if (a.type === 'adsense') return { ...base, adClient: a.adClient, adSlot: a.adSlot };
    return { ...base, title: a.title, text: a.text, cta: a.cta || 'Learn more', url: a.url, image: a.type === 'image' ? a.image : '' };
  });
}

let cache = { at: 0, value: false };
/** True when at least one enabled AdSense unit exists (the CSP then allows Google's ad domains). Cached for 5 s. */
export function adsenseInUse() {
  if (Date.now() - cache.at < 5000) return cache.value;
  let value = false;
  try { value = publicAds(getSettings().ads).some((a) => a.type === 'adsense'); } catch { value = false; }
  cache = { at: Date.now(), value };
  return value;
}
export const resetAdsenseCache = () => { cache = { at: 0, value: false }; };
