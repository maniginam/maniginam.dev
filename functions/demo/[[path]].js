// Public-but-unlisted demo access via signed expiring tickets.
//
//   /demo/<slug>/t/<ticket>   -> verify ticket, set access cookie, redirect to /demo/<slug>/
//   /demo/<slug>/<asset...>   -> if valid access cookie for <slug>, proxy the file from the
//                                gated /admin/demo/<slug>/ static assets; else 403.
//
// No admin session required. Nothing here is linked publicly and robots.txt
// disallows /demo/, so the only way in is a valid ticket link.
import { verifyShareTicket } from './_share.js';

function forbidden(msg) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
     <title>Link unavailable</title>
     <body style="font-family:system-ui;max-width:32rem;margin:12vh auto;text-align:center;color:#0c0c14">
     <h1 style="font-family:Georgia,serif">Link unavailable</h1>
     <p>${msg}</p></body>`,
    { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}

function cookieMaxAge(expiry, nowMs) {
  return Math.max(0, Math.floor((expiry - nowMs) / 1000));
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const secret = env.SESSION_SECRET;
  const segs = (params.path || []).filter(Boolean); // e.g. ['chopshop','t','<ticket>'] or ['chopshop','css','styles.css']
  const slug = segs[0];

  if (!slug) return forbidden('No demo specified.');

  // Ticket redemption: /demo/<slug>/t/<ticket>
  if (segs[1] === 't' && segs[2]) {
    const ticket = segs.slice(2).join('/');
    const res = await verifyShareTicket(ticket, slug, secret);
    if (!res.ok) return forbidden('This share link is invalid or has expired.');
    const maxAge = cookieMaxAge(res.expiry, Date.now());
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/demo/${slug}/`,
        'Set-Cookie': `demo_${slug}=${ticket}; HttpOnly; Secure; SameSite=Lax; Path=/demo/${slug}; Max-Age=${maxAge}`,
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  // Access check via cookie
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const access = await verifyShareTicket(cookies[`demo_${slug}`], slug, secret);
  if (!access.ok) {
    return forbidden('This link requires a valid, unexpired share ticket.');
  }

  // Proxy the requested asset from the gated /admin/demo/<slug>/ static files.
  const assetPath = segs.slice(1).join('/') || 'index.html';
  const url = new URL(request.url);
  const assetUrl = new URL(`/admin/demo/${slug}/${assetPath}`, url.origin);
  // Serve a directory request as index.html
  if (assetPath.endsWith('/') || !assetPath.includes('.')) {
    assetUrl.pathname = `/admin/demo/${slug}/${assetPath.replace(/\/$/, '')}/index.html`.replace('//index.html', '/index.html');
  }
  const assetResp = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  const out = new Response(assetResp.body, assetResp);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
