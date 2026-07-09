// West Baton Rouge Parish portal — D1-backed API.
// Routed from functions/demo/[[path]].js for valid ticket-holders:
//   /demo/wbr-portal/api/<...>  ->  handleApi(request, env, segsAfterApi)
//
// Staff-only routes require a valid portal session cookie (wbr_staff).
// Everything is already behind the demo share ticket, so citizen routes are open
// to ticket-holders (Brady's private link).
import {
  validateIssue, validateSubscriber, normalizeStatus,
  newIssueId, verifyPassword,
  makePortalSession, verifyPortalSession, portalCookie,
} from './_lib.js';
import { parseCookies } from '../../admin/_auth.js';

const PORTAL_PATH = '/demo/wbr-portal';
const STAFF_COOKIE = 'wbr_staff';

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow', ...extra },
  });
}
const nowIso = () => new Date().toISOString();

async function staffFrom(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const v = await verifyPortalSession(cookies[STAFF_COOKIE], env.SESSION_SECRET);
  return v.ok ? v : null;
}

// Brute-force guard for staff login — 8 attempts / 10 min per IP, backed by KV.
async function loginRateLimited(env, ip) {
  if (!env.SIGNUPS) return false; // KV optional in some local runs
  const key = `wbrlogin:${(ip || 'unknown').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unknown'}`;
  const cur = Number(await env.SIGNUPS.get(key)) || 0;
  if (cur >= 8) return true;
  await env.SIGNUPS.put(key, String(cur + 1), { expirationTtl: 600 });
  return false;
}

