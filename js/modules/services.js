import { $$, $ } from '../utils/dom.js';
import { prefersReducedMotion } from '../utils/motion.js';

/**
 * Services list motion: light staggered reveals + price count-up.
 * Also wires the collapsible design-bundles panel.
 */
export function initServices() {
  initBundlesPanel();

  const cards = $$('.service-card');
  if (!cards.length) return;

  cards.forEach((card, index) => {
    card.style.setProperty('--reveal-delay', `${Math.min(index * 80, 240)}ms`);
  });

  if (prefersReducedMotion()) {
    cards.forEach((card) => {
      card.classList.add('is-visible');
      finalizePrice(card);
    });
    return;
  }

  const animatePrice = (card) => {
    const valueEl = $('.service-price-value', card);
    if (!valueEl || valueEl.dataset.counted === 'true') return;

    const target = Number(valueEl.dataset.price);
    if (!Number.isFinite(target)) return;

    valueEl.dataset.counted = 'true';
    const duration = 700;
    const start = performance.now();
    const delay = Number.parseFloat(getComputedStyle(card).getPropertyValue('--reveal-delay')) || 0;

    const tick = (now) => {
      const elapsed = now - start - delay;
      if (elapsed < 0) {
        requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      valueEl.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
      else valueEl.textContent = String(target);
    };

    requestAnimationFrame(tick);
  };

  const watch = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'class' &&
        mutation.target.classList.contains('is-visible')
      ) {
        animatePrice(mutation.target);
      }
    });
  });

  cards.forEach((card) => {
    if (card.classList.contains('is-visible')) animatePrice(card);
    else watch.observe(card, { attributes: true, attributeFilter: ['class'] });
  });
}

function initBundlesPanel() {
  const panel = document.getElementById('bundles-panel');
  if (!panel) return;

  const label = panel.querySelector('[data-bundles-label]');
  const body = panel.querySelector('.bundles-panel-body');

  const sync = () => {
    if (label) label.textContent = panel.open ? 'Hide bundles' : 'View bundles';
    if (body) {
      if (panel.open) body.removeAttribute('inert');
      else body.setAttribute('inert', '');
    }
  };

  sync();
  panel.addEventListener('toggle', sync);
}

function finalizePrice(card) {
  const valueEl = $('.service-price-value', card);
  if (!valueEl) return;
  const target = Number(valueEl.dataset.price);
  if (Number.isFinite(target)) valueEl.textContent = String(target);
  valueEl.dataset.counted = 'true';
}
