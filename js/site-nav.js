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
        :host { --charcoal: #1e1e2e; --lilac: #c4a0ff; --coral: #ff8a8a; --mani: #8a8b98;
                display: block; }
        nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
          height: 64px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 2rem; background: rgba(30,30,46,0.92);
          -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-family: 'Space Grotesk','Inter',-apple-system,sans-serif;
        }
        .logo { display: flex; align-items: center; text-decoration: none;
                font-size: 1.4rem; font-weight: 700; letter-spacing: 0.01em; }
        .logo .mani { color: var(--mani); }
        .logo .gina { color: var(--lilac); }
        .logo .m    { color: var(--coral); }
        ul { display: flex; gap: 1.75rem; list-style: none; margin: 0; padding: 0; }
        a.link { color: rgba(255,255,255,0.72); text-decoration: none;
                 font-size: 0.9rem; font-weight: 500; font-family: 'Inter',-apple-system,sans-serif;
                 transition: color 0.2s; }
        a.link:hover { color: var(--lilac); }
        a.link.active { color: var(--coral); }
        @media (max-width: 768px) {
          nav { padding: 0 1rem; height: 60px; }
          ul { gap: 1rem; }
          a.link { font-size: 0.8rem; }
          .logo { font-size: 1.2rem; }
        }
        @media (max-width: 480px) { ul { gap: 0.7rem; } a.link { font-size: 0.72rem; } }
      </style>
      <nav>
        <a class="logo" href="/" aria-label="ManiGinaM"><span class="mani">MANI</span><span class="gina">GINA</span><span class="m">M</span></a>
        <ul>
          ${links.map(l => `<li><a class="link${l.key === active ? ' active' : ''}" href="${l.href}">${l.label}</a></li>`).join('')}
        </ul>
      </nav>`;
  }
}
customElements.define('site-nav', SiteNav);
