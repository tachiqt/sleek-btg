import {
  listSlots,
  createSlots,
  deleteSlot,
  updateSlotStatus,
} from '../../../js/firebase/api.js?v=20260921a';
import { escapeHtml, formatTime, formData } from '../utils.js';
import { runAction, setBusy, showToast } from '../feedback.js';

const DEFAULT_TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00'];
const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REFRESH_MS = 20000;

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selected: null,
  slots: [],
};

let refreshTimer = null;
let boundRoot = null;

function clearRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startRefresh(root) {
  clearRefresh();
  boundRoot = root;
  refreshTimer = setInterval(() => {
    if (!boundRoot?.isConnected) {
      clearRefresh();
      return;
    }
    // Skip while typing in the create form
    const active = document.activeElement;
    if (active && boundRoot.contains(active) && active.closest('#slot-form')) return;
    silentRefresh(boundRoot);
  }, REFRESH_MS);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDayLabel(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function datesInRange(startDate, endDate, weekdays = null) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const days = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const allow = weekdays == null ? null : new Set(weekdays.map(Number));
  while (cursor <= end) {
    const iso = toISODate(cursor);
    if (!allow || allow.has(cursor.getDay())) days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function slotsByDate(slots) {
  const map = new Map();
  for (const slot of slots) {
    if (!map.has(slot.date)) map.set(slot.date, []);
    map.get(slot.date).push(slot);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }
  return map;
}

function monthBounds(year, month) {
  const start = toISODate(new Date(year, month, 1));
  const end = toISODate(new Date(year, month + 1, 0));
  return { start, end };
}

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toISODate(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function selectedTimes(form) {
  const checked = [...form.querySelectorAll('input[name="times"]:checked')].map((i) => i.value);
  const data = formData(form);
  const extra = String(data.extra || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^\d{2}:\d{2}$/.test(t));
  return [...new Set([...checked, ...extra])].sort();
}

function selectedWeekdays(form) {
  return [...form.querySelectorAll('input[name="weekdays"]:checked')].map((i) => Number(i.value));
}

function updatePreview(form, previewEl) {
  if (!form || !previewEl) return;
  const data = formData(form);
  const start = data.startDate;
  const end = data.endDate || data.startDate;
  const weekdays = selectedWeekdays(form);
  const times = selectedTimes(form);
  const dates = datesInRange(start, end, weekdays.length ? weekdays : null);

  if (!start || !end) {
    previewEl.textContent = 'Choose a start and end date.';
    return;
  }
  if (start > end) {
    previewEl.textContent = 'End date must be on or after the start date.';
    return;
  }
  if (!weekdays.length) {
    previewEl.textContent = 'Select at least one weekday.';
    return;
  }
  if (!times.length) {
    previewEl.textContent = 'Select or enter at least one time.';
    return;
  }
  const total = dates.length * times.length;
  previewEl.textContent = `${dates.length} day${dates.length === 1 ? '' : 's'} × ${times.length} time${times.length === 1 ? '' : 's'} = up to ${total} open slot${total === 1 ? '' : 's'} (duplicates skipped).`;
}

function calendarHtml(byDate, today) {
  const cells = buildMonthCells(state.year, state.month);
  return `
    <div class="cal-toolbar">
      <button type="button" class="btn btn-ghost btn-sm" data-cal-nav="-1" aria-label="Previous month">←</button>
      <h3 class="cal-month">${escapeHtml(monthLabel(state.year, state.month))}</h3>
      <button type="button" class="btn btn-ghost btn-sm" data-cal-nav="1" aria-label="Next month">→</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cal-today>Today</button>
    </div>
    <div class="cal-grid" role="grid" aria-label="Slots calendar">
      ${DOW_LABELS.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells
        .map((iso) => {
          if (!iso) return `<div class="cal-cell is-empty" aria-hidden="true"></div>`;
          const daySlots = byDate.get(iso) || [];
          const open = daySlots.filter((s) => s.status === 'open').length;
          const booked = daySlots.filter((s) => s.status === 'booked' || s.status === 'held').length;
          const isToday = iso === today;
          const isSelected = iso === state.selected;
          const isPast = iso < today;
          return `<button type="button" class="cal-cell${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${isPast ? ' is-past' : ''}${daySlots.length ? ' has-slots' : ''}" data-select-day="${iso}" ${isPast && !daySlots.length ? 'disabled' : ''}>
            <span class="cal-date">${Number(iso.slice(8))}</span>
            ${
              daySlots.length
                ? `<span class="cal-dots" aria-label="${open} open, ${booked} booked">
                    ${open ? `<i class="dot open"></i><em>${open}</em>` : ''}
                    ${booked ? `<i class="dot booked"></i><em>${booked}</em>` : ''}
                  </span>`
                : `<span class="cal-dots is-blank"></span>`
            }
          </button>`;
        })
        .join('')}
    </div>
    <p class="cal-legend"><span><i class="dot open"></i> Open</span><span><i class="dot booked"></i> Booked / held</span><span class="cal-refresh-note">Auto-refreshes every ${REFRESH_MS / 1000}s</span></p>
  `;
}

function dayPanelHtml(byDate, today) {
  const iso = state.selected;
  if (!iso) {
    return `<div class="slot-day-panel"><p class="empty">Select a day on the calendar.</p></div>`;
  }
  const daySlots = byDate.get(iso) || [];
  const openIds = daySlots.filter((s) => s.status === 'open').map((s) => s.id);
  return `
    <div class="slot-day-panel">
      <div class="slot-day-head">
        <div>
          <strong>${escapeHtml(formatDayLabel(iso))}</strong>
          <span>${daySlots.length} slot${daySlots.length === 1 ? '' : 's'}${iso === today ? ' · today' : ''}</span>
        </div>
        ${
          openIds.length
            ? `<button type="button" class="btn btn-ghost btn-sm" data-del-day="${escapeHtml(iso)}">Clear open</button>`
            : ''
        }
      </div>
      ${
        daySlots.length
          ? `<ul class="slot-day-times">
              ${daySlots
                .map(
                  (s) => `<li>
                    <span>${formatTime(s.time)}</span>
                    <span class="badge ${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
                    <span class="row-actions">
                      ${
                        s.status !== 'open'
                          ? `<button type="button" class="btn btn-ghost btn-sm" data-reopen="${s.id}">Reopen</button>`
                          : ''
                      }
                      <button type="button" class="btn btn-danger btn-sm" data-del-slot="${s.id}">Delete</button>
                    </span>
                  </li>`
                )
                .join('')}
            </ul>`
          : `<p class="empty">${iso < today ? 'No slots on this past day.' : 'No slots yet — create a range that includes this day.'}</p>`
      }
    </div>
  `;
}

async function loadMonthSlots() {
  const { start, end } = monthBounds(state.year, state.month);
  state.slots = await listSlots({ fromDate: start, toDate: end });
}

function patchCalendar(root) {
  const byDate = slotsByDate(state.slots);
  const today = todayISO();
  const cal = root.querySelector('#slot-calendar');
  const day = root.querySelector('#slot-day-detail');
  if (cal) cal.innerHTML = calendarHtml(byDate, today);
  if (day) day.innerHTML = dayPanelHtml(byDate, today);
  bindCalendar(root);
  bindDayActions(root);
}

async function silentRefresh(root) {
  try {
    await loadMonthSlots();
    patchCalendar(root);
  } catch (err) {
    console.warn('Slots auto-refresh failed', err);
  }
}

function bindCalendar(root) {
  root.querySelectorAll('[data-cal-nav]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const delta = Number(btn.dataset.calNav);
      const d = new Date(state.year, state.month + delta, 1);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      await loadMonthSlots();
      patchCalendar(root);
    });
  });
  root.querySelector('[data-cal-today]')?.addEventListener('click', async () => {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
    state.selected = todayISO();
    await loadMonthSlots();
    patchCalendar(root);
  });
  root.querySelectorAll('[data-select-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selected = btn.dataset.selectDay;
      patchCalendar(root);
    });
  });
}

