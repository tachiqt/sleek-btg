import { escapeHtml } from './utils.js';

function ensureToastHost() {
  let host = document.getElementById('admin-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'admin-toast-host';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message, { type = 'success' } = {}) {
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  window.setTimeout(() => {
    el.classList.remove('is-in');
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 280);
  }, 2800);
}

function lockGroup(btn, locked) {
  const group = btn?.closest(
    '.row-actions, .overview-list-actions, form, .service-actions, .slot-day-times li, .form-actions, .panel-head'
  );
  const targets = group
    ? [...group.querySelectorAll('button, a.btn, input[type="submit"]')]
    : btn
      ? [btn]
      : [];
  targets.forEach((el) => {
    if (el === btn) return;
    el.disabled = locked;
    if (locked) el.setAttribute('data-group-locked', '1');
    else if (el.getAttribute('data-group-locked') === '1') {
      el.removeAttribute('data-group-locked');
    }
  });
}

export function setBusy(btn, busy, loadingLabel = 'Working…') {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.busyLabel == null) {
      btn.dataset.busyLabel = btn.textContent.trim();
    }
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escapeHtml(loadingLabel)}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.removeAttribute('aria-busy');
    if (btn.dataset.busyLabel != null) {
      btn.textContent = btn.dataset.busyLabel;
      delete btn.dataset.busyLabel;
    }
  }
}

/**
 * Run a write action with loading UI + success/error toast.
 * Prevents double-clicks on the same control and sibling actions in the row.
 */
export async function runAction(btn, action, { loading = 'Saving…', success = 'Saved successfully' } = {}) {
  if (!btn || btn.disabled || btn.classList.contains('is-busy')) return undefined;
  lockGroup(btn, true);
  setBusy(btn, true, loading);
  try {
    const result = await action();
    if (success) showToast(success, { type: 'success' });
    if (btn.isConnected) {
      lockGroup(btn, false);
      setBusy(btn, false);
    }
    return result;
  } catch (err) {
    showToast(err?.message || 'Something went wrong', { type: 'error' });
    if (btn.isConnected) {
      lockGroup(btn, false);
      setBusy(btn, false);
    }
    throw err;
  }
}
