import { MENU } from './menu-data.js';
import { addItem, formatUSD } from './cart.js';
import { renderChrome } from './site.js';

function groupByCategory(items){
  const map = new Map();
  for(const it of items){
    if(!map.has(it.category)) map.set(it.category, []);
    map.get(it.category).push(it);
  }
  return map;
}

function itemCard(it){
  const unit = it.unit ? ` <span class="unit">/ ${it.unit}</span>` : '';
  const desc = it.desc ? `<p class="card__desc">${it.desc}</p>` : '<p class="card__desc"></p>';
  return `
    <div class="card">
      <div class="card__top">
        <span class="card__name">${it.name}</span>
        <span class="card__price">${formatUSD(it.price)}${unit}</span>
      </div>
      ${desc}
      <button class="btn" data-id="${it.id}">Add to cart</button>
    </div>`;
}

export function renderMenu(){
  renderChrome('menu');
  const root = document.getElementById('menu-root');
  const groups = groupByCategory(MENU);
  root.innerHTML = [...groups.entries()].map(([cat, items]) => `
    <div class="cat">
      <h3>${cat}</h3>
      <div class="items">${items.map(itemCard).join('')}</div>
    </div>`).join('');

  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if(!btn) return;
    const it = MENU.find(m => m.id === btn.dataset.id);
    if(it){ addItem(it); btn.textContent = 'Added ✓';
      setTimeout(()=> btn.textContent = 'Add to cart', 900); }
  });
}
renderMenu();
