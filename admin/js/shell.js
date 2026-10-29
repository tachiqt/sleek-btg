const COLLAPSE_KEY = 'sleek-admin-sidebar-collapsed';

export function initShell() {
  const app = document.getElementById('app');
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const menuToggle = document.getElementById('menu-toggle');
  const collapseBtn = document.getElementById('sidebar-collapse');
  if (!app || !sidebar) return;

  try {
    if (sessionStorage.getItem(COLLAPSE_KEY) === '1') {
      app.classList.add('sidebar-collapsed');
    }
  } catch {
    /* ignore */
  }

  function syncCollapseLabel() {
    const collapsed = app.classList.contains('sidebar-collapsed');
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      collapseBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
  }

  function closeMobileNav() {
    app.classList.remove('nav-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('nav-lock');
  }

  function openMobileNav() {
    app.classList.add('nav-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('nav-lock');
  }

  collapseBtn?.addEventListener('click', () => {
    app.classList.toggle('sidebar-collapsed');
    const collapsed = app.classList.contains('sidebar-collapsed');
    try {
      sessionStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    syncCollapseLabel();
  });

  menuToggle?.addEventListener('click', () => {
    if (app.classList.contains('nav-open')) closeMobileNav();
    else openMobileNav();
  });

  backdrop?.addEventListener('click', closeMobileNav);

  document.getElementById('admin-nav')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-view]')) closeMobileNav();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeMobileNav();
  });

  syncCollapseLabel();
}
