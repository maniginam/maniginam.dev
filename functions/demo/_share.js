// Stateless, signed, expiring share tickets for hosted demos.
// A ticket grants access to ONE demo slug until its embedded expiry — no
// admin password, no server-side storage. Signed with SESSION_SECRET.
import { hmacHex, timingSafeEqual, b64url } from '../admin/_auth.js';

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

// ttlMs default 7 days.
export async function makeShareTicket(slug, secret, ttlMs = 604800000, nowMs = Date.now()) {
  const expiry = nowMs + ttlMs;
  const payload = b64url(`${slug}:${expiry}`);
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

// Returns { ok, expiry } — ok only if signature valid, slug matches, unexpired.
export async function verifyShareTicket(ticket, slug, secret, nowMs = Date.now()) {
  if (typeof ticket !== 'string' || !ticket.includes('.')) return { ok: false };
  const [payload, sig] = ticket.split('.');
  if (!payload || !sig) return { ok: false };
  const expected = await hmacHex(payload, secret);
  if (!(await timingSafeEqual(sig, expected))) return { ok: false };
  let decoded;
  try { decoded = b64urlDecode(payload); } catch { return { ok: false }; }
  const idx = decoded.lastIndexOf(':');
  if (idx === -1) return { ok: false };
  const tokSlug = decoded.slice(0, idx);
  const expiry = Number(decoded.slice(idx + 1));
  if (tokSlug !== slug || !Number.isFinite(expiry)) return { ok: false };
  if (expiry <= nowMs) return { ok: false };
  return { ok: true, expiry };
}
