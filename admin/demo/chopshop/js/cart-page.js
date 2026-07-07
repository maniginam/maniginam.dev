import { getCart, setQty, removeItem, cartTotal, formatUSD } from './cart.js';
import { renderChrome } from './site.js';

function render(){
  const root = document.getElementById('cart-root');
  const items = getCart();
  if(items.length === 0){
    root.innerHTML = `<p class="empty">Your cart is empty. <a href="menu.html">Browse the menu →</a></p>`;
    return;
  }
  root.innerHTML = items.map(i => `
    <div class="linerow" data-id="${i.id}">
      <div><span class="linerow__name">${i.name}</span><br>
        <span class="unit">${formatUSD(i.price)} each</span></div>
      <div class="qty">
        <button data-act="dec">−</button>
        <span>${i.qty}</span>
        <button data-act="inc">+</button>
      </div>
      <div>${formatUSD(i.price * i.qty)}</div>
      <button class="remove" data-act="rm">Remove</button>
    </div>`).join('') + `
    <div class="summary">
      <div class="summary__row summary__total"><span>Total</span><span>${formatUSD(cartTotal())}</span></div>
      <a class="btn btn--gold" href="checkout.html" style="margin-top:.75rem;display:inline-block">Checkout</a>
    </div>`;
}

document.getElementById('cart-root').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const row = btn.closest('[data-id]');
  const id = row.dataset.id;
  const cur = getCart().find(i => i.id === id);
  if(!cur) return;
  const act = btn.dataset.act;
  if(act === 'inc') setQty(id, cur.qty + 1);
  else if(act === 'dec') setQty(id, cur.qty - 1);
  else if(act === 'rm') removeItem(id);
  render();
});

renderChrome('cart');
render();
