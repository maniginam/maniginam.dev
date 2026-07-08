import { makeSession, sessionCookieHeader, timingSafeEqual } from '../_auth.js';

async function readToken(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return (body.token || '').toString();
  }
  const form = await request.formData().catch(() => null);
  return form ? (form.get('token') || '').toString() : '';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = await readToken(request);
  const ok = env.ADMIN_TOKEN && await timingSafeEqual(token, env.ADMIN_TOKEN);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
  const session = await makeSession(env.SESSION_SECRET);
  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': sessionCookieHeader(session, { secure }), 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
