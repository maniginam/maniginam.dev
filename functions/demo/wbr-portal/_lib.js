// Pure, testable helpers for the West Baton Rouge Parish portal.
// Web Crypto only (globalThis.crypto) so it runs in Workers and node/vitest.
import { hmacHex, timingSafeEqual, b64url } from '../../admin/_auth.js';

const enc = new TextEncoder();

export const VALID_STATUS = ['new', 'prog', 'done'];
export const VALID_CATEGORY = ['pothole', 'drainage', 'light', 'debris', 'sign', 'water'];

/* ---------------- passwords (PBKDF2-SHA256) ----------------
   Matches the seed generated with Node:
   crypto.pbkdf2Sync(pw, saltStr, 100000, 32, 'sha256')  — salt used as its utf8 bytes. */
export async function pbkdf2Hex(password, saltStr, iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(String(saltStr)), iterations, hash: 'SHA-256' },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, expectedHash, salt) {
  const got = await pbkdf2Hex(password, salt);
  return timingSafeEqual(got, expectedHash);
}

export async function hashPassword(password) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await pbkdf2Hex(password, salt);
  return { hash, salt };
}

/* ---------------- issue ids ---------------- */
export function newIssueId(seqLike = 0) {
  // Human-friendly, roughly sequential; jitter keeps two rapid submits distinct.
  const base = 24800 + Math.floor(Number(seqLike) || 0);
  const jitter = crypto.getRandomValues(new Uint32Array(1))[0] % 90;
  return `WBR-${base + jitter}`;
}

/* ---------------- validation ---------------- */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function clamp(s, n) { return String(s ?? '').slice(0, n); }

export function validateIssue(input = {}) {
  const category = String(input.category ?? '').trim();
  const title = String(input.title ?? '').trim();
  if (!VALID_CATEGORY.includes(category)) return { ok: false, error: 'Invalid category' };
  if (!title) return { ok: false, error: 'A short title is required' };
  return {
    ok: true,
    value: {
      category,
      title: clamp(title, 160),
      description: clamp(input.description ?? '', 2000),
      address: clamp(input.address ?? '', 240),
      lat: num(input.lat),
      lng: num(input.lng),
      reporter_name: clamp(input.reporter_name ?? input.name ?? '', 120),
      reporter_contact: clamp(input.reporter_contact ?? input.contact ?? '', 160),
      source: ['app', 'web', 'staff'].includes(input.source) ? input.source : 'app',
    },
  };
}

export function validateSubscriber(input = {}) {
  const email = String(input.email ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  if (!email && !phone) return { ok: false, error: 'Email or phone required' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Invalid email' };
  if (phone && !/^[0-9+()\-.\s]{7,20}$/.test(phone)) return { ok: false, error: 'Invalid phone' };
  const channels = String(input.channels ?? (email ? 'email' : 'sms'))
    .split(',').map(s => s.trim()).filter(c => ['email', 'sms', 'push'].includes(c));
  return {
    ok: true,
    value: {
      email: email || null,
      phone: phone || null,
      name: clamp(input.name ?? '', 120) || null,
      district: clamp(input.district ?? '', 20) || null,
      channels: (channels.length ? channels : ['email']).join(','),
    },
  };
}

export function normalizeStatus(s) {
  return VALID_STATUS.includes(s) ? s : null;
}

/* ---------------- portal session (embeds username + role) ---------------- */
export async function makePortalSession(secret, { username, role }, ttlMs = 604800000, nowMs = Date.now()) {
  const expiry = nowMs + ttlMs;
  const payload = b64url(JSON.stringify({ u: username, r: role, e: expiry }));
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyPortalSession(token, secret, nowMs = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false };
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { ok: false };
  const expected = await hmacHex(payload, secret);
  if (!(await timingSafeEqual(sig, expected))) return { ok: false };
  let obj;
  try { obj = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return { ok: false }; }
  if (!obj || !Number.isFinite(obj.e) || obj.e <= nowMs) return { ok: false };
  return { ok: true, username: obj.u, role: obj.r, expiry: obj.e };
}

export function portalCookie(name, value, { secure = true, maxAge = 604800, path } = {}) {
  const parts = [`${name}=${value}`, 'HttpOnly'];
  if (secure) parts.push('Secure');
  parts.push('SameSite=Lax', `Path=${path}`, `Max-Age=${maxAge}`);
  return parts.join('; ');
}
