const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
}
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
