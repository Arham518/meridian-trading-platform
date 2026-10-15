import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const c of String(str).toUpperCase().replace(/=+$/, '')) {
    const i = ALPHA.indexOf(c); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) */
export function totpAt(secretB32, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
export const currentStep = (t = Date.now()) => Math.floor(t / 30000);
/** Returns the matched time-step (so it can be stored and replays rejected) or null. Accepts +-1 step of clock drift. */
export function verifyTotp(secretB32, code, lastStep = 0, t = Date.now()) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = currentStep(t);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue;
    const exp = Buffer.from(totpAt(secretB32, step)); const got = Buffer.from(c);
    if (exp.length === got.length && crypto.timingSafeEqual(exp, got)) return step;
  }
  return null;
}
export const newSecret = () => base32(crypto.randomBytes(20));
export const otpauthUrl = (secret, email, issuer = 'Meridian') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
export const qrDataUrl = (text) => QRCode.toDataURL(text, { margin: 1, width: 220, color: { dark: '#ecebe6', light: '#00000000' } });

// the TOTP secret is encrypted at rest (AES-256-GCM, key derived from the server secret)
const key = () => crypto.createHash('sha256').update(`totp:${config.jwtSecret}`).digest();
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decryptSecret(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
