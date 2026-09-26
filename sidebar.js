(() => {
  const shell = document.querySelector('#app-shell');
  const sidebar = document.querySelector('#main-sidebar');
  const main = document.querySelector('.main-content');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const shade = document.querySelector('.sidebar-shade');
  const mobile = window.matchMedia('(max-width: 760px)');
  const preferenceKey = 'chao.sidebar.collapsed';
  let collapsed = false;
  let drawerOpen = false;
  let mainWasInert = false;
  try { collapsed = localStorage.getItem(preferenceKey) === 'true'; } catch { /* Private browsing can disable storage. */ }

  const iconPaths = {
    inicio: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    pedidos: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6"/>',
    clientes: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    menu: '<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 3c-5 3-5 8-5 10h5m0-10v18"/>',
    estadisticas: '<path d="M4 3v18h17M8 16v-4m5 4V8m5 8V4"/>',
    settings: '<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'
  };
  sidebar.querySelectorAll('.nav-item').forEach(button => {
    const label = button.querySelector('span')?.textContent.trim() || '';
    button.setAttribute('aria-label', label);
    button.title = label;
    const placeholder = button.querySelector('i[data-lucide]');
    if (placeholder) placeholder.outerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[button.dataset.view] || iconPaths.settings}</svg>`;
  });

  function renderSidebar() {
    shell.classList.toggle('sidebar-collapsed', collapsed);
    shell.classList.toggle('sidebar-open', drawerOpen);
    document.body.classList.toggle('navigation-open', drawerOpen);
    sidebar.inert = mobile.matches && !drawerOpen;
    sidebar.setAttribute('aria-hidden', String(mobile.matches && !drawerOpen));
    shade.hidden = !drawerOpen;
    const expanded = mobile.matches ? drawerOpen : !collapsed;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', mobile.matches ? 'Abrir menú de navegación' : expanded ? 'Plegar barra lateral' : 'Desplegar barra lateral');
    toggle.title = toggle.getAttribute('aria-label');
  }

  function closeDrawer(restoreFocus = true) {
    if (!drawerOpen) return;
    drawerOpen = false;
    main.inert = mainWasInert;
    renderSidebar();
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => {
    if (mobile.matches) {
      mainWasInert = main.inert;
      drawerOpen = true;
      main.inert = true;
      renderSidebar();
      sidebar.querySelector('[data-sidebar-close]').focus({ preventScroll: true });
    } else {
      collapsed = !collapsed;
      try { localStorage.setItem(preferenceKey, String(collapsed)); } catch { /* Keep the in-memory preference. */ }
      renderSidebar();
    }
  });
  sidebar.querySelector('[data-sidebar-close]').addEventListener('click', () => closeDrawer());
  shade.addEventListener('click', () => closeDrawer());
  sidebar.addEventListener('click', event => {
    if (event.target.closest('[data-view]')) closeDrawer();
  });
  document.addEventListener('keydown', event => {
    if (!drawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...sidebar.querySelectorAll('button, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobile.addEventListener('change', () => { closeDrawer(); renderSidebar(); });
  renderSidebar();
})();
