# maniginam.dev Private Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a token-gated private admin area to maniginam.dev (Cloudflare Pages) showing visitation stats and captured email signups, and hosting demos (Chop Shop) at `/admin/demo/chopshop/`.

**Architecture:** Cloudflare Pages Functions gate every `/admin/*` route via `functions/admin/_middleware.js`. Auth is a shared token (`ADMIN_TOKEN` secret) exchanged for a signed HMAC session cookie (`SESSION_SECRET`). Stats and signups live in Cloudflare KV. Pure, testable logic (crypto signing, cookie parsing, signup validation) is factored into `_auth.js` / `_validate.js` modules unit-tested with vitest in Node; the thin `onRequest` handlers wire them to KV and static assets.

**Tech Stack:** Cloudflare Pages + Pages Functions (JS modules), Cloudflare KV, Web Crypto (SubtleCrypto), vitest (Node) for unit tests, wrangler for local `pages dev`.

## Global Constraints

- Domain: maniginam.dev. Existing site is static + `functions/_middleware.js` (agent-discovery/markdown). Do not break it.
- Admin routes: everything under `/admin/*` is private except `/admin/login.html` and `POST /admin/api/login`.
- Secrets (never committed): `ADMIN_TOKEN`, `SESSION_SECRET`. Set via CF Pages dashboard + `.dev.vars` locally (gitignored).
- KV namespaces: `STATS`, `SIGNUPS`.
- Session cookie: `admin_session`, value `base64url(expiryMs).sig`, `sig = HMAC-SHA256(base64url(expiryMs), SESSION_SECRET)` hex. Flags: `HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=604800`.
- All comparisons of secrets/signatures use constant-time equality.
- All admin responses set header `X-Robots-Tag: noindex, nofollow`.
- Never place a token or session value in a URL or log.
- Node 18+ (Web Crypto as `globalThis.crypto`).

---

### Task 1: Tooling scaffold (package.json, wrangler.toml, vitest, gitignore, robots)

**Files:**
- Create: `package.json`
- Create: `wrangler.toml`
- Create: `vitest.config.js`
- Create: `.dev.vars` (gitignored, local secrets)
- Modify: `.gitignore` (add `.dev.vars`)
- Modify: `robots.txt` (add `Disallow: /admin/`)

**Interfaces:**
- Produces: `npm test` runs vitest; `wrangler pages dev` binds `STATS`, `SIGNUPS`, and reads `.dev.vars`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "maniginam-dev",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler pages dev . --kv STATS --kv SIGNUPS"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "wrangler": "^3.80.0"
  }
}
```

- [ ] **Step 2: Create `wrangler.toml`**

```toml
name = "maniginam-dev"
pages_build_output_dir = "."
compatibility_date = "2024-09-23"

[[kv_namespaces]]
binding = "STATS"
id = "PLACEHOLDER_SET_IN_DASHBOARD"

[[kv_namespaces]]
binding = "SIGNUPS"
id = "PLACEHOLDER_SET_IN_DASHBOARD"
```

Note: real KV ids are filled in the CF dashboard; `wrangler pages dev` uses local KV regardless. Production binds via dashboard settings.

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
```

- [ ] **Step 4: Create `.dev.vars` (local only) and gitignore it**

`.dev.vars`:
```
ADMIN_TOKEN=dev-local-token-change-me
SESSION_SECRET=dev-local-session-secret-change-me
```

Append to `.gitignore`:
```
.dev.vars
```

- [ ] **Step 5: Add admin disallow to `robots.txt`**

Add these lines to `robots.txt`:
```
User-agent: *
Disallow: /admin/
```

- [ ] **Step 6: Install and verify**

Run: `cd /Users/maniginam/projects/maniginam/maniginam.dev && npm install && npx vitest run --passWithNoTests`
Expected: install succeeds; vitest reports "No test files found" and exits 0.

- [ ] **Step 7: Commit**

```bash
git add package.json wrangler.toml vitest.config.js .gitignore robots.txt
git commit -m "chore: admin tooling scaffold (wrangler, vitest, robots)"
```

---

### Task 2: Auth core module (sign/verify session, constant-time compare) — TDD

**Files:**
- Create: `tests/auth.test.js`
- Create: `functions/admin/_auth.js`

