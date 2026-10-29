import { $, $$ } from '../utils/dom.js';
import { clamp } from '../utils/math.js';
import { prefersReducedMotion } from '../utils/motion.js';

/**
 * Progress bar, sticky header, floating book visibility,
 * active nav section, parallax images, and feature progress.
 */
export function initScrollEffects({ closeMenu, onPaint } = {}) {
  const header = $('header');
  const hero = $('.hero');
  const floating = $('.floating-book');
  const progress = $('.progress');
  const sections = $$('main section[id]');
  const navLinks = $$('nav a');
  const movingImages = $$('.hero-media, .about-image');
  const features = $('.feature-grid');
  const booking = $('.booking');

  if (!header || !hero || !floating || !progress || !booking) {
    return { requestPaint: () => {} };
  }

  let frame = 0;

  function paint() {
    frame = 0;
    const y = scrollY;
    const h = innerHeight;
    const max = document.documentElement.scrollHeight - h;

    progress.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
    header.classList.toggle('scrolled', y > 30);

    const visitRect = booking.getBoundingClientRect();
    const hideBooking = y < hero.offsetHeight * 0.75 || visitRect.top < h * 0.8;
    floating.classList.toggle('hidden', hideBooking);
    floating.inert = hideBooking;
    floating.setAttribute('aria-hidden', String(hideBooking));

    let current = '';
    sections.forEach((s) => {
      if (s.getBoundingClientRect().top < h * 0.4) current = s.id;
    });

    navLinks.forEach((a) => {
      const active = a.hash === `#${current}`;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });

    if (!prefersReducedMotion()) {
      movingImages.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < h) {
          const p = clamp((h - r.top) / (h + r.height));
          el.style.setProperty('--image-y', `${-9 + p * 8}%`);
        }
      });

      if (features) {
        const r = features.getBoundingClientRect();
        features.style.setProperty('--feature-progress', clamp((h * 0.7 - r.top) / r.height));
      }
    }

    onPaint?.();
  }

  const requestPaint = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  addEventListener('scroll', requestPaint, { passive: true });
  addEventListener(
    'resize',
    () => {
      if (innerWidth > 760) closeMenu?.();
      requestPaint();
    },
    { passive: true }
  );

  paint();
  addEventListener('load', requestPaint, { once: true });

  return { requestPaint, paint };
}
