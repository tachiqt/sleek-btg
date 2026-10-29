import { $ } from '../utils/dom.js';

/** Sets the copyright year in the footer. */
export function initFooter() {
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
}
