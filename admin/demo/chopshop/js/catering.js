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

const form = document.getElementById('inquire-form');
form.addEventListener('submit', e => {
  e.preventDefault();
  if(!validate(form)) return;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const date = form.eventDate.value;
  // TODO: wire to backend/email — POST inquiry to a catering endpoint or send email.
  // Demo: confirm receipt (no message actually sent yet).
  document.getElementById('inquire-card').innerHTML =
    `<div class="inquire-ok">
       <h3>Thanks, ${esc(name)}!</h3>
       <p class="note">Your catering inquiry for <b>${esc(date)}</b> was received (demo — nothing sent yet).
       We'll call you at ${esc(phone)} to plan the menu. For anything urgent, call
       <a href="tel:2252563897">225.256.3897</a>.</p>
       <a class="btn btn--gold" href="menu.html" style="margin-top:1rem">Browse the Menu</a>
     </div>`;
});
