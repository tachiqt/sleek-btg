import { isFirebaseConfigured } from '../firebase/app.js';
import { getReviewInvite, submitClientReview } from '../firebase/api.js';

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function showError(message) {
  const lead = document.getElementById('review-lead');
  lead.textContent = message;
}

async function boot() {
  const token = tokenFromUrl();
  const lead = document.getElementById('review-lead');
  const modal = document.getElementById('review-modal');
  const form = document.getElementById('review-form');
  const errorEl = document.getElementById('review-error');

  if (!token) {
    showError('This review link is missing a code. Ask the studio to show the QR again.');
    return;
  }
  if (!isFirebaseConfigured()) {
    showError('Review form is not available right now.');
    return;
  }

  let invite;
  try {
    invite = await getReviewInvite(token);
  } catch (err) {
    console.error(err);
    showError('Could not open this review link. Please try again.');
    return;
  }

  if (!invite) {
    showError('This review link is invalid or expired.');
    return;
  }
  if (invite.status === 'used') {
    showError('Thank you — a review was already submitted for this visit.');
    return;
  }

  const serviceLabel = invite.serviceLabel || invite.service || 'Appointment';
  lead.textContent = 'Share a quick note about your visit.';
  document.getElementById('review-summary').textContent =
    `${invite.date || 'Your visit'} · ${serviceLabel}`;
  document.getElementById('review-name').value = invite.clientName || '';
  document.getElementById('review-service').value = serviceLabel;
  document.getElementById('review-price').value = peso(invite.quotedPrice);

  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const submitBtn = document.getElementById('review-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    try {
      await submitClientReview({
        token,
        quote: document.getElementById('review-quote').value,
        rating: document.getElementById('review-rating').value,
      });
      modal.close();
      lead.textContent = 'Thank you — your review was sent, and your visit is now counted in studio profit.';
    } catch (err) {
      errorEl.textContent = err.message || 'Could not submit review.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit review';
    }
  });
}

boot();
