import { renderChrome } from './site.js';

renderChrome('catering');

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showError(name, msg){
  const el = document.querySelector(`.field-error[data-for="${name}"]`);
  if(el) el.textContent = msg || '';
}

function validate(form){
  let ok = true;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const date = form.eventDate.value;
  const guests = form.guests.value.trim();
  ['name','email','phone','eventDate','guests'].forEach(f => showError(f, ''));
  if(!name){ showError('name', 'Name required'); ok = false; }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ showError('email', 'Valid email required'); ok = false; }
  if(!/^[0-9()+\-.\s]{7,}$/.test(phone) || (phone.match(/\d/g)||[]).length < 7){ showError('phone', 'Valid phone required'); ok = false; }
  if(!date){ showError('eventDate', 'Pick an event date'); ok = false; }
  if(!guests || Number(guests) < 1){ showError('guests', 'How many guests?'); ok = false; }
  return ok;
}

function confirmView(name, date, phone){
  document.getElementById('inquire-card').innerHTML =
    `<div class="inquire-ok">
       <h3>Thanks, ${esc(name)}!</h3>
       <p class="note">Your catering inquiry for <b>${esc(date)}</b> was received.
       We'll call you at ${esc(phone)} to plan the menu. For anything urgent, call
       <a href="tel:2252563897">225.256.3897</a>.</p>
       <a class="btn btn--gold" href="menu.html" style="margin-top:1rem">Browse the Menu</a>
     </div>`;
}

const form = document.getElementById('inquire-form');
form.addEventListener('submit', async e => {
  e.preventDefault();
  if(!validate(form)) return;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const date = form.eventDate.value;
  const payload = {
    name, email: form.email.value.trim(), phone, eventDate: date,
    guests: form.guests.value.trim(), eventType: form.eventType.value,
    details: form.details.value.trim(),
  };
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try{
    // Captured server-side when hosted (maniginam.dev Function -> KV -> admin).
    // Standalone/offline: falls through to the same confirmation.
    await fetch('/api/catering', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }catch(_){ /* offline / standalone demo — still confirm */ }
  confirmView(name, date, phone);
});
