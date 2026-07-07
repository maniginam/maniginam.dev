const CART_KEY = 'chopshop_cart';

function readCount(){
  try{
    const items = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    return items.reduce((n,i)=> n + (Number(i.qty)||0), 0);
  }catch{ return 0; }
}

export function refreshBadge(){
  const badge = document.querySelector('.cart-badge');
  if(!badge) return;
  const n = readCount();
  badge.textContent = n;
  badge.hidden = n === 0;
}

export function renderChrome(active){
  const nav = document.getElementById('site-nav');
  if(nav){
    nav.className = 'nav';
    nav.innerHTML = `
      <div class="nav__inner">
        <a class="nav__brand" href="index.html">The <b>Chop</b> Shop</a>
        <div class="nav__links">
          <a href="menu.html">Menu</a>
          <a href="specials.html">Specials</a>
          <a href="index.html#contact">Contact</a>
          <a class="cart-link" href="cart.html">Cart
            <span class="cart-badge" hidden>0</span>
          </a>
        </div>
      </div>`;
  }
  const footer = document.getElementById('site-footer');
  if(footer){
    footer.className = 'footer';
    footer.innerHTML = `
      <div class="footer__inner">
        <div>
          <h4>The Chop Shop</h4>
          <p>Defining delicious. Meat market, catering & deer processing.</p>
        </div>
        <div>
          <h4>Visit</h4>
          <p>2012 Forest Drive<br>Port Allen, LA 70767</p>
        </div>
        <div>
          <h4>Contact</h4>
          <p><a href="tel:2252563897">225.256.3897</a><br>
             <a href="mailto:Oneleggedpig@gmail.com">Oneleggedpig@gmail.com</a></p>
        </div>
      </div>`;
  }
  refreshBadge();
  window.addEventListener('storage', refreshBadge);
  window.addEventListener('focus', refreshBadge);
}
