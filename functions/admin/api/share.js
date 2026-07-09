// Mint a signed, expiring share link for a demo. Admin-gated (lives under
// /admin, so the admin auth middleware already protects it). Only someone
// with the admin session can generate links.
import { makeShareTicket } from '../../demo/_share.js';

const ALLOWED = new Set(['chopshop', 'wbr-fintech']);
const DAY = 86400000;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = (url.searchParams.get('demo') || '').trim();
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 7));

  if (!ALLOWED.has(slug)) {
    return json({ error: 'Unknown demo' }, 400);
  }
  const ttl = days * DAY;
  const ticket = await makeShareTicket(slug, env.SHARE_SECRET, ttl);
  const link = `${url.origin}/demo/${slug}/t/${ticket}`;
  const expires = new Date(Date.now() + ttl).toISOString();
  return json({ url: link, slug, days, expires }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
