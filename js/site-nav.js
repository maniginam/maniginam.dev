// Shared site navigation — single source of truth for the header across all pages.
// Usage: <site-nav active="blog"></site-nav>  +  <script src="/js/site-nav.js" defer></script>
// Brand colors are hardcoded here so the nav renders identically on every page,
// independent of whatever CSS variables a given page defines.
class SiteNav extends HTMLElement {
  connectedCallback() {
    const active = (this.getAttribute('active') || '').toLowerCase();
    const links = [
      { label: 'Services', href: '/#services', key: 'services' },
      { label: 'Why Me',   href: '/#why',      key: 'why' },
      { label: 'About',    href: '/#about',    key: 'about' },
      { label: 'Blog',     href: '/blog',      key: 'blog' },
      { label: 'Resume',   href: '/resume',    key: 'resume' },
      { label: 'Contact',  href: '/#contact',  key: 'contact' },
    ];
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { --charcoal: #1e1e2e; --lilac: #c4a0ff; --coral: #ff8a8a;
                display: block; }
        nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
          height: 64px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 2rem; background: rgba(30,30,46,0.92);
          -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-family: 'Space Grotesk','Inter',-apple-system,sans-serif;
        }
        .logo { display: flex; align-items: center; text-decoration: none; }
        .logo img { height: 30px; width: auto; display: block; }
        ul { display: flex; gap: 1.75rem; list-style: none; margin: 0; padding: 0; }
        a.link { color: rgba(255,255,255,0.72); text-decoration: none;
                 font-size: 0.9rem; font-weight: 500; font-family: 'Inter',-apple-system,sans-serif;
                 transition: color 0.2s; display: flex; align-items: center; }
        a.link:hover { color: var(--lilac); }
        a.link.active { color: var(--coral); }
        .menu-toggle {
          display: none; background: none; border: 0; cursor: pointer;
          width: 44px; height: 44px; padding: 10px; color: #fff;
        }
        .menu-toggle svg { width: 100%; height: 100%; display: block; }
        @media (max-width: 768px) {
          nav { padding: 0 1rem; height: 60px; }
          .logo img { height: 26px; }
        }
        /* Collapse to hamburger where six links crowd the bar */
        @media (max-width: 640px) {
          .menu-toggle { display: block; }
          ul {
            position: absolute; top: 100%; right: 0; left: 0;
            flex-direction: column; gap: 0; align-items: stretch;
            background: rgba(30,30,46,0.98);
            -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
            border-bottom: 1px solid rgba(255,255,255,0.08);
            max-height: 0; overflow: hidden;
            transition: max-height 0.25s ease;
          }
          nav.open ul { max-height: 24rem; }
          li { border-top: 1px solid rgba(255,255,255,0.06); }
          a.link { padding: 0 1.25rem; min-height: 48px; font-size: 1rem; }
        }
      </style>
      <nav>
        <a class="logo" href="/" aria-label="ManiGinaM"><img src="/img/wordmark-nav.svg" alt="ManiGinaM" width="588" height="130"></a>
        <button class="menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <ul>
          ${links.map(l => `<li><a class="link${l.key === active ? ' active' : ''}" href="${l.href}">${l.label}</a></li>`).join('')}
        </ul>
      </nav>`;
    const nav = root.querySelector('nav');
    const toggle = root.querySelector('.menu-toggle');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    root.querySelectorAll('a.link').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }
}
customElements.define('site-nav', SiteNav);