/* ---------------- issue row -> client shape ---------------- */
function shapeIssue(r) {
  return {
    id: r.id, cat: r.category, title: r.title, desc: r.description || '',
    addr: r.address || '', ll: [r.lat, r.lng], status: r.status,
    by: r.reporter_name || (r.source === 'staff' ? 'Staff' : 'Resident'),
    source: r.source, assigned: r.assigned_to || null,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

/* ---------------- handlers ---------------- */
async function listIssues(request, env) {
  const url = new URL(request.url);
  const status = normalizeStatus(url.searchParams.get('status'));
  const stmt = status
    ? env.WBR_DB.prepare('SELECT * FROM issues WHERE status=? ORDER BY created_at DESC LIMIT 200').bind(status)
    : env.WBR_DB.prepare('SELECT * FROM issues ORDER BY created_at DESC LIMIT 200');
  const { results } = await stmt.all();
  return json({ issues: results.map(shapeIssue) });
}

async function getIssue(env, id) {
  const row = await env.WBR_DB.prepare('SELECT * FROM issues WHERE id=?').bind(id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  const { results: events } = await env.WBR_DB
    .prepare('SELECT kind, detail, actor, created_at FROM issue_events WHERE issue_id=? ORDER BY id').bind(id).all();
  return json({ issue: shapeIssue(row), events });
}

async function createIssue(request, env) {
  const body = await request.json().catch(() => ({}));
  const v = validateIssue(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const countRow = await env.WBR_DB.prepare('SELECT COUNT(*) AS c FROM issues').first();
  let id = newIssueId(countRow.c);
  // guarantee uniqueness
  for (let i = 0; i < 5; i++) {
    const exists = await env.WBR_DB.prepare('SELECT 1 FROM issues WHERE id=?').bind(id).first();
    if (!exists) break; id = newIssueId(countRow.c + i + 1);
  }
  const t = nowIso();
  const val = v.value;
  await env.WBR_DB.prepare(
    `INSERT INTO issues (id,category,title,description,address,lat,lng,status,reporter_name,reporter_contact,source,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?, 'new', ?,?,?,?,?)`
  ).bind(id, val.category, val.title, val.description, val.address, val.lat, val.lng,
         val.reporter_name, val.reporter_contact, val.source, t, t).run();
  await env.WBR_DB.prepare(
    `INSERT INTO issue_events (issue_id,kind,detail,actor,created_at) VALUES (?, 'created', ?, 'resident', ?)`
  ).bind(id, `Request submitted via ${val.source}`, t).run();
  const row = await env.WBR_DB.prepare('SELECT * FROM issues WHERE id=?').bind(id).first();
  return json({ ok: true, issue: shapeIssue(row) }, 201);
}

async function updateStatus(request, env, id, staff) {
  const body = await request.json().catch(() => ({}));
  const status = normalizeStatus(body.status);
  if (!status) return json({ error: 'Invalid status' }, 400);
  const t = nowIso();
  const res = await env.WBR_DB.prepare('UPDATE issues SET status=?, updated_at=? WHERE id=?').bind(status, t, id).run();
  if (!res.meta.changes) return json({ error: 'Not found' }, 404);
  const label = { new: 'Reopened', prog: 'Marked in progress', done: 'Resolved' }[status];
  await env.WBR_DB.prepare(
    `INSERT INTO issue_events (issue_id,kind,detail,actor,created_at) VALUES (?, 'status', ?, ?, ?)`
  ).bind(id, label, staff.username, t).run();
  return json({ ok: true, status });
}

async function issueAction(request, env, id, action, staff) {
  const body = await request.json().catch(() => ({}));
  const t = nowIso();
  if (action === 'assign') {
    const to = String(body.to || 'Public Works').slice(0, 80);
    const res = await env.WBR_DB.prepare('UPDATE issues SET assigned_to=?, updated_at=? WHERE id=?').bind(to, t, id).run();
    if (!res.meta.changes) return json({ error: 'Not found' }, 404);
    await env.WBR_DB.prepare(`INSERT INTO issue_events (issue_id,kind,detail,actor,created_at) VALUES (?, 'assign', ?, ?, ?)`)
      .bind(id, `Assigned to ${to}`, staff.username, t).run();
    return json({ ok: true, assigned: to });
  }
  if (action === 'note') {
    const note = String(body.note || '').slice(0, 500);
    await env.WBR_DB.prepare(`INSERT INTO issue_events (issue_id,kind,detail,actor,created_at) VALUES (?, 'note', ?, ?, ?)`)
      .bind(id, note, staff.username, t).run();
    return json({ ok: true });
  }
  if (action === 'notify') {
    await env.WBR_DB.prepare(`INSERT INTO issue_events (issue_id,kind,detail,actor,created_at) VALUES (?, 'notify', 'Update sent to resident', ?, ?)`)
      .bind(id, staff.username, t).run();
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
}

async function stats(env) {
  const { results } = await env.WBR_DB.prepare('SELECT status, COUNT(*) AS c FROM issues GROUP BY status').all();
  const out = { total: 0, new: 0, prog: 0, done: 0 };
  for (const r of results) { out[r.status] = r.c; out.total += r.c; }
  return json(out);
}

async function subscribe(request, env) {
  const body = await request.json().catch(() => ({}));
  const v = validateSubscriber(body);
  if (!v.ok) return json({ error: v.error }, 400);
  try {
    await env.WBR_DB.prepare(
      `INSERT INTO alert_subscribers (email,phone,name,district,channels,verified,created_at)
       VALUES (?,?,?,?,?,0,?)`
    ).bind(v.value.email, v.value.phone, v.value.name, v.value.district, v.value.channels, nowIso()).run();
  } catch (e) {
    return json({ ok: true, note: 'Already subscribed' }, 200); // UNIQUE clash = idempotent
  }
  return json({ ok: true }, 201);
}

/* ---------------- staff auth ---------------- */
async function staffLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await loginRateLimited(env, ip)) return json({ error: 'Too many attempts. Try again later.' }, 429);
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const row = await env.WBR_DB.prepare('SELECT username,name,role,pw_hash,pw_salt FROM staff_users WHERE username=?').bind(username).first();
  const ok = row && await verifyPassword(password, row.pw_hash, row.pw_salt);
  if (!ok) return json({ error: 'Invalid username or password' }, 401);
  const session = await makePortalSession(env.SESSION_SECRET, { username: row.username, role: row.role });
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true, user: { username: row.username, name: row.name, role: row.role } }, 200, {
    'Set-Cookie': portalCookie(STAFF_COOKIE, session, { secure, path: PORTAL_PATH }),
  });
}

function staffLogout(request) {
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, {
    'Set-Cookie': portalCookie(STAFF_COOKIE, 'x', { secure, path: PORTAL_PATH, maxAge: 0 }),
  });
}