**Interfaces:**
- Produces `functions/admin/_auth.js` exporting:
  - `timingSafeEqual(a: string, b: string): Promise<boolean>` — constant-time; length-mismatch returns false but still does a compare pass.
  - `b64url(bytes: Uint8Array|string): string`
  - `hmacHex(message: string, secret: string): Promise<string>`
  - `makeSession(secret: string, ttlMs=604800000, nowMs): Promise<string>` — returns `base64url(expiry).sighex`. `nowMs` injected for tests.
  - `verifySession(cookieVal: string, secret: string, nowMs): Promise<boolean>` — checks signature (constant-time) and `expiry > nowMs`.
  - `parseCookies(header: string): Record<string,string>`
  - `sessionCookieHeader(value: string): string` — full `Set-Cookie` string with required flags.

- [ ] **Step 1: Write the failing tests**

```js
// tests/auth.test.js
import { describe, it, expect } from 'vitest';
import {
  timingSafeEqual, hmacHex, makeSession, verifySession, parseCookies, sessionCookieHeader
} from '../functions/admin/_auth.js';

const SECRET = 'test-secret';
const NOW = 1_000_000_000_000;

describe('timingSafeEqual', () => {
  it('true for equal strings', async () => {
    expect(await timingSafeEqual('abc', 'abc')).toBe(true);
  });
  it('false for different strings', async () => {
    expect(await timingSafeEqual('abc', 'abd')).toBe(false);
  });
  it('false for different lengths', async () => {
    expect(await timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('hmacHex', () => {
  it('is deterministic and hex', async () => {
    const a = await hmacHex('msg', SECRET);
    const b = await hmacHex('msg', SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs by secret', async () => {
    expect(await hmacHex('msg', 'x')).not.toBe(await hmacHex('msg', 'y'));
  });
});

describe('session round-trip', () => {
  it('makeSession verifies while unexpired', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    expect(await verifySession(s, SECRET, NOW + 500)).toBe(true);
  });
  it('fails after expiry', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    expect(await verifySession(s, SECRET, NOW + 2000)).toBe(false);
  });
  it('fails with wrong secret', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    expect(await verifySession(s, 'other', NOW + 500)).toBe(false);
  });
  it('fails on tampered signature', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    const tampered = s.slice(0, -1) + (s.endsWith('a') ? 'b' : 'a');
    expect(await verifySession(tampered, SECRET, NOW + 500)).toBe(false);
  });
  it('fails on malformed value', async () => {
    expect(await verifySession('garbage', SECRET, NOW)).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses multiple pairs', () => {
    expect(parseCookies('a=1; admin_session=xyz; b=2')).toMatchObject({ a: '1', admin_session: 'xyz', b: '2' });
  });
  it('empty header → empty object', () => {
    expect(parseCookies('')).toEqual({});
  });
});

describe('sessionCookieHeader', () => {
  it('includes required flags', () => {
    const h = sessionCookieHeader('val');
    expect(h).toContain('admin_session=val');
    expect(h).toContain('HttpOnly');
    expect(h).toContain('Secure');
    expect(h).toContain('SameSite=Strict');
    expect(h).toContain('Path=/admin');
    expect(h).toContain('Max-Age=604800');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth.test.js`
Expected: FAIL — cannot resolve `../functions/admin/_auth.js`.

