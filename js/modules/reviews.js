import { $, $$ } from '../utils/dom.js';
import { motion, prefersReducedMotion } from '../utils/motion.js';

/**
 * Testimonials carousel with autoplay, pause, and keyboard-friendly controls.
 * @param {{ onTimerSync?: () => void }} options
 */
export function initReviews(options = {}) {
  const reviews = $('.reviews');
  const play = $('.review-play');
  const currentEl = $('#review-current');
  const totalEl = $('#review-total');

  function cards() {
    return $$('.review-card');
  }
  function dots() {
    return $$('.dot');
  }

  if (!cards().length || !reviews || !play) {
    return { syncTimer: () => {} };
  }

  let index = 0;
  let timer;
  let paused = false;
  let hovered = false;
  let focused = false;
  let inView = false;

  function syncTotal(count) {
    if (totalEl) totalEl.textContent = String(Math.max(count, 0)).padStart(2, '0');
  }

  function showReview(i) {
    const list = cards();
    const dotList = dots();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    list.forEach((c, n) => {
      c.classList.toggle('active', n === index);
      c.setAttribute('aria-hidden', String(n !== index));
    });
    dotList.forEach((d, n) => {
      d.classList.toggle('active', n === index);
      d.setAttribute('aria-pressed', String(n === index));
    });
    if (currentEl) currentEl.textContent = String(index + 1).padStart(2, '0');
    syncTotal(list.length);
  }

  function syncTimer() {
    clearInterval(timer);
    if (!prefersReducedMotion() && !paused && !hovered && !focused && inView && !document.hidden) {
      timer = setInterval(() => showReview(index + 1), 7000);
    }
    options.onTimerSync?.();
  }

  function bindDots() {
    dots().forEach((dot, i) => {
      if (dot.dataset.bound === '1') return;
      dot.dataset.bound = '1';
      dot.addEventListener('click', () => {
        showReview(i);
        syncTimer();
      });
    });
  }

  $('.review-next')?.addEventListener('click', () => {
    showReview(index + 1);
    syncTimer();
  });

  $('.review-prev')?.addEventListener('click', () => {
    showReview(index - 1);
    syncTimer();
  });

  play.addEventListener('click', () => {
    paused = !paused;
    play.textContent = paused ? '▶' : 'Ⅱ';
    play.setAttribute(
      'aria-label',
      paused ? 'Resume automatic testimonials' : 'Pause automatic testimonials'
    );
    syncTimer();
  });

  reviews.addEventListener('pointerenter', () => {
    hovered = true;
    syncTimer();
  });
  reviews.addEventListener('pointerleave', () => {
    hovered = false;
    syncTimer();
  });
  reviews.addEventListener('focusin', () => {
    focused = true;
    syncTimer();
  });
  reviews.addEventListener('focusout', (e) => {
    focused = reviews.contains(e.relatedTarget);
    syncTimer();
  });

  document.addEventListener('visibilitychange', syncTimer);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        syncTimer();
      },
      { threshold: 0.2 }
    ).observe(reviews);
  }

  motion.addEventListener('change', syncTimer);

  bindDots();
  showReview(0);

  return { syncTimer, showReview, refresh: () => { bindDots(); showReview(0); } };
}
