import {
  listBookings,
  updateBookingStatus,
  deleteBooking,
  completeBookingWithReviewInvite,
  listServices,
  reviewPageUrl,
} from '../../../js/firebase/api.js?v=20260921a';
import { escapeHtml, formatTime, peso } from '../utils.js';
import { runAction } from '../feedback.js';
import { paginate, paginationHtml, bindPager, readPage, writePage } from '../pagination.js';

const PAGE_SIZE = 10;

function qrImageUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(data)}`;
}

function showReviewQr(root, { clientName, serviceLabel, reviewUrl, token }) {
  const existing = root.querySelector('#review-qr-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('dialog');
  dialog.id = 'review-qr-dialog';
  dialog.className = 'qr-dialog';
  dialog.innerHTML = `
    <div class="qr-dialog-inner">
      <p class="eyebrow">Visit complete</p>
      <h2>Client review QR</h2>
      <p class="qr-copy">Ask <strong>${escapeHtml(clientName)}</strong> to scan this code for <strong>${escapeHtml(serviceLabel)}</strong>. Their review unlocks profit for this visit.</p>
      <img class="qr-image" alt="Review QR code" src="${qrImageUrl(reviewUrl)}"/>
      <p class="qr-link"><a href="${escapeHtml(reviewUrl)}" target="_blank" rel="noopener">Open review link ↗</a></p>
      <p class="qr-token">Code ${escapeHtml(token.slice(0, 8))}…</p>
      <div class="form-actions">
        <button type="button" class="btn" data-close-qr>Done</button>
      </div>
    </div>
  `;
  root.appendChild(dialog);
  dialog.showModal();
  dialog.querySelector('[data-close-qr]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
}

const STATUS_COPY = {
  confirmed: { loading: 'Confirming…', success: 'Booking confirmed successfully' },
  declined: { loading: 'Declining…', success: 'Booking declined successfully' },
  cancelled: { loading: 'Cancelling…', success: 'Booking cancelled successfully' },
};

export async function renderBookings(root) {
  root.innerHTML = `<p class="empty">Loading bookings…</p>`;
  writePage(root, 1);
  await draw(root);
}

async function draw(root) {
  const [bookings, services] = await Promise.all([listBookings(), listServices()]);
  const serviceMap = Object.fromEntries(services.map((s) => [s.key || s.id, s]));
  const page = paginate(bookings, readPage(root), PAGE_SIZE);
  writePage(root, page.current);

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Booking inbox</h2>
          <p>Confirm visits, then mark complete to show the client review QR · ${bookings.length} total</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="bookings-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Visit</th>
              <th>Service</th>
              <th>Status</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              page.slice.length
                ? page.slice
                    .map((b) => {
                      const svc = serviceMap[b.service];
                      const label = svc?.label || b.serviceLabel || b.service;
                      const price = b.quotedPrice ?? svc?.price ?? 0;
                      const bundleBit = b.bundleLabel
                        ? ` · ${escapeHtml(b.bundleLabel)}`
                        : '';
                      return `<tr>
                        <td>
                          <strong>${escapeHtml(b.clientName)}</strong>
                          <div class="booking-detail">
                            <span>${escapeHtml(b.phone)}</span>
                            ${b.email ? `<span>${escapeHtml(b.email)}</span>` : ''}
                          </div>
                        </td>
                        <td>
                          <strong>${escapeHtml(b.date)} · ${formatTime(b.time)}</strong>
                          <div class="booking-detail">${escapeHtml(b.currentNails || '')}</div>
                        </td>
                        <td>
                          <strong>${escapeHtml(label)}${bundleBit}</strong>
                          <div class="booking-detail">${peso(price)}${b.shape ? ` · ${escapeHtml(b.shape)}` : ''}</div>
                          ${b.notes ? `<div class="booking-detail">${escapeHtml(b.notes)}</div>` : ''}
                        </td>
                        <td><span class="badge ${escapeHtml(b.status)}">${escapeHtml(b.status)}</span></td>
                        <td class="col-actions">
                          <div class="row-actions">
                            ${
                              b.status === 'pending'
                                ? `<button type="button" class="btn btn-sm" data-status="confirmed" data-id="${b.id}">Confirm</button>
                                   <button type="button" class="btn btn-ghost btn-sm" data-status="declined" data-id="${b.id}">Decline</button>`
                                : ''
                            }
                            ${
                              b.status === 'confirmed'
                                ? `<button type="button" class="btn btn-sm" data-complete="${b.id}">Complete</button>
                                   <button type="button" class="btn btn-ghost btn-sm" data-status="cancelled" data-id="${b.id}">Cancel</button>`
                                : ''
                            }
                            ${
                              b.status === 'completed' && b.reviewToken
                                ? `<button type="button" class="btn btn-ghost btn-sm" data-show-qr="${b.id}">Review QR</button>`
                                : ''
                            }
                            <button type="button" class="btn btn-ghost btn-sm" data-del-booking="${b.id}">Delete</button>
                          </div>
                        </td>
                      </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="5" class="empty">No booking requests yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      ${paginationHtml(page, { noun: 'bookings' })}
    </section>
  `;

  bindPager(root, (next) => {
    writePage(root, next);
    draw(root);
  });

  async function pricingExtra(booking) {
    const svc = serviceMap[booking?.service];
    return {
      quotedPrice: Number(booking.quotedPrice ?? svc?.price) || 0,
      materialCost: Number(booking.materialCost ?? svc?.materialCost) || 0,
      serviceLabel: booking.serviceLabel || svc?.label || booking.service || '',
    };
  }

  root.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      const id = btn.dataset.id;
      const booking = bookings.find((b) => b.id === id);
      const copy = STATUS_COPY[status] || { loading: 'Updating…', success: 'Booking updated successfully' };
      try {
        await runAction(
          btn,
          async () => {
            const extra = status === 'confirmed' ? await pricingExtra(booking) : {};
            await updateBookingStatus(id, status, extra);
            await draw(root);
          },
          copy
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-complete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.complete;
      const booking = bookings.find((b) => b.id === id);
      const svc = serviceMap[booking?.service];
      try {
        await runAction(
          btn,
          async () => {
            const extra = await pricingExtra(booking);
            const result = await completeBookingWithReviewInvite(id, extra);
            await draw(root);
            showReviewQr(root, {
              clientName: booking.clientName,
              serviceLabel: extra.serviceLabel || svc?.label || booking.service,
              reviewUrl: result.reviewUrl || reviewPageUrl(result.reviewToken),
              token: result.reviewToken,
            });
          },
          { loading: 'Completing…', success: 'Booking completed successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-show-qr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const booking = bookings.find((b) => b.id === btn.dataset.showQr);
      if (!booking?.reviewToken) return;
      const svc = serviceMap[booking.service];
      showReviewQr(root, {
        clientName: booking.clientName,
        serviceLabel: booking.serviceLabel || svc?.label || booking.service,
        reviewUrl: reviewPageUrl(booking.reviewToken),
        token: booking.reviewToken,
      });
    });
  });

  root.querySelectorAll('[data-del-booking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Permanently delete this booking from the database?')) return;
      try {
        await runAction(
          btn,
          async () => {
            await deleteBooking(btn.dataset.delBooking);
            await draw(root);
          },
          { loading: 'Deleting…', success: 'Booking deleted successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });
}
