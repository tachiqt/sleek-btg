/**
 * Sleek.btg — application entry point.
 */
import { motion } from './utils/motion.js';
import { initNavigation } from './modules/navigation.js';
import { initReveal } from './modules/reveal.js';
import { initScrollEffects } from './modules/scroll-effects.js';
import { initLightbox } from './modules/lightbox.js';
import { initReviews } from './modules/reviews.js';
import { initServices } from './modules/services.js';
import { initFooter } from './modules/footer.js';
import { initBookingForm } from './modules/booking/index.js';
import { hydrateLiveContent, loadAccordionBundle } from './modules/live-data.js';
import { initRotatingText } from './modules/rotating-text.js';

function loadPortfolio() {
  const node = document.getElementById('portfolio-data');
  if (!node) return [];
  try {
    return JSON.parse(node.textContent);
  } catch {
    console.warn('Could not parse portfolio data.');
    return [];
  }
}

async function boot() {
  await hydrateLiveContent();
  try {
    await loadAccordionBundle();
  } catch (err) {
    console.warn('Accordion gallery failed to load.', err);
  }

  const { closeMenu } = initNavigation();
  initServices();
  initReveal();
  initRotatingText();

  const { requestPaint } = initScrollEffects({ closeMenu });
  initReviews();

  motion.addEventListener('change', requestPaint);

  initLightbox(loadPortfolio());
  initBookingForm();
  initFooter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
