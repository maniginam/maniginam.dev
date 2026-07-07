import { validateSignup } from './_validate.js';

function ipKey(ip) {
  // CF-Connecting-IP is edge-set in production, but sanitize defensively so a
  // spoofed header at origin can't craft or collide KV keys. Keep only valid
  // IPv4/IPv6 chars and cap length.
  return (ip || 'unknown').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unknown';
}

async function rateLimited(env, ip) {
  const key = `rl:${ipKey(ip)}`;
  const cur = Number(await env.SIGNUPS.get(key)) || 0;
  if (cur >= 5) return true;
  await env.SIGNUPS.put(key, String(cur + 1), { expirationTtl: 600 });
  return false;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimited(env, ip)) {
    return json({ error: 'Too many requests' }, 429);
  }
  const body = await request.json().catch(() => ({}));
  const res = validateSignup(body);
  if (!res.ok) return json({ error: res.error }, 400);

  const ts = new Date().toISOString();
  const rand = crypto.randomUUID().slice(0, 8);
  await env.SIGNUPS.put(`signup:${ts}:${rand}`, JSON.stringify({ ...res.value, ts }));
  return json({ ok: true }, 201);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