- [ ] **Step 3: Implement `functions/admin/_auth.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth.test.js`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add tests/auth.test.js functions/admin/_auth.js
git commit -m "feat: admin auth core (signed session, constant-time compare) with tests"
```

---

### Task 3: Login + logout endpoints

**Files:**
- Create: `functions/admin/api/login.js`
- Create: `functions/admin/api/logout.js`

**Interfaces:**
- Consumes: `makeSession`, `sessionCookieHeader`, `timingSafeEqual` from `../_auth.js` (path `../../_auth.js` — see note); env `ADMIN_TOKEN`, `SESSION_SECRET`.
- `POST /admin/api/login` body `{token}` (JSON or form). Correct → 204 + `Set-Cookie`. Wrong → 401 JSON `{error}`.
- `POST /admin/api/logout` → 204 + expired cookie.

Note on import path: `functions/admin/api/login.js` imports `_auth.js` at `../_auth.js`.

- [ ] **Step 1: Create `functions/admin/api/login.js`**

```js
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
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': sessionCookieHeader(session), 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
```

- [ ] **Step 2: Create `functions/admin/api/logout.js`**

```js
export async function onRequestPost() {
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': 'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
```

- [ ] **Step 3: Verify with local dev server**

Run:
```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
npx wrangler pages dev . --kv STATS --kv SIGNUPS --port 8788 >/tmp/wp.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/admin/api/login \
  -H 'Content-Type: application/json' -d '{"token":"wrong"}'
curl -s -D - -o /dev/null -X POST http://localhost:8788/admin/api/login \
  -H 'Content-Type: application/json' -d '{"token":"dev-local-token-change-me"}' | grep -i set-cookie
kill %1
```
Expected: first curl prints `401`; second prints a `Set-Cookie: admin_session=...` line.

- [ ] **Step 4: Commit**

```bash
git add functions/admin/api/login.js functions/admin/api/logout.js
git commit -m "feat: admin login/logout endpoints"
```

---

### Task 4: Admin auth gate middleware

**Files:**
- Create: `functions/admin/_middleware.js`

**Interfaces:**
- Consumes: `parseCookies`, `verifySession` from `./_auth.js`; env `SESSION_SECRET`.
- Behavior: allow unauthenticated access to `/admin/login.html`, `/admin/api/login`, and static assets required by the login page (`/admin/assets/admin.css`). All other `/admin/*` require a valid `admin_session` cookie; otherwise redirect (302) to `/admin/login.html`. Adds `X-Robots-Tag` to all admin responses.

- [ ] **Step 1: Create `functions/admin/_middleware.js`**

```js
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
```

- [ ] **Step 2: Verify with local dev server**

Run:
```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
mkdir -p admin && printf '<!doctype html><title>Dash</title><h1>Secret Dashboard</h1>' > admin/index.html
printf '<!doctype html><title>Login</title><h1>Login</h1>' > admin/login.html
npx wrangler pages dev . --kv STATS --kv SIGNUPS --port 8788 >/tmp/wp.log 2>&1 &
sleep 6
echo "unauth /admin/ ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/admin/
echo "login page ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/admin/login.html
COOKIE=$(curl -s -D - -o /dev/null -X POST http://localhost:8788/admin/api/login -H 'Content-Type: application/json' -d '{"token":"dev-local-token-change-me"}' | grep -i set-cookie | sed 's/set-cookie: //I' | cut -d';' -f1)
echo "auth /admin/ ->"; curl -s -o /dev/null -w "%{http_code}\n" --cookie "$COOKIE" http://localhost:8788/admin/
kill %1
```
Expected: unauth `/admin/` → `302`; login page → `200`; authed `/admin/` → `200`.

- [ ] **Step 3: Commit**

```bash
git add functions/admin/_middleware.js admin/index.html admin/login.html
git commit -m "feat: admin auth gate middleware"
```

---

### Task 5: Signup validation module — TDD

**Files:**
- Create: `tests/validate.test.js`
- Create: `functions/api/_validate.js`

**Interfaces:**
- Produces `functions/api/_validate.js` exporting `validateSignup(input): {ok:boolean, value?:{email,name,source}, error?:string}`.
  - Trims fields. Requires valid email (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`). `name` optional (≤120 chars). `source` optional string (≤60 chars), default `'site'`.

- [ ] **Step 1: Write failing tests**

```js
// tests/validate.test.js
import { describe, it, expect } from 'vitest';
import { validateSignup } from '../functions/api/_validate.js';

describe('validateSignup', () => {
  it('accepts a valid email', () => {
    const r = validateSignup({ email: 'a@b.com' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ email: 'a@b.com', name: '', source: 'site' });
  });
  it('trims and keeps name + source', () => {
    const r = validateSignup({ email: '  x@y.io ', name: '  Gina ', source: 'footer' });
    expect(r.value).toEqual({ email: 'x@y.io', name: 'Gina', source: 'footer' });
  });
  it('rejects missing email', () => {
    expect(validateSignup({}).ok).toBe(false);
  });
  it('rejects malformed email', () => {
    expect(validateSignup({ email: 'nope' }).ok).toBe(false);
  });
  it('rejects overlong name', () => {
    expect(validateSignup({ email: 'a@b.com', name: 'z'.repeat(121) }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `functions/api/_validate.js`**

```js
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateSignup(input = {}) {
  const email = String(input.email ?? '').trim();
  const name = String(input.name ?? '').trim();
  const source = String(input.source ?? '').trim() || 'site';
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Valid email required' };
  if (name.length > 120) return { ok: false, error: 'Name too long' };
  if (source.length > 60) return { ok: false, error: 'Source too long' };
  return { ok: true, value: { email, name, source } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/validate.test.js functions/api/_validate.js
git commit -m "feat: signup validation module with tests"
```

---

### Task 6: Public subscribe endpoint (KV write + rate limit)

**Files:**
- Create: `functions/api/subscribe.js`

**Interfaces:**
- Consumes: `validateSignup` from `./_validate.js`; KV `SIGNUPS`.
- `POST /api/subscribe` body `{email,name?,source?}` → on valid, store KV key `signup:<isoTs>:<rand>` value JSON `{email,name,source,ts}`; return 201 JSON `{ok:true}`. Invalid → 400 `{error}`. Rate limit: max 5 writes / IP / 10 min via KV key `rl:<ip>` (increment with TTL). Over limit → 429.

- [ ] **Step 1: Create `functions/api/subscribe.js`**

```js
import { validateSignup } from './_validate.js';

async function rateLimited(env, ip) {
  const key = `rl:${ip}`;
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
```

- [ ] **Step 2: Verify with local dev server**

Run:
```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
npx wrangler pages dev . --kv STATS --kv SIGNUPS --port 8788 >/tmp/wp.log 2>&1 &
sleep 6
echo "valid ->"; curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/api/subscribe -H 'Content-Type: application/json' -d '{"email":"a@b.com","source":"footer"}'
echo "invalid ->"; curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/api/subscribe -H 'Content-Type: application/json' -d '{"email":"nope"}'
kill %1
```
Expected: valid → `201`; invalid → `400`.

- [ ] **Step 3: Commit**

```bash
git add functions/api/subscribe.js
git commit -m "feat: public subscribe endpoint with KV store and rate limit"
```

---

### Task 7: Pageview counter in root middleware (KV STATS)

**Files:**
- Modify: `functions/_middleware.js` (add counting; keep existing behavior intact)

**Interfaces:**
- Consumes: KV `STATS`. Increments `views:YYYY-MM-DD:<path>` and `ref:YYYY-MM-DD:<host>` on public HTML GETs. Skips `/admin/*`, non-GET, and non-HTML.
- Must not alter the existing Link-header / markdown-negotiation logic.

- [ ] **Step 1: Add a counting helper and call it in `onRequest`**

In `functions/_middleware.js`, add near the top (after imports/consts):

```js
async function countView(context, url) {
  const { request, env } = context;
  if (!env.STATS) return;
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/admin')) return;
  const day = new Date().toISOString().slice(0, 10);
  const path = url.pathname;
  const bump = async (key) => {
    const n = Number(await env.STATS.get(key)) || 0;
    await env.STATS.put(key, String(n + 1));
  };
  await bump(`views:${day}:${path}`);
  const ref = request.headers.get('Referer');
  if (ref) {
    try { await bump(`ref:${day}:${new URL(ref).host}`); } catch {}
  }
}
```

Then, inside the existing `onRequest`, AFTER computing `const url = new URL(context.request.url);` and confirming `isHTML`, add before returning:

```js
  if (isHTML) {
    context.waitUntil(countView(context, url));
  }
```

Place this so it runs for HTML responses without blocking; do not remove any existing lines. (The existing function already computes `url` and `isHTML`; reuse them.)

- [ ] **Step 2: Verify existing behavior + counting**

Run:
```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
npx wrangler pages dev . --kv STATS --kv SIGNUPS --port 8788 >/tmp/wp.log 2>&1 &
sleep 6
echo "home Link header ->"; curl -s -D - -o /dev/null http://localhost:8788/ | grep -i '^link:' | head -1
echo "markdown negotiation ->"; curl -s -H 'Accept: text/markdown' http://localhost:8788/ | head -1
kill %1
```
Expected: Link header still present; markdown negotiation still returns markdown (existing behavior unbroken). KV counting is validated indirectly by Task 8's stats endpoint.

- [ ] **Step 3: Commit**

```bash
git add functions/_middleware.js
git commit -m "feat: KV pageview counter in root middleware"
```

---

### Task 8: Admin stats + emails API endpoints

**Files:**
- Create: `functions/admin/api/stats.js`
- Create: `functions/admin/api/emails.js`

**Interfaces:**
- Consumes: KV `STATS`, KV `SIGNUPS`. Both are gated by the admin middleware (Task 4), so no auth check here.
- `GET /admin/api/stats` → JSON `{days:[{day,path,count}], refs:[{host,count}]}` (from `STATS` list).
- `GET /admin/api/emails` → JSON `{signups:[{email,name,source,ts}], count}` newest first.

- [ ] **Step 1: Create `functions/admin/api/stats.js`**

```js
export async function onRequestGet(context) {
  const { env } = context;
  const views = [];
  const refs = [];
  let cursor;
  do {
    const list = await env.STATS.list({ limit: 1000, cursor });
    for (const k of list.keys) {
      const val = Number(await env.STATS.get(k.name)) || 0;
      if (k.name.startsWith('views:')) {
        const [, day, ...rest] = k.name.split(':');
        views.push({ day, path: rest.join(':'), count: val });
      } else if (k.name.startsWith('ref:')) {
        const [, day, ...rest] = k.name.split(':');
        refs.push({ day, host: rest.join(':'), count: val });
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  views.sort((a, b) => b.count - a.count);
  refs.sort((a, b) => b.count - a.count);
  return json({ views, refs });
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
```

- [ ] **Step 2: Create `functions/admin/api/emails.js`**

```js
export async function onRequestGet(context) {
  const { env } = context;
  const signups = [];
  let cursor;
  do {
    const list = await env.SIGNUPS.list({ prefix: 'signup:', limit: 1000, cursor });
    for (const k of list.keys) {
      const raw = await env.SIGNUPS.get(k.name);
      if (raw) { try { signups.push(JSON.parse(raw)); } catch {} }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  signups.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // newest first
  return new Response(JSON.stringify({ signups, count: signups.length }), {
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
```

- [ ] **Step 3: Verify end-to-end (subscribe then read as admin)**

Run:
```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
npx wrangler pages dev . --kv STATS --kv SIGNUPS --port 8788 >/tmp/wp.log 2>&1 &
sleep 6
curl -s -o /dev/null -X POST http://localhost:8788/api/subscribe -H 'Content-Type: application/json' -d '{"email":"e2e@test.com","name":"E2E","source":"test"}'
COOKIE=$(curl -s -D - -o /dev/null -X POST http://localhost:8788/admin/api/login -H 'Content-Type: application/json' -d '{"token":"dev-local-token-change-me"}' | grep -i set-cookie | sed 's/set-cookie: //I' | cut -d';' -f1)
echo "emails ->"; curl -s --cookie "$COOKIE" http://localhost:8788/admin/api/emails
echo; echo "unauth emails ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/admin/api/emails
kill %1
```
Expected: authed emails returns JSON containing `e2e@test.com`; unauth returns `302`.

- [ ] **Step 4: Commit**

```bash
git add functions/admin/api/stats.js functions/admin/api/emails.js
git commit -m "feat: admin stats and emails API endpoints"
```

---

### Task 9: Admin UI (login, dashboard, emails, demos) + shared assets

**Files:**
- Create: `admin/assets/admin.css`
- Create: `admin/assets/admin.js`
- Overwrite: `admin/login.html` (real login form)
- Overwrite: `admin/index.html` (dashboard)
- Create: `admin/emails.html`
- Create: `admin/demos.html`

**Interfaces:**
- Consumes admin APIs from Tasks 3/8. Login posts to `/admin/api/login`; dashboard fetches `/admin/api/stats`; emails page fetches `/admin/api/emails`; logout posts `/admin/api/logout`.

- [ ] **Step 1: Create `admin/assets/admin.css`**

```css
:root{--bg:#0f1115;--panel:#181b22;--ink:#e7e9ee;--muted:#9aa3b2;--accent:#c9a227;--red:#e0563b}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink)}
a{color:var(--accent)}
.wrap{max-width:1000px;margin:0 auto;padding:1.5rem}
.topbar{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2e37;padding:1rem 1.5rem}
.topbar nav a{margin-left:1rem;color:var(--muted);text-decoration:none}
.topbar nav a:hover{color:var(--ink)}
.card{background:var(--panel);border:1px solid #262b34;border-radius:10px;padding:1.25rem;margin-bottom:1.25rem}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem}
.stat{background:var(--panel);border-radius:10px;padding:1rem;text-align:center}
.stat b{display:block;font-size:1.8rem;color:var(--accent)}
.bar{height:10px;background:var(--accent);border-radius:5px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #262b34;font-size:.9rem}
th{color:var(--muted)}
.login-box{max-width:360px;margin:8vh auto;background:var(--panel);padding:2rem;border-radius:12px}
input{width:100%;padding:.6rem;border-radius:6px;border:1px solid #333;background:#0c0e12;color:var(--ink);font-size:1rem}
button{background:var(--accent);color:#181b22;border:none;border-radius:6px;padding:.6rem 1rem;font-weight:700;cursor:pointer;margin-top:.75rem}
.err{color:var(--red);min-height:1.2em;font-size:.9rem}
.demo-card{display:flex;justify-content:space-between;align-items:center}
```

- [ ] **Step 2: Create `admin/assets/admin.js`** (shared helpers: logout + fetch guard)

```js
export async function logout() {
  await fetch('/admin/api/logout', { method: 'POST' });
  location.href = '/admin/login.html';
}
export async function getJSON(url) {
  const r = await fetch(url);
  if (r.status === 302 || r.redirected) { location.href = '/admin/login.html'; return null; }
  return r.json();
}
export function topbar(active) {
  const tabs = [['index.html','Dashboard'],['emails.html','Emails'],['demos.html','Demos']];
  return `<div class="topbar"><strong>maniginam.dev · admin</strong><nav>${
    tabs.map(([h,l]) => `<a href="${h}"${h.includes(active)?' style="color:var(--ink)"':''}>${l}</a>`).join('')
  }<a href="#" id="logout">Log out</a></nav></div>`;
}
```

- [ ] **Step 3: Overwrite `admin/login.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin Login</title>
  <link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
  <form class="login-box" id="login">
    <h2>Admin Access</h2>
    <p style="color:var(--muted)">Enter your access token.</p>
    <input type="password" id="token" placeholder="Access token" autocomplete="off" autofocus>
    <div class="err" id="err"></div>
    <button type="submit">Enter</button>
  </form>
  <script type="module">
    document.getElementById('login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('token').value;
      const r = await fetch('/admin/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (r.status === 204) { location.href = '/admin/index.html'; }
      else { document.getElementById('err').textContent = 'Invalid token'; }
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Overwrite `admin/index.html`** (dashboard)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin · Dashboard</title>
  <link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
  <div id="bar"></div>
  <div class="wrap">
    <div class="stat-grid" id="stats"></div>
    <div class="card"><h3>Top Pages (last 30d)</h3><table id="pages"><tbody></tbody></table></div>
    <div class="card"><h3>Top Referrers</h3><table id="refs"><tbody></tbody></table></div>
  </div>
  <script type="module">
    import { topbar, getJSON, logout } from '/admin/assets/admin.js';
    document.getElementById('bar').innerHTML = topbar('index');
    document.getElementById('logout').addEventListener('click', e => { e.preventDefault(); logout(); });
    const data = await getJSON('/admin/api/stats');
    if (data) {
      const totalViews = data.views.reduce((s,v)=>s+v.count,0);
      const emails = await getJSON('/admin/api/emails');
      document.getElementById('stats').innerHTML =
        `<div class="stat"><b>${totalViews}</b>Pageviews</div>
         <div class="stat"><b>${data.views.length}</b>Tracked paths</div>
         <div class="stat"><b>${emails?emails.count:0}</b>Signups</div>`;
      const max = Math.max(1, ...data.views.map(v=>v.count));
      document.getElementById('pages').querySelector('tbody').innerHTML =
        data.views.slice(0,15).map(v =>
          `<tr><td>${v.path}</td><td>${v.count}</td>
           <td style="width:40%"><div class="bar" style="width:${Math.round(v.count/max*100)}%"></div></td></tr>`).join('')
        || '<tr><td colspan="3" style="color:var(--muted)">No data yet</td></tr>';
      document.getElementById('refs').querySelector('tbody').innerHTML =
        data.refs.slice(0,15).map(r => `<tr><td>${r.host}</td><td>${r.count}</td></tr>`).join('')
        || '<tr><td colspan="2" style="color:var(--muted)">No referrers yet</td></tr>';
    }
  </script>
</body>
</html>
```

- [ ] **Step 5: Create `admin/emails.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin · Emails</title>
  <link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
  <div id="bar"></div>
  <div class="wrap">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 id="count">Signups</h3>
        <button id="csv">Export CSV</button>
      </div>
      <table id="tbl"><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>When</th></tr></thead><tbody></tbody></table>
    </div>
  </div>
  <script type="module">
    import { topbar, getJSON, logout } from '/admin/assets/admin.js';
    document.getElementById('bar').innerHTML = topbar('emails');
    document.getElementById('logout').addEventListener('click', e => { e.preventDefault(); logout(); });
    const data = await getJSON('/admin/api/emails');
    if (data) {
      document.getElementById('count').textContent = `Signups (${data.count})`;
      document.querySelector('#tbl tbody').innerHTML =
        data.signups.map(s => `<tr><td>${s.email}</td><td>${s.name||''}</td><td>${s.source||''}</td><td>${s.ts}</td></tr>`).join('')
        || '<tr><td colspan="4" style="color:var(--muted)">No signups yet</td></tr>';
      document.getElementById('csv').addEventListener('click', () => {
        const rows = [['email','name','source','ts'], ...data.signups.map(s => [s.email,s.name||'',s.source||'',s.ts])];
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'signups.csv'; a.click();
      });
    }
  </script>
</body>
</html>
```

- [ ] **Step 6: Create `admin/demos.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin · Demos</title>
  <link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
  <div id="bar"></div>
  <div class="wrap">
    <div class="card demo-card">
      <div><h3 style="margin:.2rem 0">The Chop Shop</h3>
        <span style="color:var(--muted)">Static restaurant demo — menu, cart, checkout.</span></div>
      <a href="/admin/demo/chopshop/index.html"><button>Open demo →</button></a>
    </div>
  </div>
  <script type="module">
    import { topbar, logout } from '/admin/assets/admin.js';
    document.getElementById('bar').innerHTML = topbar('demos');
    document.getElementById('logout').addEventListener('click', e => { e.preventDefault(); logout(); });
  </script>
</body>
</html>
```

- [ ] **Step 7: Verify UI locally**

Run wrangler pages dev (as before), open `http://localhost:8788/admin/` in a browser: unauthenticated redirects to login; entering `dev-local-token-change-me` lands on the dashboard; Emails and Demos tabs load; Log out returns to login.

- [ ] **Step 8: Commit**

```bash
git add admin/assets/admin.css admin/assets/admin.js admin/login.html admin/index.html admin/emails.html admin/demos.html
git commit -m "feat: admin UI (login, dashboard, emails, demos)"
```

---

### Task 10: Newsletter capture form on the public site

**Files:**
- Modify: `index.html` (add a signup form near the contact section)

**Interfaces:**
- POSTs to `/api/subscribe` (Task 6). Source `home-footer`.

- [ ] **Step 1: Add the form markup**

Insert inside the `#contact` section of `index.html` (after the existing contact info), a form:

```html
<form id="subscribe" style="margin-top:1rem;max-width:420px">
  <label for="sub-email" style="font-weight:600">Get updates</label>
  <div style="display:flex;gap:.5rem;margin-top:.35rem">
    <input id="sub-email" type="email" placeholder="you@email.com" required
           style="flex:1;padding:.55rem;border:1px solid #ccc;border-radius:6px">
    <button type="submit" style="background:#8b1a1a;color:#fff;border:none;border-radius:6px;padding:.55rem 1rem;font-weight:700;cursor:pointer">Subscribe</button>
  </div>
  <div id="sub-msg" style="min-height:1.2em;font-size:.9rem;margin-top:.35rem"></div>
</form>
<script>
  document.getElementById('subscribe').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('sub-email').value;
    const msg = document.getElementById('sub-msg');
    const r = await fetch('/api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'home-footer' }),
    });
    if (r.ok) { msg.style.color = 'green'; msg.textContent = 'Thanks — you are subscribed.'; e.target.reset(); }
    else { msg.style.color = '#b00'; msg.textContent = 'Please enter a valid email.'; }
  });
</script>
```

Match surrounding markup/indentation in `index.html`. Place the styles inline (as above) only if the page lacks matching classes; otherwise reuse existing form classes.

- [ ] **Step 2: Verify**

Serve locally, submit the form with a valid email → success message; confirm it appears under `/admin/emails.html`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: newsletter signup form on home page"
```

---

### Task 11: Host the Chop Shop demo under /admin/demo/chopshop

**Files:**
- Create: `admin/demo/chopshop/**` (copy of the built demo)

**Interfaces:**
- Depends on the Chop Shop plan being implemented in `/Users/maniginam/projects/maniginam/chopshop`. The copy is gated by Task 4 middleware. Relative asset paths in the demo make it work under the subpath.

- [ ] **Step 1: Copy the built demo (excluding docs/git) into the admin path**

```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
mkdir -p admin/demo/chopshop
rsync -a --exclude '.git' --exclude 'docs' --exclude '.DS_Store' \
  /Users/maniginam/projects/maniginam/chopshop/ admin/demo/chopshop/
```

- [ ] **Step 2: Verify gated hosting**

Run wrangler pages dev; unauthenticated `GET /admin/demo/chopshop/index.html` → `302`; authenticated (with session cookie) → `200` and the demo renders (CSS/JS load via relative paths).

```bash
cd /Users/maniginam/projects/maniginam/maniginam.dev
npx wrangler pages dev . --kv STATS --kv SIGNUPS --port 8788 >/tmp/wp.log 2>&1 &
sleep 6
echo "unauth demo ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/admin/demo/chopshop/index.html
COOKIE=$(curl -s -D - -o /dev/null -X POST http://localhost:8788/admin/api/login -H 'Content-Type: application/json' -d '{"token":"dev-local-token-change-me"}' | grep -i set-cookie | sed 's/set-cookie: //I' | cut -d';' -f1)
echo "auth demo ->"; curl -s -o /dev/null -w "%{http_code}\n" --cookie "$COOKIE" http://localhost:8788/admin/demo/chopshop/index.html
kill %1
```
Expected: unauth `302`; auth `200`.

- [ ] **Step 3: Commit**

```bash
git add admin/demo/chopshop
git commit -m "feat: host Chop Shop demo at /admin/demo/chopshop (gated)"
```

---

### Task 12: Full-suite run + deployment notes

**Files:**
- Create: `docs/superpowers/DEPLOY-admin.md` (dashboard config checklist)

- [ ] **Step 1: Run the whole unit suite**

Run: `cd /Users/maniginam/projects/maniginam/maniginam.dev && npx vitest run`
Expected: all tests in `tests/` pass.

- [ ] **Step 2: Write `docs/superpowers/DEPLOY-admin.md`**

```markdown
# Admin Deploy Checklist (Cloudflare Pages dashboard)

1. Create two KV namespaces: `STATS`, `SIGNUPS`.
2. Pages project → Settings → Functions → KV bindings:
   - `STATS` → STATS namespace, `SIGNUPS` → SIGNUPS namespace (Production + Preview).
3. Pages project → Settings → Environment variables (encrypted):
   - `ADMIN_TOKEN` = <strong random token>
   - `SESSION_SECRET` = <strong random 32+ char secret>
4. Deploy from `admin-area` branch → verify, then merge to `master`.
5. Post-deploy checks:
   - `/admin/` (no cookie) → redirects to `/admin/login.html`.
   - Login with `ADMIN_TOKEN` → dashboard loads.
   - `/admin/demo/chopshop/` works only when authenticated.
   - Submit the home signup form → appears in `/admin/emails.html`.
   - Confirm `robots.txt` disallows `/admin/`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/DEPLOY-admin.md
git commit -m "docs: admin deploy checklist"
```

## Self-Review Notes

- Spec coverage: token gate ✓ (T2–T4), stats via KV ✓ (T7/T8/T9), email capture ✓ (T5/T6/T10), admin emails view ✓ (T8/T9), demos catalog + gated chopshop hosting ✓ (T9/T11), not-public ✓ (middleware redirect + robots + noindex, T1/T4). Security: constant-time compare ✓ (T2), signed HttpOnly/Secure/SameSite cookie ✓ (T2/T3), rate limit ✓ (T6), no secrets committed ✓ (.dev.vars gitignored, T1).
- Placeholder scan: KV ids are intentionally `PLACEHOLDER_SET_IN_DASHBOARD` (documented in T1/T12); no code placeholders.
- Type consistency: `makeSession`/`verifySession`/`timingSafeEqual`/`parseCookies`/`sessionCookieHeader` names consistent across `_auth.js`, login, middleware. Signup value shape `{email,name,source}` + `ts` consistent across `_validate.js`, `subscribe.js`, `emails.js`, admin UI. KV key schemes `views:`/`ref:`/`signup:`/`rl:` consistent across writer (T6/T7) and readers (T8).
- Middleware ordering: root `functions/_middleware.js` runs before `functions/admin/_middleware.js`; counting skips `/admin`, so admin views aren't counted and existing markdown/Link behavior is preserved (T7 verify step).
