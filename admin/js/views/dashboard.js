import {
  listInventory,
  listServices,
  listBookings,
  listSlots,
  listPortfolio,
  listReviews,
  inventoryValue,
  serviceMargin,
  bookingProfitSummary,
  seedDefaultServices,
  updateBookingStatus,
} from '../../../js/firebase/api.js?v=20260921a';
import { peso, pct, escapeHtml, formatTime } from '../utils.js';
import { runAction } from '../feedback.js';

const DEFAULT_SERVICES = [
  { key: 'gel', label: 'Gel manicure', price: 400, materialCost: 120, duration: '1–2 hours' },
  { key: 'extensions', label: 'Soft gel extensions', price: 550, materialCost: 180, duration: '1½–3 hours' },
  { key: 'removal', label: 'Removal', price: 200, materialCost: 40, duration: 'Up to 1 hour' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthPrefix() {
  return todayISO().slice(0, 7);
}

function bookingStamp(b) {
  return `${b.date || ''}T${b.time || '00:00'}`;
}

function goto(view) {
  document.querySelector(`.nav-item[data-view="${view}"]`)?.click();
}

export async function renderDashboard(root) {
  root.innerHTML = `<p class="empty">Loading analytics…</p>`;
  await draw(root);
}

async function draw(root) {
  const settled = await Promise.allSettled([
    listInventory(),
    listServices(),
    listBookings(),
    listSlots(),
    listPortfolio(),
    listReviews(),
  ]);

  const valueOr = (result, fallback) =>
    result.status === 'fulfilled' ? result.value : fallback;
  const loadErrors = settled
    .map((result, index) => {
      if (result.status === 'fulfilled') return null;
      const names = ['inventory', 'services', 'bookings', 'slots', 'portfolio', 'reviews'];
      console.warn(`Overview ${names[index]} load failed`, result.reason);
      return `${names[index]}: ${result.reason?.message || 'failed'}`;
    })
    .filter(Boolean);

  const inventory = valueOr(settled[0], []);
  let services = valueOr(settled[1], []);
  const bookings = valueOr(settled[2], []);
  const slots = valueOr(settled[3], []);
  const portfolio = valueOr(settled[4], []);
  const reviews = valueOr(settled[5], []);

  if (!services.length) {
    try {
      services = await seedDefaultServices(DEFAULT_SERVICES);
    } catch (err) {
      console.warn('Could not seed services', err);
      services = DEFAULT_SERVICES.map((s, i) => ({ ...s, id: `local-${i}` }));
    }
  }

  const serviceMap = Object.fromEntries(services.map((s) => [s.key || s.id, s]));
  const today = todayISO();
  const month = monthPrefix();

  const pending = bookings
    .filter((b) => b.status === 'pending')
    .sort((a, b) => bookingStamp(a).localeCompare(bookingStamp(b)));

  const confirmedUpcoming = bookings
    .filter((b) => b.status === 'confirmed' && b.date >= today)
    .sort((a, b) => bookingStamp(a).localeCompare(bookingStamp(b)));

  const todayBookings = bookings.filter(
    (b) =>
      b.date === today &&
      (b.status === 'confirmed' || b.status === 'pending' || b.status === 'completed')
  );

  const monthReviews = reviews.filter(
    (r) =>
      r.countsTowardProfit !== false &&
      r.bookingId &&
      String(r.visitDate || '').startsWith(month)
  );
  const monthSummary = bookingProfitSummary([], services, monthReviews);
  const openSlots = slots.filter((s) => s.status === 'open' && s.date >= today);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndISO = weekEnd.toISOString().slice(0, 10);
  const openThisWeek = openSlots.filter((s) => s.date <= weekEndISO);

  const stockValue = inventoryValue(inventory);
  const lowStock = inventory.filter((i) => Number(i.quantity) <= Number(i.reorderLevel || 0));
  const hiddenReviews = reviews.filter((r) => r.published === false);
  const avgMargin =
    services.length > 0
      ? services.reduce((sum, s) => sum + serviceMargin(s).marginPct, 0) / services.length
      : 0;

  const alerts = [];
  if (pending.length) {
    alerts.push({
      tone: 'warn',
      text: `${pending.length} waiting for approval`,
      action: 'bookings',
    });
  }
  if (lowStock.length) {
    alerts.push({
      tone: 'danger',
      text: `${lowStock.length} low-stock item${lowStock.length === 1 ? '' : 's'}`,
      action: 'inventory',
    });
  }
  if (!portfolio.length) {
    alerts.push({ tone: 'muted', text: 'Portfolio is empty', action: 'portfolio' });
  }
  if (hiddenReviews.length) {
    alerts.push({
      tone: 'muted',
      text: `${hiddenReviews.length} unpublished review${hiddenReviews.length === 1 ? '' : 's'}`,
      action: 'reviews',
    });
  }

  root.innerHTML = `
    <div class="overview">
      ${
        loadErrors.length
          ? `<p class="form-error">Some live data did not load (${escapeHtml(loadErrors.join(' · '))}).</p>`
          : ''
      }

      <div class="overview-toolbar">
        ${
          alerts.length
            ? `<p class="overview-alerts">${alerts
                .map(
                  (a) =>
                    `<button type="button" class="overview-alert overview-alert-${a.tone}" data-goto="${a.action}">${escapeHtml(a.text)}</button>`
                )
                .join('<span aria-hidden="true"> · </span>')}</p>`
            : `<p class="overview-alerts is-clear">All clear — nothing urgent.</p>`
        }
        <div class="overview-tools">
          <button type="button" class="btn btn-sm" data-goto="bookings">Bookings</button>
          <button type="button" class="btn btn-ghost btn-sm" data-goto="slots">Slots</button>
          <button type="button" class="btn btn-ghost btn-sm" data-refresh>Refresh</button>
        </div>
      </div>

      <section class="overview-metrics" aria-label="Key figures">
        <div class="overview-metrics-group">
          <p class="overview-metrics-label">Operations</p>
          <dl>
            <div class="is-focus">
              <dt>Needs approval</dt>
              <dd>${pending.length}</dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd>${todayBookings.length}</dd>
            </div>
            <div>
              <dt>Upcoming</dt>
              <dd>${confirmedUpcoming.length}</dd>
            </div>
            <div>
              <dt>Open slots</dt>
              <dd>${openThisWeek.length}</dd>
            </div>
          </dl>
        </div>
        <div class="overview-metrics-group">
          <p class="overview-metrics-label">Money</p>
          <dl>
            <div>
              <dt>Month revenue</dt>
              <dd>${peso(monthSummary.revenue)}</dd>
            </div>
            <div>
              <dt>Month profit</dt>
              <dd class="${monthSummary.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${peso(monthSummary.profit)}</dd>
            </div>
            <div>
              <dt>Inventory</dt>
              <dd>${peso(stockValue)}</dd>
            </div>
            <div>
              <dt>Avg margin</dt>
              <dd>${pct(avgMargin)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div class="overview-body">
        <section class="overview-block">
          <div class="overview-block-head">
            <h2>Approve bookings</h2>
            <button type="button" class="text-link" data-goto="bookings">View all</button>
          </div>
          ${
            pending.length
              ? `<ul class="overview-list">
                  ${pending
                    .slice(0, 5)
                    .map((b) => {
                      const svc = serviceMap[b.service];
                      const price = b.quotedPrice ?? svc?.price ?? 0;
                      return `<li>
                        <div class="overview-list-main">
                          <strong>${escapeHtml(b.clientName)}</strong>
                          <span>${escapeHtml(b.date)} · ${formatTime(b.time)} · ${escapeHtml(svc?.label || b.serviceLabel || b.service)} · ${peso(price)}</span>
                          <span>${escapeHtml(b.phone || 'No phone')}${b.email ? ` · ${escapeHtml(b.email)}` : ''}</span>
                        </div>
                        <div class="overview-list-actions">
                          <button type="button" class="btn btn-sm" data-approve="${b.id}">Confirm</button>
                          <button type="button" class="btn btn-ghost btn-sm" data-decline="${b.id}">Decline</button>
                        </div>
                      </li>`;
                    })
                    .join('')}
                </ul>`
              : `<p class="overview-empty">No bookings waiting for approval.</p>`
          }
        </section>

        <section class="overview-block">
          <div class="overview-block-head">
            <h2>Upcoming</h2>
            <button type="button" class="text-link" data-goto="bookings">Schedule</button>
          </div>
          ${
            confirmedUpcoming.length
              ? `<ul class="overview-schedule">
                  ${confirmedUpcoming
                    .slice(0, 5)
                    .map((b) => {
                      const svc = serviceMap[b.service];
                      return `<li>
                        <div>
                          <strong>${escapeHtml(b.clientName)}</strong>
                          <span>${escapeHtml(svc?.label || b.serviceLabel || b.service)}</span>
                        </div>
                        <em>${escapeHtml(b.date)} · ${formatTime(b.time)}</em>
                      </li>`;
                    })
                    .join('')}
                </ul>`
              : `<p class="overview-empty">No confirmed visits scheduled.</p>`
          }
        </section>
      </div>

      <section class="overview-block">
        <div class="overview-block-head">
          <h2>Service margins</h2>
          <button type="button" class="text-link" data-goto="inventory">Edit</button>
        </div>
        <div class="table-wrap">
          <table class="overview-table">
            <thead><tr><th>Service</th><th>Price</th><th>Material</th><th>Profit</th><th>Margin</th></tr></thead>
            <tbody>
              ${services
                .map((s) => {
                  const m = serviceMargin(s);
                  return `<tr>
                    <td>${escapeHtml(s.label)}</td>
                    <td>${peso(m.price)}</td>
                    <td>${peso(m.cost)}</td>
                    <td class="${m.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${peso(m.profit)}</td>
                    <td>${pct(m.marginPct)}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => goto(btn.dataset.goto));
  });

  root.querySelector('[data-refresh]')?.addEventListener('click', async () => {
    root.innerHTML = `<p class="empty">Refreshing overview…</p>`;
    await draw(root);
  });

  root.querySelectorAll('[data-approve], [data-decline]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.approve || btn.dataset.decline;
      const status = btn.dataset.approve ? 'confirmed' : 'declined';
      const booking = bookings.find((b) => b.id === id);
      const svc = serviceMap[booking?.service];
      try {
        await runAction(
          btn,
          async () => {
            const extra =
              status === 'confirmed'
                ? {
                    quotedPrice: Number(booking?.quotedPrice ?? svc?.price) || 0,
                    materialCost: Number(booking?.materialCost ?? svc?.materialCost) || 0,
                  }
                : {};
            await updateBookingStatus(id, status, extra);
            await draw(root);
          },
          {
            loading: status === 'confirmed' ? 'Confirming…' : 'Declining…',
            success:
              status === 'confirmed'
                ? 'Booking confirmed successfully'
                : 'Booking declined successfully',
          }
        );
      } catch {
        /* toast already shown */
      }
    });
  });
}
