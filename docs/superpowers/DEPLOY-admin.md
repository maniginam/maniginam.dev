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
