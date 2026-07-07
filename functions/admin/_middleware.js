import { parseCookies, verifySession } from './_auth.js';

const PUBLIC_PATHS = new Set([
  '/admin/login.html',
  '/admin/api/login',
  '/admin/assets/admin.css',
]);

function noindex(resp) {
  const r = new Response(resp.body, resp);
  r.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return r;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || url.pathname; // tolerate trailing slash

  if (PUBLIC_PATHS.has(url.pathname) || PUBLIC_PATHS.has(path)) {
    return noindex(await next());
  }

  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const valid = await verifySession(cookies.admin_session, env.SESSION_SECRET);
  if (!valid) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/admin/login.html', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
  return noindex(await next());
}
