import { $ } from '../utils/dom.js';

/**
 * Portfolio lightbox — opens via `portfolio:open` CustomEvent.
 * @param {Array<{image: string, full?: string, alt: string, label: string}>} works
 */
export function initLightbox(works = []) {
  const dialog = $('.lightbox');
  if (!dialog || !works.length) return;

  const preview = $('img', dialog);
  let trigger;
  let photoIndex = 0;
  let bookingFromPhoto = false;

  function showPhoto(index) {
    photoIndex = (index + works.length) % works.length;
    const item = works[photoIndex];
    preview.src = item.full || item.image;
    preview.alt = item.alt;
    $('.lightbox-title').textContent = item.label;
    $('.lightbox-count').textContent = `${String(photoIndex + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`;
    $('.lightbox-prev').disabled = works.length < 2;
    $('.lightbox-next').disabled = works.length < 2;
  }

  window.addEventListener('portfolio:open', (event) => {
    trigger = event.detail.trigger;
    showPhoto(event.detail.index);
    dialog.showModal();
    document.body.classList.add('modal-open');
    $('.lightbox-close').focus();
  });

  $('.lightbox-close').addEventListener('click', () => dialog.close());
  $('.lightbox-prev').addEventListener('click', () => showPhoto(photoIndex - 1));
  $('.lightbox-next').addEventListener('click', () => showPhoto(photoIndex + 1));

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      showPhoto(photoIndex - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      showPhoto(photoIndex + 1);
    }
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        dialog.close();
      }
    }
  });

  $('.lightbox-book').addEventListener('click', (event) => {
    event.preventDefault();
    bookingFromPhoto = true;
    dialog.close();
    window.dispatchEvent(
      new CustomEvent('booking:open', {
        detail: {
          trigger: document.querySelector('.accordion-view'),
          inspiration: works[photoIndex].full || works[photoIndex].image,
        },
      })
    );
  });

  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) {
      document.body.classList.remove('modal-open');
    }
    if (!bookingFromPhoto) trigger?.focus({ preventScroll: true });
    bookingFromPhoto = false;
  });
}
