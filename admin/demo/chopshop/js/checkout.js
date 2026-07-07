import { getCart, cartTotal, formatUSD, clearCart } from './cart.js';
import { renderChrome } from './site.js';

renderChrome('checkout');

function renderSummary(){
  const box = document.getElementById('order-summary');
  const items = getCart();
  if(items.length === 0){
    box.innerHTML = `<p class="empty">Cart is empty. <a href="menu.html">Add items →</a></p>`;
    return false;
  }
  box.innerHTML = items.map(i =>
    `<div class="summary__row"><span>${i.qty}× ${i.name}</span><span>${formatUSD(i.price*i.qty)}</span></div>`
  ).join('') +
    `<div class="summary__row summary__total"><span>Total</span><span>${formatUSD(cartTotal())}</span></div>`;
  return true;
}

function toggleAddress(){
  const mode = document.querySelector('input[name="fulfillment"]:checked').value;
  document.getElementById('address-field').style.display = mode === 'delivery' ? 'block' : 'none';
}

function showError(name, msg){
  const el = document.querySelector(`.field-error[data-for="${name}"]`);
  if(el) el.textContent = msg || '';
}

function validate(form){
  let ok = true;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const mode = form.fulfillment.value;
  showError('name', ''); showError('phone', ''); showError('email', ''); showError('address', '');
  if(!name){ showError('name', 'Name required'); ok = false; }
  if(!/^[0-9()+\-.\s]{7,}$/.test(phone)){ showError('phone', 'Valid phone required'); ok = false; }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ showError('email', 'Valid email required'); ok = false; }
  if(mode === 'delivery' && !form.address.value.trim()){ showError('address', 'Delivery address required'); ok = false; }
  return ok;
}

const hasItems = renderSummary();
const form = document.getElementById('checkout-form');
document.querySelectorAll('input[name="fulfillment"]').forEach(r => r.addEventListener('change', toggleAddress));
toggleAddress();
if(!hasItems){ form.querySelector('button[type="submit"]').disabled = true; }

form.addEventListener('submit', e => {
  e.preventDefault();
  if(!validate(form)) return;
  // TODO: wire Stripe Checkout — create a PaymentIntent / Checkout Session here,
  // then redirect to Stripe. Payment fields intentionally omitted for now.
  clearCart();
  document.querySelector('.container').innerHTML =
    `<h2>Thanks, ${form.name.value.trim()}!</h2>
     <p class="note">Your order request was received (demo — no payment taken yet).
     We'll call ${form.phone.value.trim()} to confirm. Stripe checkout coming soon.</p>
     <a class="btn" href="menu.html">Back to menu</a>`;
});
