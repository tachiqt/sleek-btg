const CACHE = '20260921a';
const VIEW_KEY = 'sleek-admin-view';

import { initShell } from './shell.js';

const TITLES = {
  dashboard: { title: 'Overview', eyebrow: '' },
  inventory: { title: 'Inventory & profit', eyebrow: 'Cost vs return' },
  slots: { title: 'Appointment slots', eyebrow: 'Availability' },
  bookings: { title: 'Bookings', eyebrow: 'Inbox & confirmations' },
  portfolio: { title: 'Portfolio', eyebrow: 'Gallery images' },
  reviews: { title: 'Customer reviews', eyebrow: 'From QR after visits' },
};

const loaders = {
  dashboard: () => import(`./views/dashboard.js?v=${CACHE}`).then((m) => m.renderDashboard),
  inventory: () => import(`./views/inventory.js?v=${CACHE}`).then((m) => m.renderInventory),
  slots: () => import(`./views/slots.js?v=${CACHE}`).then((m) => m.renderSlots),
  bookings: () => import(`./views/bookings.js?v=${CACHE}`).then((m) => m.renderBookings),
  portfolio: () => import(`./views/portfolio.js?v=${CACHE}`).then((m) => m.renderPortfolio),
  reviews: () => import(`./views/reviews.js?v=${CACHE}`).then((m) => m.renderReviews),
};

function isValidView(name) {
  return Boolean(name && loaders[name]);
}

function readStoredView() {
  const fromHash = window.location.hash.replace(/^#/, '').trim();
  if (isValidView(fromHash)) return fromHash;
  try {
    const saved = sessionStorage.getItem(VIEW_KEY);
    if (isValidView(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'dashboard';
}

function persistView(name) {
  try {
    sessionStorage.setItem(VIEW_KEY, name);
  } catch {
    /* ignore */
  }
  const nextHash = `#${name}`;
  if (window.location.hash !== nextHash) {
    history.replaceState(null, '', nextHash);
  }
}

let current = readStoredView();
let started = false;

async function show(name, { syncHash = true } = {}) {
  if (!isValidView(name)) name = 'dashboard';
  current = name;
  if (syncHash) persistView(name);

  const meta = TITLES[name];
  const eyebrow = document.getElementById('view-eyebrow');
  const title = document.getElementById('view-title');
  title.textContent = meta.title;
  if (meta.eyebrow) {
    eyebrow.hidden = false;
    eyebrow.textContent = meta.eyebrow;
  } else {
    eyebrow.hidden = true;
    eyebrow.textContent = '';
  }
  document.body.dataset.view = name;
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === name);
  });
  const root = document.getElementById('view-root');
  // Leaving a view drops its timers (slots auto-refresh checks isConnected)
  root.innerHTML = `<p class="empty">Loading…</p>`;
  try {
    const render = await loaders[name]();
    await render(root);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="form-error">${err.message || 'Failed to load this view.'}</p>`;
  }
}

function startAdmin() {
  if (started) {
    show(current);
    return;
  }
  started = true;
  current = readStoredView();
  initShell();
  document.getElementById('admin-nav').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-view]');
    if (!btn) return;
    show(btn.dataset.view);
  });
  window.addEventListener('hashchange', () => {
    const next = readStoredView();
    if (next !== current) show(next, { syncHash: false });
  });
  show(current);
}

window.addEventListener('sleek:admin-ready', startAdmin);

if (window.__sleekAuth?.currentUser) {
  startAdmin();
}
