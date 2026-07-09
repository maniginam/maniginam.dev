/* ============================================================
   WBR Parish Digital Services — production SPA
   Vanilla JS · hash router · real API (Cloudflare D1) · Leaflet maps.
   Data lives in D1 via /demo/wbr-portal/api/*  — no localStorage.
   ============================================================ */
'use strict';

const PORT_ALLEN = [30.4505, -91.2093];

/* API base — the portal is served at /demo/wbr-portal/ */
const ROOT = location.pathname.replace(/\/(index\.html)?$/, '') || '/demo/wbr-portal';
const api = (p) => `${ROOT}/api/${p}`;

async function apiGet(p) {
  const r = await fetch(api(p), { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
  return r.json();
}
async function apiPost(p, body) {
  const r = await fetch(api(p), {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/* ---------------- static content ---------------- */
const SERVICES = [
  { ic:'🛠️', t:'Report an Issue', d:'Potholes, drainage, lights, debris — tell us and track it.', href:'#/report' },
  { ic:'💧', t:'Pay Water Bill',   d:'View and pay your parish water & sewer bill online.', href:'#/services' },
  { ic:'📋', t:'Permits & Zoning', d:'Apply for building, occupancy, and land-use permits.', href:'#/services' },
  { ic:'🗓️', t:'Council Meetings', d:'Agendas, minutes, and live video of every meeting.', href:'#/media' },
  { ic:'🚒', t:'Fire Department',   d:'Stations, burn permits, and safety resources.', href:'#/dept/fire' },
  { ic:'🌳', t:'Parks & Rec',       d:'Facilities, programs, and pavilion reservations.', href:'#/dept/parks' },
  { ic:'🏛️', t:'Museum',            d:'Hours, exhibits, and events at the WBR Museum.', href:'#/services' },
  { ic:'🚮', t:'Trash & Recycling', d:'Pickup schedules, bulk waste, and holiday changes.', href:'#/services' },
];
const NEWS = [
  { d:'12', m:'Jul', t:'Council adopts FY2026 operating budget', p:'The Parish Council approved the annual budget at the July 10 regular meeting.' },
  { d:'08', m:'Jul', t:'Summer drainage maintenance underway', p:'Crews are clearing culverts parish-wide ahead of hurricane season.' },
  { d:'01', m:'Jul', t:'Independence Day trash schedule', p:'No collection July 4. Friday routes move to Saturday.' },
  { d:'26', m:'Jun', t:'Splash pad opens at Cohn Park', p:'Free admission all summer, 10am–7pm daily.' },
];
const CATEGORIES = [
  { id:'pothole',  ic:'🕳️', t:'Pothole / Road' },
  { id:'drainage', ic:'💧', t:'Drainage / Flooding' },
  { id:'light',    ic:'💡', t:'Street Light' },
  { id:'debris',   ic:'🌿', t:'Debris / Dumping' },
  { id:'sign',     ic:'🚧', t:'Sign / Signal' },
  { id:'water',    ic:'🚰', t:'Water / Sewer' },
];
const CAT = id => CATEGORIES.find(c => c.id === id) || { ic:'📌', t:'Other' };
const STATUS_LABEL = { new:'New', prog:'In Progress', done:'Resolved' };

/* meeting embeds — YouTube sources (parish govt streams / placeholders) */
const MEDIA = [
  { t:'Parish Council — Regular Meeting', d:'Jul 24, 2026 · Upcoming', live:true,  yt:'jNQXAC9IVRw' },
  { t:'Parish Council — Regular Meeting', d:'Jul 10, 2026 · 1h 42m',   live:false, yt:'aqz-KE-bpKQ' },
  { t:'Finance Committee',                d:'Jul 8, 2026 · 51m',       live:false, yt:'aqz-KE-bpKQ' },
  { t:'Planning & Zoning',                d:'Jun 26, 2026 · 1h 05m',   live:false, yt:'aqz-KE-bpKQ' },
  { t:'Parish Council — Regular Meeting', d:'Jun 12, 2026 · 2h 03m',   live:false, yt:'aqz-KE-bpKQ' },
  { t:'Board of Adjustments',             d:'Jun 5, 2026 · 38m',       live:false, yt:'aqz-KE-bpKQ' },
];

/* ---------------- helpers ---------------- */
const $ = (s, r=document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
function toast(msg) {
  let t = $('.toast'); if (!t) { t = el('<div class="toast"></div>'); document.body.appendChild(t); }
  t.textContent = msg; requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._to); t._to = setTimeout(() => t.classList.remove('show'), 2600);
}
function badge(status) { return `<span class="badge ${status}">${STATUS_LABEL[status]||status}</span>`; }
/* HTML-escape any value that originated from user input (issue text, names, event notes)
   before it goes into an innerHTML template — prevents stored XSS. */
const ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s/60) + 'm ago';
  if (s < 86400) return Math.round(s/3600) + 'h ago';
  return Math.round(s/86400) + 'd ago';
}

/* auth state (from /api/staff/me) */
let ME = { authed:false, user:null };
async function refreshMe() { try { ME = await apiGet('staff/me'); } catch { ME = { authed:false }; } }

/* draft for the 311 wizard */
let draft = { cat:null, title:'', addr:'', desc:'', name:'', contact:'', ll:PORT_ALLEN.slice(), step:1 };

/* ---------------- shell ---------------- */
function chrome() {
  return `
  <div class="util"><div class="wrap">
    <span class="demo-flag">DEMO</span>
    <span>West Baton Rouge Parish · Port Allen, LA</span>
    <span class="spacer"></span>
    <a href="#/login" id="util-staff">Staff Login</a>
    <a href="tel:2253834755">(225) 383-4755</a>
  </div></div>
  <header class="masthead"><div class="wrap">
    <a class="brand" href="#/">
      <span class="seal">WBR</span>
      <span><b>West Baton Rouge Parish</b><span>Digital Services Portal</span></span>
    </a>
    <button class="burger" aria-label="Menu" onclick="document.querySelector('.nav').classList.toggle('open')">☰</button>
    <nav class="nav">
      <a href="#/">Home</a>
      <a href="#/services">Services</a>
      <a href="#/media">Meetings</a>
      <a href="#/track">Track a Request</a>
      <a href="#/council">For Council</a>
      <a href="#/report" class="cta">Report an Issue</a>
    </nav>
  </div></header>
  <main id="view"></main>
  <footer class="foot"><div class="wrap">
    <div class="brand"><h5>West Baton Rouge Parish</h5>
      <p style="font-size:.88rem">880 N. Alexander Ave · Port Allen, LA 70767<br>P.O. Box 757 · (225) 383-4755</p>
      <p style="margin-top:12px;font-size:.78rem;opacity:.8">A demonstration portal built by ManiGinaM — a Port Allen software studio.</p>
    </div>
    <div><h5>Services</h5>
      <a href="#/report">Report an Issue</a><a href="#/track">Track a Request</a>
      <a href="#/services">Permits & Zoning</a><a href="#/services">Pay Water Bill</a></div>
    <div><h5>Government</h5>
      <a href="#/media">Council Meetings</a><a href="#/council">Budget & Transparency</a>
      <a href="#/dept/fire">Fire Department</a><a href="#/dept/parks">Parks & Rec</a></div>
    <div><h5>Connect</h5>
      <a href="#/login">Staff Login</a><a href="#/report">Mobile App (PWA)</a>
      <a href="tel:2253834755">Call the Parish</a></div>
    <div class="legal">
      <span>© 2026 West Baton Rouge Parish — demonstration only, not the official parish website.</span>
      <span>Built locally in Port Allen · ManiGinaM</span>
    </div>
  </div></footer>`;
}

/* ---------------- views ---------------- */
const views = {};

views.home = () => `
  <section class="hero"><div class="wrap">
    <div class="reveal d1">
      <div class="river-rule"></div>
      <p class="eyebrow">West Baton Rouge Parish</p>
      <h1>Your parish, <em>one tap</em> away.</h1>
      <p class="lede">Report a pothole, pay your water bill, watch a council meeting, or track a request — all from one fast, modern portal that works right on your phone.</p>
      <div class="hero-actions">
        <a class="btn gold" href="#/report">Report an Issue →</a>
        <a class="btn ghost" href="#/services">Explore Services</a>
      </div>
    </div>
    <div class="hero-art reveal d3">
      <div class="card-float c1"><div class="chip"><span class="dot"></span> Request received</div>
        <p style="font-family:var(--font-disp);font-size:1.05rem;color:var(--river);margin-top:6px">Pothole · N Jefferson Ave</p>
        <p class="muted" style="font-size:.8rem">Ticket WBR-24817 · assigned to Public Works</p></div>
      <div class="card-float c2 mini-stat"><b id="hs-total">—</b><span>requests in the system</span></div>
      <div class="card-float c3 mini-stat"><b id="hs-done">—</b><span>resolved to date</span></div>
    </div>
  </div></section>

  <section class="section tight"><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Popular Services</p><h2>What can we help you with?</h2></div>
      <a class="btn ghost sm" href="#/services">All services</a></div>
    <div class="svc-grid">
      ${SERVICES.map((s,i)=>`
        <a class="svc reveal d${(i%4)+1}" href="${s.href}">
          <span class="ic">${s.ic}</span><b>${s.t}</b><span>${s.d}</span><span class="go">Open →</span></a>`).join('')}
    </div>
  </div></section>

  <section class="section"><div class="wrap grid-2">
    <div>
      <p class="eyebrow">News & Notices</p><h2 style="margin-bottom:18px">Around the Parish</h2>
      ${NEWS.map(n=>`
        <div class="news-item"><div class="news-date"><b>${n.d}</b><span>${n.m}</span></div>
          <div><h4>${n.t}</h4><p>${n.p}</p></div></div>`).join('')}
    </div>
    <div>
      <div class="aside-card">
        <h3>Next Council Meeting</h3>
        <p style="font-size:.92rem">Thursday, July 24 · 5:30 PM<br>Governmental Building, Port Allen</p>
        <ul style="margin-top:14px">
          <li><span>Agenda packet</span><a href="#/media" style="color:var(--gold-soft)">View →</a></li>
          <li><span>Watch live</span><a href="#/media" style="color:var(--gold-soft)">Stream →</a></li>
          <li><span>Public comment</span><a href="#/media" style="color:var(--gold-soft)">Sign up →</a></li>
        </ul>
      </div>
      <div class="aside-card" style="margin-top:16px;background:var(--gold);color:#2a1d05">
        <h3 style="color:#3a2606">Get parish alerts</h3>
        <p style="font-size:.9rem">Boil-water notices, road closures, storm updates — straight to your inbox.</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <input type="email" id="sub-email" placeholder="you@email.com" style="flex:1;padding:10px;border:0;border-radius:8px;font-size:.9rem">
          <button class="btn" style="background:#2a1d05" onclick="wbrSubscribe()">Sign up</button>
        </div>
      </div>
    </div>
  </div></section>`;

views.services = () => `
  <div class="pagehead"><div class="wrap">
    <div class="crumbs"><a href="#/">Home</a> / Services</div>
    <h1>Parish Services</h1><p>Everything the parish offers residents, in one place. This demo focuses on the working citizen-reporting flow.</p>
  </div></div>
  <div class="page"><div class="wrap">
    <div class="svc-grid">
      ${SERVICES.concat([
        {ic:'📄',t:'Occupational License',d:'Register or renew a parish business license.',href:'#/services'},
        {ic:'🗳️',t:'Boards & Committees',d:'Meeting schedules and member rosters.',href:'#/media'},
        {ic:'🏗️',t:'Code Enforcement',d:'Report a code violation or check a case.',href:'#/report'},
        {ic:'📬',t:'Notify Me',d:'Get parish alerts by text or email.',href:'#/services'},
      ]).map((s,i)=>`
        <a class="svc reveal d${(i%4)+1}" href="${s.href}">
          <span class="ic">${s.ic}</span><b>${s.t}</b><span>${s.d}</span><span class="go">Open →</span></a>`).join('')}
    </div>
    <div class="panel" style="margin-top:26px;text-align:center">
      <p class="eyebrow">Note for reviewers</p>
      <h3 style="margin:6px 0 8px">This is the wedge, not the whole suite.</h3>
      <p class="muted" style="max-width:60ch;margin-inline:auto">The working demo covers the parish website, citizen "report an issue" (backed by a real database), a staff dashboard, mass communications, and meeting video — the pieces the parish pays CivicPlus & SeeClickFix roughly $50k/yr for today.</p>
      <a class="btn gold" style="margin-top:16px" href="#/council">See the cost comparison →</a>
    </div>
  </div></div>`;

/* ----- 311 wizard ----- */
views.report = () => `
  <div class="pagehead"><div class="wrap">
    <div class="crumbs"><a href="#/">Home</a> / Report an Issue</div>
    <h1>Report an Issue</h1><p>Tell the parish what's wrong. You'll get a tracking number and updates as it's resolved.</p>
  </div></div>
  <div class="page"><div class="wrap"><div class="wizard panel">
    <div class="steps">
      ${[1,2,3].map(n=>`<div class="step ${draft.step===n?'on':draft.step>n?'done':''}">${['Category','Details','Review'][n-1]}</div>`).join('')}
    </div>
    <div id="wizbody"></div>
  </div></div></div>`;

function renderWizard() {
  const b = $('#wizbody'); if (!b) return;
  if (draft.step === 1) {
    b.innerHTML = `
      <h3 style="margin-bottom:6px">What's the problem?</h3>
      <p class="muted" style="margin-bottom:18px">Pick a category to get started.</p>
      <div class="cat-grid">
        ${CATEGORIES.map(c=>`<div class="cat ${draft.cat===c.id?'sel':''}" data-cat="${c.id}"><span class="ic">${c.ic}</span><b>${c.t}</b></div>`).join('')}
      </div>
      <div class="wizard-nav"><span></span>
        <button class="btn" id="next1" ${draft.cat?'':'disabled style=opacity:.5'}>Continue →</button></div>`;
    b.querySelectorAll('.cat').forEach(c => c.onclick = () => { draft.cat = c.dataset.cat; renderWizard(); });
    const n = $('#next1'); if (n) n.onclick = () => { draft.step = 2; renderWizard(); };
  }
  else if (draft.step === 2) {
    b.innerHTML = `
      <h3 style="margin-bottom:14px">${CAT(draft.cat).ic} ${CAT(draft.cat).t} — details</h3>
      <div class="field"><label>Short title</label>
        <input type="text" id="f_title" placeholder="e.g. Large pothole near the school" value="${draft.title}"></div>
      <div class="field"><label>Where is it? <span class="hint">Drag the pin or type an address</span></label>
        <input type="text" id="f_addr" placeholder="Nearest address or intersection" value="${draft.addr}">
        <div id="pickmap" style="margin-top:10px"></div>
        <p class="map-hint">📍 Pin dropped near Port Allen — drag it to the exact spot.</p></div>
      <div class="field"><label>Describe it <span class="hint">(optional)</span></label>
        <textarea id="f_desc" placeholder="Anything that helps our crew...">${draft.desc}</textarea></div>
      <div class="field"><label>📷 Add a photo <span class="hint">(optional, demo)</span></label>
        <button class="btn ghost sm" type="button" onclick="toast('Photo attached (demo)')">Choose photo…</button></div>
      <div class="field"><label>Your name & contact <span class="hint">so we can update you</span></label>
        <input type="text" id="f_name" placeholder="Name" value="${draft.name}" style="margin-bottom:8px">
        <input type="text" id="f_contact" placeholder="Email or phone" value="${draft.contact}"></div>
      <div class="wizard-nav">
        <button class="btn ghost" id="back2">← Back</button>
        <button class="btn" id="next2">Review →</button></div>`;
    initPickMap();
    const bind = (id, key) => { const e = $('#'+id); if (e) e.oninput = () => draft[key] = e.value; };
    bind('f_title','title'); bind('f_addr','addr'); bind('f_desc','desc'); bind('f_name','name'); bind('f_contact','contact');
    $('#back2').onclick = () => { draft.step = 1; renderWizard(); };
    $('#next2').onclick = () => { if (!draft.title.trim()) { toast('Add a short title'); return; } draft.step = 3; renderWizard(); };
  }
  else if (draft.step === 3) {
    b.innerHTML = `
      <h3 style="margin-bottom:14px">Review & submit</h3>
      <div class="detail-card" style="margin-top:0">
        <div style="display:flex;justify-content:space-between;align-items:center"><b class="serif" style="font-size:1.15rem;color:var(--river)">${CAT(draft.cat).ic} ${draft.title||'(untitled)'}</b>${badge('new')}</div>
        <p class="muted" style="margin-top:8px"><b>Category:</b> ${CAT(draft.cat).t}</p>
        <p class="muted"><b>Location:</b> ${draft.addr||'Pinned on map'}</p>
        <p class="muted"><b>Details:</b> ${draft.desc||'—'}</p>
        <p class="muted"><b>Contact:</b> ${draft.name||'Anonymous'} ${draft.contact?('· '+draft.contact):''}</p>
      </div>
      <div class="wizard-nav">
        <button class="btn ghost" id="back3">← Back</button>
        <button class="btn gold" id="submit3">Submit request ✓</button></div>`;
    $('#back3').onclick = () => { draft.step = 2; renderWizard(); };
    $('#submit3').onclick = submitIssue;
  }
}

async function submitIssue() {
  const btn = $('#submit3'); if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  const { ok, data } = await apiPost('issues', {
    category: draft.cat, title: draft.title, description: draft.desc, address: draft.addr,
    lat: draft.ll[0], lng: draft.ll[1], name: draft.name, contact: draft.contact, source: 'app',
  });
  if (!ok || !data.issue) { toast(data.error || 'Submit failed'); if (btn){ btn.disabled=false; btn.textContent='Submit request ✓'; } return; }
  const i = data.issue, cat = CAT(i.cat);
  $('#view').innerHTML = `
    <div class="page"><div class="wrap"><div class="ticket reveal d1">
      <div class="top"><div class="big">✓ Request received</div><p>Thanks — the parish has it.</p></div>
      <div class="num">${esc(i.id)}</div>
      <div class="rows">
        <div><span class="muted">Issue</span><b>${cat.ic} ${esc(i.title)}</b></div>
        <div><span class="muted">Status</span>${badge('new')}</div>
        <div><span class="muted">Location</span><span>${esc(i.addr)||'Pinned on map'}</span></div>
        <div><span class="muted">You'll hear back</span><span>within 1–2 business days</span></div>
      </div>
      <div style="padding:0 24px 26px;display:flex;gap:10px">
        <a class="btn ghost block" href="#/track">Track this request</a>
        <button class="btn block" onclick="window._reportAgain()">Report another</button>
      </div>
    </div>
    <p style="text-align:center;margin-top:18px" class="muted">Staff see this instantly on the <a href="#/login">operations dashboard</a>.</p>
    </div></div>`;
  draft = { cat:null, title:'', addr:'', desc:'', name:'', contact:'', ll:PORT_ALLEN.slice(), step:1 };
  toast('Request ' + i.id + ' submitted');
}
window._reportAgain = () => { draft = { cat:null, title:'', addr:'', desc:'', name:'', contact:'', ll:PORT_ALLEN.slice(), step:1 }; $('#view').innerHTML = views.report(); renderWizard(); window.scrollTo(0,0); };

/* ----- track ----- */
views.track = () => `
  <div class="pagehead"><div class="wrap">
    <div class="crumbs"><a href="#/">Home</a> / Track a Request</div>
    <h1>Track a Request</h1><p>Enter a ticket number, or browse recent requests in the parish.</p>
  </div></div>
  <div class="page"><div class="wrap">
    <div class="panel" style="margin-bottom:22px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="track_q" placeholder="WBR-24817" style="flex:1;min-width:200px;padding:12px 14px;border:1.5px solid var(--line);border-radius:8px;font-size:1rem">
      <button class="btn" onclick="wbrTrackLookup()">Look up</button>
    </div>
    <div id="track_result"></div>
    <p class="eyebrow" style="margin-bottom:12px">Recent requests</p>
    <div class="staff-list" id="track_list" style="max-height:none"><p class="muted" style="padding:16px">Loading…</p></div>
  </div></div>`;

async function mountTrack() {
  const data = await apiGet('issues');
  const list = $('#track_list'); if (!list) return;
  list.innerHTML = (data.issues || []).map(i => `
    <div class="issue-row"><div class="r1"><b>${CAT(i.cat).ic} ${esc(i.title)}</b>${badge(i.status)}</div>
      <div class="meta">${esc(i.id)} · ${esc(i.addr)} · ${ago(i.created_at)}</div></div>`).join('') || '<p class="muted" style="padding:16px">No requests yet.</p>';
}
window.wbrTrackLookup = async () => {
  const q = ($('#track_q').value || '').trim().toUpperCase(); if (!q) return;
  const data = await apiGet('issues/' + encodeURIComponent(q));
  const box = $('#track_result');
  if (data.error || !data.issue) { box.innerHTML = `<div class="panel" style="margin-bottom:22px">No request found for <b>${esc(q)}</b>.</div>`; return; }
  const i = data.issue;
  box.innerHTML = `<div class="panel" style="margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;align-items:center"><b class="serif" style="font-size:1.2rem;color:var(--river)">${CAT(i.cat).ic} ${esc(i.title)}</b>${badge(i.status)}</div>
    <p class="muted" style="margin-top:8px"><b>${esc(i.id)}</b> · ${esc(i.addr)}</p>
    <div style="margin-top:12px">${(data.events||[]).map(e=>`<div style="display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)"><span class="muted" style="font-size:.8rem;min-width:120px">${new Date(e.created_at).toLocaleDateString()}</span><span style="font-size:.9rem">${esc(e.detail||e.kind)}</span></div>`).join('')}</div>
  </div>`;
};

/* ----- login ----- */
views.login = () => {
  if (ME.authed) { location.hash = '#/staff'; return '<div class="page"></div>'; }
  return `
  <div class="page"><div class="wrap"><div class="login-wrap">
    <div class="panel reveal d1">
      <span class="seal" style="margin:0 auto 14px">WBR</span>
      <h2>Staff Sign In</h2>
      <p class="muted" style="margin-bottom:20px">Parish operations dashboard</p>
      <div class="field" style="text-align:left"><label>Username</label>
        <input type="text" id="lg_user" value="brady" autocomplete="username"></div>
      <div class="field" style="text-align:left"><label>Password</label>
        <input type="password" id="lg_pass" value="wbr2026" autocomplete="current-password"></div>
      <button class="btn block gold" id="lg_go">Sign in →</button>
      <div class="login-note">🔑 <b>Demo login for Brady:</b> username <b>brady</b> · password <b>wbr2026</b> (pre-filled — just click Sign in). Real accounts &amp; roles are stored in the database.</div>
    </div>
  </div></div></div>`;
};
async function doLogin() {
  const username = $('#lg_user').value, password = $('#lg_pass').value;
  const btn = $('#lg_go'); btn.disabled = true; btn.textContent = 'Signing in…';
  const { ok, data } = await apiPost('staff/login', { username, password });
  if (!ok) { toast(data.error || 'Login failed'); btn.disabled = false; btn.textContent = 'Sign in →'; return; }
  await refreshMe();
  toast('Welcome, ' + (data.user?.name || username));
  location.hash = '#/staff';
}

/* ----- staff dashboard ----- */
views.staff = () => {
  if (!ME.authed) { location.hash = '#/login'; return '<div class="page"></div>'; }
  return `
  <div class="pagehead"><div class="wrap" style="display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap">
    <div><div class="crumbs">Operations · ${ME.user?.name||''}</div><h1>Service Request Dashboard</h1>
      <p>Every citizen report lands here in real time — assign, update, resolve.</p></div>
    <div style="display:flex;gap:8px">
      <a class="btn ghost sm" href="#/comms" style="color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)">Send Alert</a>
      <button class="btn ghost sm" onclick="wbrLogout()" style="color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)">Sign out</button>
    </div>
  </div></div>
  <div class="page"><div class="wrap">
    <div class="stat-strip" id="staffstats">
      <div class="stat-card"><b id="st-total">—</b><span>Open + recent</span></div>
      <div class="stat-card"><b id="st-new" style="color:var(--clay)">—</b><span>New / unassigned</span></div>
      <div class="stat-card"><b id="st-prog" style="color:var(--sky)">—</b><span>In progress</span></div>
      <div class="stat-card"><b id="st-done" style="color:var(--moss)">—</b><span>Resolved</span></div>
    </div>
    <div class="staff-wrap">
      <div class="staff-list" id="stafflist"><p class="muted" style="padding:16px">Loading requests…</p></div>
      <div>
        <div id="staffmap"></div>
        <div id="staffdetail" class="detail-card"><p class="muted">Select a request to view details and take action.</p></div>
      </div>
    </div>
  </div></div>`;
};

let staffIssues = [];
async function mountStaff() {
  if (!$('#staffmap')) return;
  const [data, sc] = await Promise.all([apiGet('issues'), apiGet('stats')]);
  staffIssues = data.issues || [];
  setStats(sc);
  const list = $('#stafflist');
  list.innerHTML = staffIssues.map(i => `
    <div class="issue-row" data-id="${esc(i.id)}"><div class="r1"><b>${CAT(i.cat).ic} ${esc(i.title)}</b>${badge(i.status)}</div>
      <div class="meta">${esc(i.id)} · ${esc(i.addr)}<br>${ago(i.created_at)} · ${esc(i.by)}</div></div>`).join('') || '<p class="muted" style="padding:16px">No requests.</p>';

  const map = L.map('staffmap', { scrollWheelZoom:false }).setView(PORT_ALLEN, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(map);
  const colors = { new:'#c0492f', prog:'#2b6cb0', done:'#2f7d5b' };
  const markers = {};
  staffIssues.forEach(i => {
    if (i.ll[0] == null) return;
    const mk = L.circleMarker(i.ll, { radius:9, color:'#fff', weight:2, fillColor:colors[i.status], fillOpacity:.95 })
      .addTo(map).bindTooltip(`${i.id} · ${CAT(i.cat).t}`);
    mk.on('click', () => selectIssue(i.id));
    markers[i.id] = mk;
  });
  list.querySelectorAll('.issue-row').forEach(r =>
    r.onclick = () => { selectIssue(r.dataset.id); const i = staffIssues.find(x=>x.id===r.dataset.id); if (i && i.ll[0]!=null) map.panTo(i.ll); });
  window._staffMarkers = markers; window._staffColors = colors; window._staffMap = map;
}
function setStats(sc) {
  const set = (id,v)=>{ const e=$('#'+id); if(e) e.textContent = v; };
  set('st-total', sc.total ?? '—'); set('st-new', sc.new ?? 0); set('st-prog', sc.prog ?? 0); set('st-done', sc.done ?? 0);
}

async function selectIssue(id) {
  document.querySelectorAll('#stafflist .issue-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
  const box = $('#staffdetail'); box.innerHTML = '<p class="muted">Loading…</p>';
  const data = await apiGet('issues/' + encodeURIComponent(id));
  if (data.error) { box.innerHTML = '<p class="muted">Not found.</p>'; return; }
  const i = data.issue, c = CAT(i.cat);
  const jid = encodeURIComponent(i.id);
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <b class="serif" style="font-size:1.2rem;color:var(--river)">${c.ic} ${esc(i.title)}</b>${badge(i.status)}</div>
    <p class="muted" style="margin-top:8px"><b>${esc(i.id)}</b> · ${c.t}${i.assigned?(' · assigned: '+esc(i.assigned)):''}</p>
    <p class="muted"><b>Location:</b> ${esc(i.addr)}</p>
    <p class="muted"><b>Reported:</b> ${ago(i.created_at)} · ${esc(i.by)}</p>
    ${i.desc?`<p class="muted"><b>Details:</b> ${esc(i.desc)}</p>`:''}
    <div class="actions">
      <button class="btn sm" onclick="wbrStatus('${jid}','prog')">Mark In Progress</button>
      <button class="btn sm gold" onclick="wbrStatus('${jid}','done')">Mark Resolved</button>
      <button class="btn sm ghost" onclick="wbrAssign('${jid}')">Assign crew</button>
      <button class="btn sm ghost" onclick="wbrNotify('${jid}')">Notify resident</button>
    </div>
    <div style="margin-top:14px">${(data.events||[]).map(e=>`<div style="display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)"><span class="muted" style="font-size:.78rem;min-width:96px">${new Date(e.created_at).toLocaleDateString()}</span><span style="font-size:.86rem">${esc(e.detail||e.kind)} <span class="muted">— ${esc(e.actor)}</span></span></div>`).join('')}</div>`;
}
window.wbrStatus = async (id, status) => {
  const { ok, data } = await apiPost(`issues/${id}/status`, { status });
  if (!ok) { toast(data.error || 'Failed'); return; }
  const i = staffIssues.find(x=>x.id===id); if (i) i.status = status;
  const mk = window._staffMarkers && window._staffMarkers[id]; if (mk) mk.setStyle({ fillColor: window._staffColors[status] });
  const row = document.querySelector(`#stafflist .issue-row[data-id="${id}"] .r1 .badge`); if (row) row.outerHTML = badge(status);
  setStats(await apiGet('stats'));
  selectIssue(id);
  toast('Status → ' + STATUS_LABEL[status]);
};
window.wbrAssign = async (id) => { const { ok } = await apiPost(`issues/${id}/assign`, { to:'Public Works' }); if (ok){ toast('Assigned to Public Works'); selectIssue(id);} };
window.wbrNotify = async (id) => { const { ok } = await apiPost(`issues/${id}/notify`, {}); if (ok){ toast('Update sent to resident'); selectIssue(id);} };
window.wbrLogout = async () => { await apiPost('staff/logout', {}); await refreshMe(); toast('Signed out'); location.hash = '#/'; };

window.wbrSubscribe = async () => {
  const email = ($('#sub-email')?.value || '').trim(); if (!email) { toast('Enter an email'); return; }
  const { ok, data } = await apiPost('subscribe', { email, channels:'email' });
  toast(ok ? 'Subscribed — thanks!' : (data.error || 'Try again'));
  if (ok && $('#sub-email')) $('#sub-email').value = '';
};

/* ----- comms composer ----- */
views.comms = () => {
  if (!ME.authed) { location.hash = '#/login'; return '<div class="page"></div>'; }
  return `
  <div class="pagehead"><div class="wrap"><div class="crumbs">Operations</div>
    <h1>Send a Parish Alert</h1><p>Reach every resident by text and email — replaces the CivicSend blast tool. Email sends for real when a provider key is set.</p></div></div>
  <div class="page"><div class="wrap comms-grid">
    <div class="panel">
      <div class="channel-toggle" id="cm_ch">
        <button class="on" data-ch="email">✉️ Email</button>
        <button data-ch="sms">📱 Text (SMS)</button>
        <button data-ch="push">🔔 Push</button>
      </div>
      <div class="field"><label>Audience</label>
        <select id="cm_aud"><option>All residents</option><option>Water customers</option><option>District IV</option><option>Emergency list</option></select></div>
      <div class="field"><label>Subject <span class="hint">(email)</span></label>
        <input type="text" id="cm_subj" value="West Baton Rouge Parish Alert"></div>
      <div class="field"><label>Message</label>
        <textarea id="cm_msg" oninput="document.getElementById('cm_prev').textContent=this.value||'Your message preview appears here…'">Boil-water advisory lifted for Port Allen as of 8 AM. Water is safe to drink. Questions: (225) 383-4755.</textarea></div>
      <button class="btn gold" id="cm_send">Send now →</button>
    </div>
    <div>
      <p class="eyebrow" style="margin-bottom:10px">Live preview</p>
      <div class="phone-preview"><div class="screen">
        <p style="font-weight:800;color:var(--river)">WBR Parish Alert</p>
        <div class="sms-bubble" id="cm_prev">Boil-water advisory lifted for Port Allen as of 8 AM. Water is safe to drink. Questions: (225) 383-4755.</div>
        <p class="muted" style="font-size:.72rem;margin-top:12px">Preview · delivered to subscribers</p>
      </div></div>
    </div>
  </div></div>`;
};
function mountComms() {
  let ch = 'email';
  const wrap = $('#cm_ch'); if (!wrap) return;
  wrap.querySelectorAll('button').forEach(b => b.onclick = () => {
    wrap.querySelectorAll('button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); ch = b.dataset.ch;
  });
  $('#cm_send').onclick = async () => {
    const body = $('#cm_msg').value, subject = $('#cm_subj').value, audience = $('#cm_aud').value;
    const btn = $('#cm_send'); btn.disabled = true; btn.textContent = 'Sending…';
    const { ok, data } = await apiPost('alerts/send', { channel:ch, body, subject, audience });
    btn.disabled = false; btn.textContent = 'Send now →';
    if (!ok) { toast(data.error || 'Failed'); return; }
    const msg = data.status === 'sent' ? `Sent to ${data.delivered} residents`
      : data.status === 'simulated' ? `Queued to ${data.recipients} residents (email provider not yet keyed)`
      : data.status === 'queued' ? `Queued — SMS provider pending`
      : `Logged (${data.status})`;
    toast(msg);
  };
}

/* ----- media / meetings ----- */
views.media = () => `
  <div class="pagehead"><div class="wrap"><div class="crumbs"><a href="#/">Home</a> / Meetings</div>
    <h1>Meetings & Video</h1><p>Watch live, catch up on demand, and read every agenda — replaces CivicPlus Media + Agenda Management.</p></div></div>
  <div class="page"><div class="wrap">
    <div id="media_player" class="panel" style="margin-bottom:22px;display:none"></div>
    <div class="media-grid">
      ${MEDIA.map((m)=>`<div class="media-card">
        <div class="media-thumb" style="background-image:url('https://i.ytimg.com/vi/${m.yt}/hqdefault.jpg');background-size:cover">${m.live?'<span class="live">● LIVE SOON</span>':''}<div class="play">▶</div></div>
        <div class="m-body"><h4>${m.t}</h4><div class="m-meta">${m.d}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn sm" onclick="wbrPlay('${m.yt}','${m.t.replace(/'/g,'')}')">${m.live?'Set reminder':'Watch'}</button>
            <button class="btn sm ghost" onclick="toast('Agenda packet (demo)')">Agenda</button></div></div>
      </div>`).join('')}
    </div>
  </div></div>`;
window.wbrPlay = (yt, title) => {
  const box = $('#media_player'); if (!box) return;
  box.style.display = 'block';
  box.innerHTML = `<h3 style="margin-bottom:10px">${title}</h3>
    <div style="position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden">
      <iframe style="position:absolute;inset:0;width:100%;height:100%;border:0" src="https://www.youtube.com/embed/${yt}" title="${title}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>
    </div>`;
  window.scrollTo({ top: 0, behavior:'smooth' });
};

/* ----- department pages ----- */
const DEPTS = {
  fire:  { ic:'🚒', name:'Fire Department', tag:'Protecting West Baton Rouge, station by station.',
    facts:[['Stations','4 parish stations'],['Non-emergency','(225) 383-4755'],['Burn permits','Apply online']],
    body:'Request a burn permit, find your nearest station, schedule a smoke-detector check, or review fire-safety resources for your home or business.' },
  parks: { ic:'🌳', name:'Parks & Recreation', tag:'Play, gather, and grow across the parish.',
    facts:[['Parks','7 parks & pavilions'],['Splash pad','Open daily 10–7'],['Reservations','Book online']],
    body:'Reserve a pavilion, sign up for youth programs, check field availability, or see what’s happening at Cohn Park and beyond this season.' },
};
views.dept = (slug) => {
  const d = DEPTS[slug] || DEPTS.fire;
  return `
  <div class="page"><div class="wrap">
    <div class="crumbs" style="color:var(--ink-soft);margin-bottom:14px"><a href="#/">Home</a> / Departments / ${d.name}</div>
    <div class="dept-hero"><p class="eyebrow" style="color:var(--gold-soft)">West Baton Rouge Parish</p>
      <h1 style="font-size:clamp(2rem,4vw,3rem)">${d.ic} ${d.name}</h1>
      <p style="color:#cfe3ef;max-width:52ch;margin-top:8px">${d.tag}</p></div>
    <div class="grid-2">
      <div class="panel"><h3 style="margin-bottom:10px">About</h3><p class="muted">${d.body}</p>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn gold" href="#/report">Report an Issue</a>
          <a class="btn ghost" href="#/services">Related services</a></div></div>
      <div class="info-grid" style="grid-template-columns:1fr">
        ${d.facts.map(f=>`<div class="stat-card"><span>${f[0]}</span><b style="font-size:1.15rem;margin-top:4px">${f[1]}</b></div>`).join('')}
      </div>
    </div>
  </div></div>`;
};

/* ----- council comparison ----- */
views.council = () => `
  <div class="pagehead"><div class="wrap"><div class="crumbs"><a href="#/">Home</a> / For Council</div>
    <h1>The same services — for a fraction of the cost.</h1>
    <p>West Baton Rouge currently pays an out-of-state vendor (CivicPlus / SeeClickFix, Kansas) for the pieces you're clicking through right now. Here's the comparison.</p></div></div>
  <div class="page"><div class="wrap">
    <div class="bignum">
      <div class="b b1"><b>$50k</b><span>paid today for website + 311 + comms + meeting video<br>(part of ~$84k/yr total to CivicPlus)</span></div>
      <div class="b b2"><b>$18–24k</b><span>ManiGinaM — same core services, local support, you own the data</span></div>
      <div class="b b3"><b>~$28k</b><span>estimated savings every year, and it grows as their 5% uplifts stack</span></div>
    </div>
    <p class="eyebrow" style="margin-bottom:10px">Feature parity</p>
    <table class="compare">
      <thead><tr><th>Capability</th><th>CivicPlus / SeeClickFix</th><th>ManiGinaM (this demo)</th></tr></thead>
      <tbody>
        ${[
          ['Parish website & department pages','✔ $30,845/yr','✔ included'],
          ['Citizen "report an issue" (311)','✔ $19,163/yr','✔ included · real database'],
          ['Mass text / email alerts','✔ (CivicSend)','✔ included'],
          ['Live & on-demand meeting video','✔ (CivicPlus Media)','✔ included'],
          ['Installable mobile app','✔ custom app fee','✔ PWA, no app-store fee'],
          ['You own & can export your data','✕ vendor-locked','✔ always yours'],
          ['Local, same-parish support','✕ Kansas call center','✔ Port Allen'],
          ['Annual 5% price escalator','✔ baked in','✕ none'],
        ].map(r=>`<tr><td><b>${r[0]}</b></td>
          <td>${r[1].replace('✔','<span class=yes>✔</span>').replace('✕','<span class=no>✕</span>')}</td>
          <td>${r[2].replace('✔','<span class=yes>✔</span>').replace('✕','<span class=no>✕</span>')}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="panel" style="margin-top:26px">
      <p class="eyebrow">How this gets done, legally</p>
      <h3 style="margin:6px 0 8px">A competitive RFP under La. R.S. 38:2234</h3>
      <p class="muted" style="max-width:70ch">Louisiana lets the parish procure data-processing services by RFP, awarded to the proposal that's "most advantageous" — price <em>and</em> value, not lowest bid. The parish opens a fair process; ManiGinaM competes and wins on cost, local presence, and data ownership. Nothing here asks the council to skip competition — it asks the council to <b>run</b> it.</p>
    </div>
    <div style="text-align:center;margin-top:26px">
      <p class="muted">Built and hosted locally in Port Allen by <b>ManiGinaM</b>.</p>
      <a class="btn gold" style="margin-top:12px" href="#/report">Try the citizen flow →</a>
      <a class="btn ghost" style="margin-top:12px" href="#/login">See the staff dashboard →</a>
    </div>
  </div></div>`;

/* ---------------- maps ---------------- */
function initPickMap() {
  const node = $('#pickmap'); if (!node || !window.L) return;
  const map = L.map('pickmap', { scrollWheelZoom:false }).setView(draft.ll, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(map);
  const mk = L.marker(draft.ll, { draggable:true }).addTo(map);
  mk.on('dragend', () => { const p = mk.getLatLng(); draft.ll = [p.lat, p.lng]; });
  setTimeout(() => map.invalidateSize(), 120);
}

/* ---------------- router ---------------- */
async function router() {
  const hash = location.hash || '#/';
  const [ , path, arg ] = hash.replace(/^#/, '').split('/');
  const view = $('#view'); if (!view) return;
  let html;
  switch (path) {
    case '': case undefined: html = views.home(); break;
    case 'services': html = views.services(); break;
    case 'report': html = views.report(); break;
    case 'track': html = views.track(); break;
    case 'login': html = views.login(); break;
    case 'staff': html = views.staff(); break;
    case 'comms': html = views.comms(); break;
    case 'media': html = views.media(); break;
    case 'council': html = views.council(); break;
    case 'dept': html = views.dept(arg); break;
    default: html = views.home();
  }
  view.innerHTML = html || '';
  window.scrollTo(0, 0);
  document.querySelector('.nav')?.classList.remove('open');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/'+(path||'')));
  const us = $('#util-staff'); if (us) us.textContent = ME.authed ? (ME.user?.name?.split(' ')[0] || 'Dashboard') : 'Staff Login';

  // post-render wiring
  if (path === 'report') renderWizard();
  if (path === 'track') mountTrack();
  if (path === 'staff') mountStaff();
  if (path === 'comms') mountComms();
  if (path === 'login') { const g = $('#lg_go'); if (g) g.onclick = doLogin; }
  if (path === '' || path === undefined) hydrateHome();
}
async function hydrateHome() {
  const sc = await apiGet('stats').catch(()=>({}));
  const t = $('#hs-total'), d = $('#hs-done');
  if (t) t.textContent = sc.total ?? '—';
  if (d) d.textContent = sc.done ?? '—';
}

/* ---------------- boot ---------------- */
async function boot() {
  document.body.insertAdjacentHTML('afterbegin', chrome());
  await refreshMe();
  window.addEventListener('hashchange', router);
  await router();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}
document.addEventListener('DOMContentLoaded', boot);
