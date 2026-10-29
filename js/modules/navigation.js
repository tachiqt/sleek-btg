import { $, $$ } from '../utils/dom.js';

/**
 * Mobile nav toggle, outside-click close, and Escape handling.
 */
export function initNavigation() {
  const header = $('header');
  const menu = $('.menu-toggle');
  const nav = $('nav');

  if (!header || !menu || !nav) return { closeMenu: () => {} };

  const closeMenu = () => {
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('open');
  };

  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav.classList.toggle('open', open);
  });

  $$('a', nav).forEach((a) => a.addEventListener('click', closeMenu));

  document.addEventListener('click', (e) => {
    if (!header.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      closeMenu();
      menu.focus();
    }
  });

  return { closeMenu, menu, nav, header };
}