async function staffMe(request, env) {
  const s = await staffFrom(request, env);
  if (!s) return json({ authed: false }, 200);
  const row = await env.WBR_DB.prepare('SELECT username,name,role FROM staff_users WHERE username=?').bind(s.username).first();
  return json({ authed: true, user: row || { username: s.username, role: s.role } });
}

/* ---------------- alerts (real email via Resend, dormant until key set) ---------------- */
async function sendAlert(request, env, staff) {
  const body = await request.json().catch(() => ({}));
  const channel = ['email', 'sms', 'push'].includes(body.channel) ? body.channel : 'email';
  const msg = String(body.body || '').slice(0, 1000);
  const subject = String(body.subject || 'West Baton Rouge Parish Alert').slice(0, 160);
  const audience = String(body.audience || 'All residents').slice(0, 120);
  if (!msg.trim()) return json({ error: 'Message required' }, 400);

  // Static queries per channel — no identifier interpolation.
  const query = channel === 'sms'
    ? 'SELECT phone AS addr FROM alert_subscribers WHERE phone IS NOT NULL AND channels LIKE ?'
    : 'SELECT email AS addr FROM alert_subscribers WHERE email IS NOT NULL AND channels LIKE ?';
  const like = channel === 'sms' ? '%sms%' : channel === 'push' ? '%push%' : '%email%';
  const { results } = await env.WBR_DB.prepare(query).bind(like).all();
  const recipients = results.map(r => r.addr).filter(Boolean);

  let status = 'queued', delivered = 0;
  if (channel === 'email' && env.RESEND_API_KEY) {
    // Real send path — fires only when the key exists.
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.WBR_FROM_EMAIL || 'alerts@maniginam.dev',
        to: recipients, subject, text: msg,
      }),
    }).catch(() => null);
    if (r && r.ok) { status = 'sent'; delivered = recipients.length; }
    else { status = 'failed'; }
  } else if (channel === 'sms') {
    status = 'queued'; // Twilio path intentionally dormant until account added.
  } else {
    status = 'simulated'; delivered = recipients.length; // no provider configured yet
  }

  await env.WBR_DB.prepare(
    `INSERT INTO alerts_sent (channel,audience,subject,body,recipients,sent_by,status,created_at) VALUES (?,?,?,?,?,?,?,?)`
  ).bind(channel, audience, subject, msg, recipients.length, staff.username, status, nowIso()).run();

  return json({ ok: true, channel, status, recipients: recipients.length, delivered });
}

/* ---------------- router ---------------- */
export async function handleApi(request, env, segs) {
  // segs are the path parts AFTER /demo/wbr-portal/api
  const [a, b, c] = segs;
  const m = request.method;

  try {
    // ----- public-to-ticket-holder -----
    if (a === 'issues' && !b) {
      if (m === 'GET') return listIssues(request, env);
      if (m === 'POST') return createIssue(request, env);
    }
    if (a === 'issues' && b && !c && m === 'GET') return getIssue(env, b);
    if (a === 'stats' && m === 'GET') return stats(env);
    if (a === 'subscribe' && m === 'POST') return subscribe(request, env);

    // ----- staff auth -----
    if (a === 'staff' && b === 'login' && m === 'POST') return staffLogin(request, env);
    if (a === 'staff' && b === 'logout' && m === 'POST') return staffLogout(request);
    if (a === 'staff' && b === 'me' && m === 'GET') return staffMe(request, env);

    // ----- staff-gated actions -----
    const staff = await staffFrom(request, env);
    if (a === 'issues' && b && c && m === 'POST') {
      if (!staff) return json({ error: 'Sign in required' }, 401);
      if (c === 'status') return updateStatus(request, env, b, staff);
      return issueAction(request, env, b, c, staff);
    }
    if (a === 'alerts' && b === 'send' && m === 'POST') {
      if (!staff) return json({ error: 'Sign in required' }, 401);
      return sendAlert(request, env, staff);
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    // Don't leak internal error text to clients.
    console.error('wbr-portal api error:', err && err.stack || err);
    return json({ error: 'Server error' }, 500);
  }
}
