import { isFirebaseConfigured } from '../firebase/app.js';
import { listPortfolio, listReviews, listOpenSlots, listServices, listBundles } from '../firebase/api.js';
import {
  DEFAULT_BUNDLES,
  SERVICES,
  setLivePricing,
  formatBundlePrice,
  formatServicePrice,
} from './booking/services.js';

const FALLBACK_REVIEWS = [
  {
    name: 'Returning client',
    role: 'Gel polish appointment',
    quote: 'The finish is so clean, and the whole appointment feels calm and personal.',
    rating: 5,
    avatar: 'R',
  },
  {
    name: 'Recent booking',
    role: 'Custom nail art',
    quote: 'Kai understood the inspo right away and made the set feel uniquely mine.',
    rating: 5,
    avatar: 'N',
  },
  {
    name: 'Soft-gel client',
    role: 'Extension appointment',
    quote: 'Lightweight, glossy, and exactly the shape I wanted. I’m already planning my next set.',
    rating: 5,
    avatar: 'S',
  },
];

/**
 * Hydrate public marketing site from Firebase when configured.
 * Falls back to static content if offline or unconfigured.
 */
export async function hydrateLiveContent() {
  applyPricingToDom(Object.values(SERVICES), DEFAULT_BUNDLES);
  setLivePricing({ services: Object.values(SERVICES), bundles: DEFAULT_BUNDLES });
  window.dispatchEvent(new CustomEvent('sleek:pricing-ready'));

  if (!isFirebaseConfigured()) {
    renderReviews(FALLBACK_REVIEWS);
    return { portfolio: null, reviews: FALLBACK_REVIEWS };
  }

  let portfolio = null;
  let reviews = null;

  try {
    portfolio = await listPortfolio();
    if (portfolio.length) {
      const mapped = portfolio.map((item, index) => {
        const label = String(item.label || '').trim().toUpperCase();
        return {
          id: index + 1,
          image: item.image,
          full: item.full || item.image,
          label,
          alt: String(item.alt || item.label || '').trim().toUpperCase() || label,
        };
      });
      const node = document.getElementById('portfolio-data');
      if (node) node.textContent = JSON.stringify(mapped);

      const fallback = document.querySelector('#accordion-root .accordion-fallback');
      if (fallback) {
        fallback.innerHTML = mapped
          .map(
            (item) =>
              `<figure><img alt="${escapeAttr(item.alt)}" loading="lazy" src="${escapeAttr(item.image)}"/><figcaption>${escapeText(item.label)}</figcaption></figure>`
          )
          .join('');
      }
    }
  } catch (err) {
    console.warn('Portfolio live load failed; using static fallback.', err);
  }

  try {
    reviews = await listReviews({ publishedOnly: true });
    renderReviews(reviews.length ? reviews : FALLBACK_REVIEWS);
  } catch (err) {
    console.warn('Reviews live load failed; using static fallback.', err);
    renderReviews(FALLBACK_REVIEWS);
    reviews = FALLBACK_REVIEWS;
  }

  try {
    const [services, bundles] = await Promise.all([listServices(), listBundles()]);
    const serviceRows = services.length ? services : Object.values(SERVICES);
    const bundleRows = bundles.length ? bundles : DEFAULT_BUNDLES;
    setLivePricing({ services: serviceRows, bundles: bundleRows });
    applyPricingToDom(serviceRows, bundleRows);
    window.dispatchEvent(new CustomEvent('sleek:pricing-ready'));
  } catch (err) {
    console.warn('Pricing live load failed; using defaults.', err);
  }

  return { portfolio, reviews };
}

function applyPricingToDom(services, bundles) {
  const byKey = Object.fromEntries((services || []).filter((s) => s.key).map((s) => [s.key, s]));

  document.querySelectorAll('[data-service-key]').forEach((card) => {
    const service = byKey[card.dataset.serviceKey];
    if (!service) return;
    const priceEl = card.querySelector('.service-price-value');
    if (priceEl) {
      const price = Number(service.price) || 0;
      priceEl.dataset.price = String(price);
      priceEl.textContent = String(price);
      priceEl.dataset.counted = 'true';
    }
    const durationEl = card.querySelector('[data-service-duration]');
    if (durationEl && service.duration) durationEl.textContent = service.duration;
  });

  document.querySelectorAll('[data-service-price]').forEach((el) => {
    const service = byKey[el.dataset.servicePrice];
    if (!service) return;
    el.textContent = formatServicePrice(service);
  });

  const list = document.getElementById('bundle-list');
  if (list && bundles?.length) {
    list.innerHTML = bundles
      .filter((b) => b.active !== false)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((b) => {
        const code =
          b.key === 'glam' ? '★' : String(b.key || '').toUpperCase().slice(0, 1) || '•';
        return `<article class="bundle-row${b.featured ? ' bundle-row-featured' : ''}" data-bundle-key="${escapeAttr(b.key)}">
          <span class="bundle-code" aria-hidden="true">${escapeText(code)}</span>
          <div class="bundle-copy">
            <h4>${escapeText(b.label)}</h4>
            <p>${escapeText(b.description || '')}</p>
          </div>
          <span class="bundle-price"><small>From</small><strong data-bundle-price>${escapeText(formatBundlePrice(b))}</strong></span>
        </article>`;
      })
      .join('');
  }
}

function renderReviews(reviews) {
  const section = document.getElementById('reviews');
  const stage = document.querySelector('.review-stage');
  const dotsWrap = document.querySelector('.dots');
  const nav = document.querySelector('.review-nav');
  const total = document.getElementById('review-total');
  const current = document.getElementById('review-current');
  if (!stage || !reviews.length) return;

  stage.removeAttribute('aria-busy');
  stage.setAttribute('aria-live', 'off');
  stage.innerHTML = reviews
    .map((r, index) => {
      const stars = '★'.repeat(Math.min(5, Number(r.rating) || 5));
      return `<article class="review-card${index === 0 ? ' active' : ''}" ${index === 0 ? '' : 'aria-hidden="true"'}>
        <div class="review-topline"><span class="review-label">Client note ${String(index + 1).padStart(2, '0')}</span><div aria-label="${r.rating || 5} stars" class="stars">${stars}</div></div>
        <blockquote>“${escapeText(r.quote)}”</blockquote>
        <div class="review-person"><span class="review-avatar">${escapeText(r.avatar || (r.name || 'C').charAt(0))}</span><div><strong>${escapeText(r.name)}</strong><span>${escapeText(r.role || 'Client')}</span></div></div>
      </article>`;
    })
    .join('');

  if (dotsWrap) {
    dotsWrap.innerHTML = reviews
      .map(
        (_, index) =>
          `<button aria-label="Show testimonial ${index + 1}" aria-pressed="${index === 0}" class="dot${index === 0 ? ' active' : ''}" type="button"></button>`
      )
      .join('');
  }
  if (total) total.textContent = String(reviews.length).padStart(2, '0');
  if (current) current.textContent = '01';
  if (nav) nav.hidden = false;
  section?.classList.remove('is-loading');
  section?.classList.add('is-ready');
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeText(value).replace(/'/g, '&#39;');
}

export async function loadSlotsForDate(date) {
  if (!isFirebaseConfigured() || !date) return null;
  try {
    return await listOpenSlots(date);
  } catch (err) {
    console.warn('Slot load failed.', err);
    return null;
  }
}

export function loadAccordionBundle() {
  return new Promise((resolve, reject) => {
    if (window.__sleekAccordionLoaded) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/vendor/accordion.bundle.js';
    script.onload = () => {
      window.__sleekAccordionLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
