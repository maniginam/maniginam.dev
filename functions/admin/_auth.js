// Pure, testable auth helpers. Uses Web Crypto (globalThis.crypto).
const enc = new TextEncoder();

export async function timingSafeEqual(a, b) {
  // Compare HMACs of both under a random-free fixed key so lengths don't leak
  // and comparison is constant-time over a fixed-size digest.
  const ha = await sha256Bytes(a);
  const hb = await sha256Bytes(b);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

async function sha256Bytes(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(s)));
  return new Uint8Array(buf);
}

export function b64url(input) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function makeSession(secret, ttlMs = 604800000, nowMs = Date.now()) {
  const expiry = nowMs + ttlMs;
  const payload = b64url(String(expiry));
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySession(cookieVal, secret, nowMs = Date.now()) {
  if (typeof cookieVal !== 'string' || !cookieVal.includes('.')) return false;
  const [payload, sig] = cookieVal.split('.');
  if (!payload || !sig) return false;
  const expected = await hmacHex(payload, secret);
  if (!(await timingSafeEqual(sig, expected))) return false;
  let expiry;
  try { expiry = Number(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return false; }
  if (!Number.isFinite(expiry)) return false;
  return expiry > nowMs;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function sessionCookieHeader(value) {
  return `admin_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=604800`;
}
