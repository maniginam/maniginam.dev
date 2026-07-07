import { refreshBadge } from './site.js';
const CART_KEY = 'chopshop_cart';

export function getCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch{ return []; }
}
function save(items){
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  refreshBadge();
}
export function addItem({id,name,price}){
  const items = getCart();
  const found = items.find(i => i.id === id);
  if(found){ found.qty += 1; }
  else{ items.push({id, name, price:Number(price), qty:1}); }
  save(items);
}
export function setQty(id, qty){
  let items = getCart();
  qty = Number(qty);
  if(qty <= 0){ items = items.filter(i => i.id !== id); }
  else{ const it = items.find(i => i.id === id); if(it) it.qty = qty; }
  save(items);
}
export function removeItem(id){ save(getCart().filter(i => i.id !== id)); }
export function clearCart(){ save([]); }
export function cartTotal(){ return getCart().reduce((s,i)=> s + i.price*i.qty, 0); }
export function formatUSD(n){ return '$' + Number(n).toFixed(2); }
