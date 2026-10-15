import { z } from 'zod';

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first.path.join('.');
    throw Object.assign(new Error(field ? `${field}: ${first.message}` : first.message), { status: 400, details: r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
  }
  return r.data;
}

// multipart bodies arrive as strings: treat '' / 'null' as missing and coerce numbers
const emptyToUndef = (v) => (v === '' || v === null || v === 'null' || v === 'undefined' ? undefined : v);
export const num = () => z.preprocess(emptyToUndef, z.coerce.number({ message: 'must be a number' }).finite());
export const optNum = () => z.preprocess(emptyToUndef, z.coerce.number({ message: 'must be a number' }).finite().optional());
export const posNum = () => z.preprocess(emptyToUndef, z.coerce.number({ message: 'must be a number' }).positive('must be greater than 0').finite());
export const optPosNum = () => z.preprocess(emptyToUndef, z.coerce.number({ message: 'must be a number' }).positive('must be greater than 0').finite().optional());

export const emailSchema = z.string().trim().toLowerCase().email('invalid email').max(120);
const COMMON = ['password', 'password1', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', '123456', '12345678', 'abc123', 'trading', 'meridian'];
/** Strong password policy: 10+ chars, at least 3 of 4 character classes, no obvious words. */
export const passwordSchema = z.string().min(10, 'must be at least 10 characters').max(100)
  .refine((p) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length >= 3, 'must mix at least three of: lowercase, uppercase, numbers, symbols')
  .refine((p) => !COMMON.some((w) => p.toLowerCase().includes(w)), 'is too easy to guess');
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,24}$/, '3-24 characters: letters, numbers, dot or underscore');
export const codeSchema = z.string().trim().min(6).max(12);
