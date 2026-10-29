import { $$ } from '../utils/dom.js';
import { motion, prefersReducedMotion } from '../utils/motion.js';

/**
 * Scroll-reveal animations via IntersectionObserver.
 */
export function initReveal() {
  const revealElements = $$('.reveal');

  const enableMotion = () => {
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      revealElements.forEach((el) => el.classList.add('is-visible'));
      document.documentElement.classList.remove('motion');
      return;
    }

    document.documentElement.classList.add('motion');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );

    revealElements.forEach((el) => observer.observe(el));

    // Failsafe: never leave section content stuck invisible
    window.setTimeout(() => {
      revealElements.forEach((el) => {
        if (!el.classList.contains('is-visible')) {
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      });
    }, 2800);
  };

  enableMotion();

  motion.addEventListener('change', () => {
    document.documentElement.classList.toggle('motion', !prefersReducedMotion());
    if (prefersReducedMotion()) {
      revealElements.forEach((el) => el.classList.add('is-visible'));
    }
  });

  return { revealElements };
}
