# maniginam.dev — Private Admin Design

**Date:** 2026-07-07
**Status:** Approved

## Purpose

A token-gated, non-public admin area on maniginam.dev that shows visitation
stats and captured email signups, and hosts a catalog of demos (starting with
the Chop Shop demo) served privately at `/admin/demo/<slug>/`.

## Platform

maniginam.dev is a Cloudflare Pages site (static assets + Pages Functions;
existing `functions/_middleware.js` for agent-discovery/markdown negotiation),
deployed from GitHub `maniginam/maniginam.dev`. The admin is built with Pages
Functions + KV.

## Authentication

- All `/admin/*` routes gated by `functions/admin/_middleware.js`.
- Valid token stored as Cloudflare secret `ADMIN_TOKEN` (never committed).
  Compared using constant-time comparison.
- `/admin/login.html` is the only unauthenticated admin route. It POSTs the
  token to `functions/admin/api/login.js`.
- On a correct token: issue a session cookie whose value is
  `base64(expiryTs) + "." + HMAC_SHA256(base64(expiryTs), SESSION_SECRET)`.
  Cookie flags: `HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=604800`
  (7 days). Secret `SESSION_SECRET` is a Cloudflare secret.
- On any `/admin/*` request (except login routes): verify cookie signature and
  expiry. Missing/invalid → redirect to `/admin/login.html`. Wrong token on
  login → 401.
- All admin responses carry `X-Robots-Tag: noindex, nofollow`. `robots.txt`
  disallows `/admin/`.

### Security requirements

- Constant-time token + HMAC comparison (reject early length-mismatch, then
  byte-compare full length).
- No token or session value in URLs or logs.
- Session validation rejects tampered/expired cookies before serving anything.
- Login endpoint rate-limited (KV counter per IP, short window) to slow
  brute force.

## Visitation Stats (KV: `STATS`)

- Extend root `functions/_middleware.js`: on public HTML pageviews, increment
  KV counters via `context.waitUntil` (non-blocking). Keys:
  - `views:YYYY-MM-DD:<path>` (per-day per-path count)
  - `ref:YYYY-MM-DD:<referrerHost>` (per-day referrer tally)
- Skip counting for `/admin/*` and asset requests.
- `functions/admin/api/stats.js` reads KV, returns JSON: views by day (last 30),
  top paths, top referrers.
- `/admin/index.html` renders with lightweight inline canvas/CSS bars — no heavy
  chart libraries.

## Email Capture (KV: `SIGNUPS`)

- Add a newsletter/contact form to a maniginam.dev public page (footer/section)
  → POST `functions/api/subscribe.js`.
- Validation: well-formed email required; optional name; capture `source` and
  timestamp. Basic rate limit per IP (KV).
- Store each as KV entry keyed `signup:<ts>:<rand>` with JSON value
  `{email, name, source, ts}`.
- `functions/admin/api/emails.js` lists signups (newest first).
- `/admin/emails.html` renders the list + a CSV export (client-side download
  from the JSON).

## Demo Hosting

- `/admin/demos.html` — catalog of demos (currently one: Chop Shop) linking to
  `/admin/demo/chopshop/`.
- `/admin/demo/chopshop/` — a copy of the built Chop Shop static site placed in
  this repo under that path. Gated by `functions/admin/_middleware.js` like all
  `/admin/*`. Chop Shop uses relative asset paths and `localStorage`, so it
  works unmodified under the subpath.
- The Chop Shop deliverable lives in its own `chopshop/` folder/repo; the copy
  here is for private hosting. (Accepted minor duplication for a demo.)

## File Layout (new/changed in maniginam.dev)

```
functions/
  _middleware.js            (extend: pageview counter, skip /admin)
  admin/
    _middleware.js          (auth gate for /admin/*)
    api/
      login.js
      logout.js
      stats.js
      emails.js
  api/
    subscribe.js            (public signup capture)
admin/
  login.html
  index.html                (dashboard)
  emails.html
  demos.html
  demo/chopshop/...         (copied built site)
  assets/admin.css, admin.js
wrangler.toml               (local `wrangler pages dev`; KV + vars bindings)
robots.txt                  (add Disallow: /admin/)
```

## Bindings / Config (set once in CF Pages dashboard + wrangler.toml)

- KV namespaces: `STATS`, `SIGNUPS`.
- Secrets: `ADMIN_TOKEN`, `SESSION_SECRET`.

## Testing

- vitest + Miniflare (`@cloudflare/vitest-pool-workers`) for:
  - auth middleware: no cookie → redirect; bad token → 401; good token → cookie
    set; tampered/expired cookie → rejected; constant-time compare path.
  - `subscribe.js`: valid stores, invalid rejected, rate limit trips.
  - `stats.js` / `emails.js`: read + shape of JSON, admin-only.
- Follow TDD: red → green → refactor per handler.

## Out of Scope (YAGNI)

- Multi-user accounts / roles (single shared token).
- GA4 Data API integration (own KV counter chosen instead).
- Gmail inbox integration.
- Editing demos through the UI.

## Cost

$0 recurring — Cloudflare Pages + KV free tier. No new subscriptions.