function bindDayActions(root) {
  const byDate = () => slotsByDate(state.slots);

  root.querySelectorAll('[data-del-slot]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this slot?')) return;
      try {
        await runAction(
          btn,
          async () => {
            await deleteSlot(btn.dataset.delSlot);
            await loadMonthSlots();
            patchCalendar(root);
          },
          { loading: 'Deleting…', success: 'Slot deleted successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-del-day]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const date = btn.dataset.delDay;
      const openIds = (byDate().get(date) || []).filter((s) => s.status === 'open').map((s) => s.id);
      if (!openIds.length) {
        showToast('No open slots on this day.', { type: 'error' });
        return;
      }
      if (!confirm(`Delete ${openIds.length} open slot${openIds.length === 1 ? '' : 's'} on ${formatDayLabel(date)}?`)) {
        return;
      }
      try {
        await runAction(
          btn,
          async () => {
            for (const id of openIds) await deleteSlot(id);
            await loadMonthSlots();
            patchCalendar(root);
          },
          { loading: 'Clearing…', success: 'Open slots cleared successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-reopen]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await runAction(
          btn,
          async () => {
            await updateSlotStatus(btn.dataset.reopen, 'open', null);
            await loadMonthSlots();
            patchCalendar(root);
          },
          { loading: 'Reopening…', success: 'Slot reopened successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });
}

export async function renderSlots(root) {
  clearRefresh();
  root.innerHTML = `<p class="empty">Loading slots…</p>`;
  if (!state.selected) state.selected = todayISO();
  const now = new Date();
  if (state.year == null) {
    state.year = now.getFullYear();
    state.month = now.getMonth();
  }
  await draw(root);
  startRefresh(root);
}

async function draw(root) {
  const today = todayISO();
  const defaultEnd = addDaysISO(today, 13);
  await loadMonthSlots();
  const byDate = slotsByDate(state.slots);

  root.innerHTML = `
    <div class="slots-layout">
      <section class="panel slots-create">
        <div class="panel-head">
          <div>
            <h2>Create slots</h2>
            <p>Publish open times across a date range</p>
          </div>
        </div>
        <form id="slot-form" class="slot-form">
          <div class="slot-form-row">
            <label class="slot-field">Start date<input name="startDate" type="date" required value="${today}" min="${today}"/></label>
            <label class="slot-field">End date<input name="endDate" type="date" required value="${defaultEnd}" min="${today}"/></label>
          </div>
          <fieldset class="slot-fieldset">
            <legend>Days of the week</legend>
            <div class="slot-chips">
              ${WEEKDAYS.map(
                (d) =>
                  `<label class="slot-chip"><input type="checkbox" name="weekdays" value="${d.value}" ${d.value === 0 ? '' : 'checked'}/><span>${d.label}</span></label>`
              ).join('')}
            </div>
          </fieldset>
          <fieldset class="slot-fieldset">
            <legend>Appointment times</legend>
            <div class="slot-chips">
              ${DEFAULT_TIMES.map(
                (t) =>
                  `<label class="slot-chip"><input type="checkbox" name="times" value="${t}" checked/><span>${formatTime(t)}</span></label>`
              ).join('')}
            </div>
            <label class="slot-field slot-field-extra">Extra times
              <span class="hint-inline">Comma-separated 24h, e.g. 10:30, 14:00</span>
              <input name="extra" placeholder="10:30, 16:00"/>
            </label>
          </fieldset>
          <p class="slot-preview" id="slot-preview" aria-live="polite"></p>
          <div class="form-actions">
            <button class="btn" type="submit">Create open slots</button>
          </div>
        </form>
      </section>

      <section class="panel slots-calendar-panel">
        <div class="panel-head">
          <div>
            <h2>Availability calendar</h2>
            <p>Tap a day to manage its times</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-manual-refresh>Refresh</button>
        </div>
        <div class="slots-calendar-layout">
          <div id="slot-calendar" class="slot-calendar">${calendarHtml(byDate, today)}</div>
          <div id="slot-day-detail">${dayPanelHtml(byDate, today)}</div>
        </div>
      </section>
    </div>
  `;

  const form = root.querySelector('#slot-form');
  const preview = root.querySelector('#slot-preview');
  const syncPreview = () => updatePreview(form, preview);
  syncPreview();
  form.addEventListener('input', syncPreview);
  form.addEventListener('change', syncPreview);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(form);
    const start = data.startDate;
    const end = data.endDate || data.startDate;
    const weekdays = selectedWeekdays(form);
    const times = selectedTimes(form);

    if (!start || !end || start > end) {
      alert('Choose a valid start and end date.');
      return;
    }
    if (!weekdays.length) {
      alert('Select at least one weekday.');
      return;
    }
    if (!times.length) {
      alert('Select or enter at least one time.');
      return;
    }

    const dates = datesInRange(start, end, weekdays);
    if (!dates.length) {
      alert('No matching days in that range.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    try {
      await runAction(
        btn,
        async () => {
          let createdCount = 0;
          for (const date of dates) {
            const created = await createSlots(date, times);
            createdCount += created.length;
          }
          const jump = new Date(`${start}T12:00:00`);
          state.year = jump.getFullYear();
          state.month = jump.getMonth();
          state.selected = start;
          await loadMonthSlots();
          patchCalendar(root);
          syncPreview();
          if (createdCount) {
            preview.textContent = `Created ${createdCount} new open slot${createdCount === 1 ? '' : 's'}. Calendar updated.`;
          } else {
            preview.textContent = 'No new slots — those date/time pairs already exist.';
          }
          return createdCount;
        },
        {
          loading: 'Creating…',
          success: 'Slots created successfully',
        }
      );
    } catch {
      /* toast already shown */
    }
  });

  root.querySelector('[data-manual-refresh]')?.addEventListener('click', async () => {
    const btn = root.querySelector('[data-manual-refresh]');
    if (!btn || btn.classList.contains('is-busy')) return;
    setBusy(btn, true, 'Refreshing…');
    try {
      await silentRefresh(root);
      showToast('Calendar refreshed successfully');
    } catch (err) {
      showToast(err?.message || 'Could not refresh', { type: 'error' });
    } finally {
      setBusy(btn, false);
    }
  });

  bindCalendar(root);
  bindDayActions(root);
}
