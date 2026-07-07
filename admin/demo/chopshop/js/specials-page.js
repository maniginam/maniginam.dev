import { SPECIALS } from './menu-data.js';
import { addItem, formatUSD } from './cart.js';
import { renderChrome } from './site.js';

function card(s){
  const when = s.when ? `<p class="unit">${s.when}</p>` : '';
  return `
    <div class="card">
      <div class="card__top">
        <span class="card__name">${s.name}</span>
        <span class="card__price">${formatUSD(s.price)}</span>
      </div>
      ${when}
      <p class="card__desc">${s.desc}</p>
      <button class="btn" data-id="${s.id}">Add to cart</button>
    </div>`;
}

export function renderSpecials(){
  renderChrome('specials');
  const root = document.getElementById('specials-root');
  root.innerHTML = `<div class="items">${SPECIALS.map(card).join('')}</div>`;
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if(!btn) return;
    const s = SPECIALS.find(x => x.id === btn.dataset.id);
    if(s){ addItem(s); btn.textContent = 'Added ✓';
      setTimeout(()=> btn.textContent = 'Add to cart', 900); }
  });
}
renderSpecials();
