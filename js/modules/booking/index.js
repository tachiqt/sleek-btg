import { SERVICES, STUDIO_EMAIL, getService, getBundles, formatBundlePrice } from './services.js';
import {
  studioClock,
  futurePreference,
  formatDate,
  formatTime,
} from '../../utils/time.js';
import { isFirebaseConfigured } from '../../firebase/app.js';
import { createBooking } from '../../firebase/api.js';
import { loadSlotsForDate } from '../live-data.js';

/**
 * Multi-step appointment request dialog.
 * Submits to Firebase when configured; falls back to mailto otherwise.
 */
export function initBookingForm() {
  const dialog = document.getElementById('booking-dialog');
  const form = document.getElementById('appointment-form');
  if (!dialog || !form) return;

  const $ = (selector) => dialog.querySelector(selector);
  const $$ = (selector) => [...dialog.querySelectorAll(selector)];

  const fields = form.elements;
  const scrollArea = $('.booking-modal-scroll');
  const error = $('#booking-error');
  const slotsWrap = $('.booking-slots');
  const feedback = $('#booking-feedback');
  const actionStatus = $('#booking-action-status');
  const liveEnabled = isFirebaseConfigured();

  let step = 1;
  let returnFocus = null;
  let requestText = '';
  let selectedSlotId = null;
  let liveSlots = [];
  let submitted = false;
  let sending = false;

  const value = (name) => String(fields.namedItem(name)?.value || '').trim();
  const timeValue = () => (value('slot') === 'custom' ? value('customTime') : value('slot'));

  async function refreshLiveSlots() {
    if (!liveEnabled || !slotsWrap) return;
    const date = value('date');
    if (!date) return;

    liveSlots = (await loadSlotsForDate(date)) || [];
    const clock = studioClock();

    if (!liveSlots.length) {
      slotsWrap.innerHTML = `<p class="booking-help">No open studio slots for this date yet. Choose another day, or pick “Another time” and we’ll try to accommodate you.</p>
        <label><input name="slot" type="radio" value="custom"/><span>Another time</span></label>`;
    } else {
      slotsWrap.innerHTML =
        liveSlots
          .map((slot) => {
            const past =
              date === clock.date &&
              Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3)) <= clock.minutes;
            return `<label><input name="slot" type="radio" value="${slot.time}" data-slot-id="${slot.id}" ${past ? 'disabled' : ''} ${selectedSlotId === slot.id ? 'checked' : ''}/><span>${formatTime(slot.time)}</span></label>`;
          })
          .join('') +
        `<label><input name="slot" type="radio" value="custom"/><span>Another time</span></label>`;
    }
  }

  function refreshTimes() {
    const clock = studioClock();
    const date = value('date');
    fields.date.min = clock.date;

    $$('input[name="slot"]').forEach((input) => {
      const past =
        input.value !== 'custom' &&
        date === clock.date &&
        Number(input.value.slice(0, 2)) * 60 + Number(input.value.slice(3)) <= clock.minutes;
      input.disabled = past;
      if (past && input.checked) input.checked = false;
    });

    const custom = value('slot') === 'custom';
    $('.custom-time').hidden = !custom;
    fields.customTime.required = custom;

    const checked = $$('input[name="slot"]').find((i) => i.checked);
    selectedSlotId = checked?.dataset.slotId || null;

    if (date === clock.date) {
      const next = clock.minutes + 1;
      fields.customTime.min =
        next < 1440
          ? `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
          : '23:59';
    } else {
      fields.customTime.removeAttribute('min');
    }
  }

  function syncSummary() {
    const service = getService(value('service'));
    fields.shape.disabled = value('service') === 'removal';
    fields.namedItem('length').disabled = value('service') === 'removal';
    syncBundleAvailability();

    $('#summary-service').textContent = service?.label || 'A fresh set starts here.';
    $('#summary-date').textContent = value('date') ? formatDate(value('date')) : 'Choose a date';
    $('#summary-time').textContent = timeValue() ? `${formatTime(timeValue())} PHT` : 'Choose a time';
    $('#summary-duration').textContent = service?.duration || 'Based on your service';
    const bundle = selectedBundle();
    const base = service ? `₱${Number(service.price).toLocaleString('en-PH')}` : '—';
    $('#summary-price').textContent = bundle
      ? `${base} + ${formatBundlePrice(bundle)}`
      : base;
  }

  function selectedBundle() {
    const key = value('bundle');
    if (!key) return null;
    return getBundles().find((b) => b.key === key) || null;
  }

  function syncBundleAvailability() {
    const panel = $('#booking-bundles');
    if (!panel) return;
    const removal = value('service') === 'removal';
    panel.hidden = removal;
    if (removal) {
      const none = form.querySelector('input[name="bundle"][value=""]');
      if (none) none.checked = true;
      panel.open = false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderBundleOptions() {
    const wrap = $('#booking-bundle-options');
    if (!wrap) return;
    const current = value('bundle');
    const bundles = getBundles();
    wrap.innerHTML =
      `<label class="booking-bundle"><input name="bundle" type="radio" value="" ${!current ? 'checked' : ''}/><span class="bundle-choice"><span><strong>No bundle</strong><small>Solid color / basic set only</small></span><span>None</span></span></label>` +
      bundles
        .map(
          (b) => `<label class="booking-bundle${b.featured ? ' is-featured' : ''}"><input name="bundle" type="radio" value="${escapeHtml(b.key)}" ${current === b.key ? 'checked' : ''}/><span class="bundle-choice"><span><strong>${escapeHtml(b.label)}</strong><small>${escapeHtml(b.description)}</small></span><span>${escapeHtml(formatBundlePrice(b))}</span></span></label>`
        )
        .join('');
  }

  function report(message, field) {
    error.textContent = message;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else {
      error.focus();
    }
    return false;
  }

  function validateVisit() {
    refreshTimes();
    if (!getService(value('service'))) {
      return report('Please choose the service you’d like to book.', fields.service[0]);
    }
    if (!value('date') || !fields.date.checkValidity()) {
      return report('Please choose today or a future date.', fields.date);
    }
    if (!value('slot')) {
      return report('Please choose a preferred start time.', [...fields.slot].find((input) => !input.disabled));
    }
    if (
      value('slot') === 'custom' &&
      (!fields.customTime.checkValidity() || !value('customTime'))
    ) {
      return report('Please enter a future start time.', fields.customTime);
    }
    if (!futurePreference(value('date'), timeValue())) {
      return report('That preferred time has passed. Please choose a later date or time.', fields.date);
    }
    return true;
  }

  function validateDetails() {
    if (value('clientName').length < 2) {
      return report('Please enter your full name.', fields.clientName);
    }
    if (!/^[+\d\s()-]+$/.test(value('phone')) || value('phone').replace(/\D/g, '').length < 7) {
      return report(
        'Please enter a mobile number the studio can use to contact you.',
        fields.phone
      );
    }
    if (value('email') && !fields.email.checkValidity()) {
      return report('Please check your email address.', fields.email);
    }
    if (value('inspiration')) {
      try {
        const url = new URL(value('inspiration'));
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      } catch {
        return report(
          'Please enter a full inspiration link beginning with https:// or http://.',
          fields.inspiration
        );
      }
    }
    return true;
  }

  function prepareRequest() {
    const service = getService(value('service'));
    const bundle = selectedBundle();
    const rows = [
      ['Name', value('clientName')],
      ['Mobile', value('phone')],
      ['Email', value('email') || 'Not provided'],
      ['Service', service.label],
      ['Preferred date', formatDate(value('date'))],
      ['Preferred time', `${formatTime(timeValue())} — Philippine time (GMT+8)`],
      ['Duration', service.duration],
      ['Starting price', `₱${service.price} — final quote to be confirmed`],
      ['Existing set', value('currentNails')],
    ];

    if (bundle) {
      rows.push(['Design bundle', `${bundle.label} (${formatBundlePrice(bundle)})`]);
    }

    if (value('service') !== 'removal') {
      rows.push(['Shape', value('shape')], ['Length', value('length')]);
    }
    if (value('inspiration')) rows.push(['Inspiration', value('inspiration')]);
    if (value('notes')) rows.push(['Notes', value('notes')]);

    const list = $('#booking-review-list');
    list.replaceChildren();
    rows.forEach(([label, text]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = text;
      row.append(dt, dd);
      list.append(row);
    });

    requestText =
      'Hello Sleek.btg,\n\nI would like to request an appointment:\n\n' +
      rows.map(([label, text]) => `${label}: ${text}`).join('\n') +
      '\n\nPlease confirm availability, the final price, and the exact studio address. I understand this is a request and the appointment is not confirmed yet.\n\nThank you!';

    const sendBtn = $('.booking-send');
    if (liveEnabled) {
      sendBtn.removeAttribute('href');
      labelSendButton('Send request');
      const note = $('.booking-request-note');
      if (note) {
        note.innerHTML =
          '<strong>Ready to send to the studio.</strong><p>Your request goes straight to the Sleek.btg inbox. You’ll get a personal confirmation once the studio accepts the slot.</p>';
      }
    } else {
      labelSendButton('Open email draft');
    }

    $('#booking-copy-status').textContent = '';
    $('#booking-copy-status').classList.remove('is-success');
    if (actionStatus) {
      actionStatus.textContent = '';
      actionStatus.classList.remove('is-success');
    }
    $('.booking-manual-copy').hidden = true;
    submitted = false;
    hideFeedback();
  }

  function setStep(next, focus = true) {
    step = next;
    error.textContent = '';
    $$('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

    $$('[data-booking-step]').forEach((el) => {
      el.hidden = Number(el.dataset.bookingStep) !== step;
    });

    $$('[data-step-indicator]').forEach((el) => {
      if (Number(el.dataset.stepIndicator) === step) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
    });

    $('.booking-back').hidden = step === 1;
    $('.booking-next').hidden = step === 3;
    $('.booking-send').hidden = step !== 3;
    $('.booking-step-note').textContent = `Step ${step} of 3`;

    $('.booking-next').replaceChildren(
      document.createTextNode(step === 1 ? 'Your details ' : 'Review request ')
    );
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    $('.booking-next').append(arrow);

    if (step === 3) prepareRequest();
    scrollArea.scrollTop = 0;
    if (focus) $(`[data-booking-step="${step}"] h3`).focus({ preventScroll: true });
  }

  function openBooking({ trigger = document.activeElement, service, inspiration } = {}) {
    returnFocus = trigger;
    submitted = false;
    sending = false;
    hideFeedback();
    renderBundleOptions();
    if (service && getService(service)) {
      [...fields.service].forEach((input) => {
        input.checked = input.value === service;
      });
      setStep(1, false);
    }
    if (inspiration) fields.inspiration.value = inspiration;
    refreshTimes();
    syncSummary();
    if (!dialog.open) {
      dialog.showModal();
      document.body.classList.add('modal-open');
    }
    $(`[data-booking-step="${step}"] h3`).focus({ preventScroll: true });
  }

  function labelSendButton(text, { busy = false } = {}) {
    const sendBtn = $('.booking-send');
    if (!sendBtn) return;
    sendBtn.classList.toggle('is-busy', busy);
    sendBtn.disabled = busy;
    if (busy) {
      sendBtn.setAttribute('aria-busy', 'true');
      sendBtn.replaceChildren();
      const spinner = document.createElement('span');
      spinner.className = 'booking-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      sendBtn.append(spinner, document.createTextNode(` ${text}`));
      return;
    }
    sendBtn.removeAttribute('aria-busy');
    sendBtn.replaceChildren(document.createTextNode(`${text} `));
    const arrow = document.createElement('span');
    arrow.textContent = liveEnabled ? '→' : '↗';
    arrow.setAttribute('aria-hidden', 'true');
    sendBtn.append(arrow);
  }

  function setActionStatus(message, { success = false } = {}) {
    if (!actionStatus) return;
    actionStatus.textContent = message || '';
    actionStatus.classList.toggle('is-success', Boolean(success && message));
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.classList.remove('is-loading', 'is-success');
    const confirmBtn = feedback.querySelector('[data-feedback-confirm]');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('is-busy');
      confirmBtn.textContent = 'Yes, send it';
    }
  }

  function showFeedback({ eyebrow, title, copy, mode = 'confirm' }) {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.classList.toggle('is-loading', mode === 'loading');
    feedback.classList.toggle('is-success', mode === 'success');
    $('#booking-feedback-eyebrow').textContent = eyebrow;
    $('#booking-feedback-title').textContent = title;
    $('#booking-feedback-copy').textContent = copy;
    const confirmBtn = feedback.querySelector('[data-feedback-confirm]');
    if (mode === 'loading' && confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.classList.add('is-busy');
      confirmBtn.replaceChildren();
      const spinner = document.createElement('span');
      spinner.className = 'booking-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      confirmBtn.append(spinner, document.createTextNode(' Sending…'));
    } else if (confirmBtn && mode === 'confirm') {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('is-busy');
      confirmBtn.textContent = liveEnabled ? 'Yes, send it' : 'Open email draft';
    }
    if (mode === 'confirm') {
      feedback.querySelector('[data-feedback-confirm]')?.focus();
    }
  }

  function resetBookingForm() {
    form.reset();
    selectedSlotId = null;
    liveSlots = [];
    requestText = '';
    submitted = false;
    sending = false;
    error.textContent = '';
    $('#booking-copy-status').textContent = '';
    $('#booking-copy-status').classList.remove('is-success');
    setActionStatus('');
    $('.booking-manual-copy').hidden = true;
    $('.booking-manual-copy').value = '';
    $$('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const clock = studioClock();
    fields.date.min = clock.date;
    fields.date.value = '';
    if (slotsWrap && liveEnabled) {
      slotsWrap.innerHTML = `<p class="booking-help">Pick a date to see open studio times.</p>
        <label><input name="slot" type="radio" value="custom"/><span>Another time</span></label>`;
    }
    hideFeedback();
    refreshTimes();
    syncSummary();
    setStep(1, false);
    labelSendButton(liveEnabled ? 'Send request' : 'Open email draft');
  }

  function appointmentSummary() {
    const service = getService(value('service'));
    const bundle = selectedBundle();
    const dateLabel = value('date') ? formatDate(value('date')) : 'your preferred date';
    const timeLabel = timeValue() ? formatTime(timeValue()) : 'your preferred time';
    const bundleBit = bundle ? ` · ${bundle.label}` : '';
    return `${service?.label || 'Service'}${bundleBit} · ${dateLabel} · ${timeLabel} PHT`;
  }

  function openSendConfirmation() {
    showFeedback({
      eyebrow: 'Confirm request',
      title: 'Send your appointment request?',
      copy: `${appointmentSummary()}. The studio will confirm personally.`,
      mode: 'confirm',
    });
  }

  async function submitLiveBooking() {
    if (submitted || sending) return;
    sending = true;
    const service = getService(value('service'));
    const bundle = selectedBundle();

    showFeedback({
      eyebrow: 'Sending',
      title: 'Sending your request…',
      copy: 'Please wait while we deliver this to the studio.',
      mode: 'loading',
    });
    labelSendButton('Sending…', { busy: true });
    setActionStatus('Sending your request…');
    $('#booking-copy-status').textContent = 'Sending your request…';
    $('#booking-copy-status').classList.remove('is-success');

    try {
      await createBooking({
        clientName: value('clientName'),
        phone: value('phone'),
        email: value('email') || '',
        service: value('service'),
        serviceLabel: service.label,
        bundle: bundle?.key || '',
        bundleLabel: bundle?.label || '',
        bundlePrice: bundle ? Number(bundle.price) || 0 : 0,
        bundleQuoteOnly: bundle ? Boolean(bundle.quoteOnly || !(Number(bundle.price) > 0)) : false,
        date: value('date'),
        time: timeValue(),
        slotId: selectedSlotId,
        currentNails: value('currentNails'),
        shape: value('shape'),
        length: value('length'),
        inspiration: value('inspiration'),
        notes: value('notes'),
        quotedPrice: service.price,
        materialCost: 0,
        status: 'pending',
      });
      submitted = true;
      showFeedback({
        eyebrow: 'Sent',
        title: 'Request sent successfully',
        copy: 'The studio will confirm your appointment personally.',
        mode: 'success',
      });
      setActionStatus('Request sent successfully', { success: true });
      $('#booking-copy-status').textContent =
        'Request sent successfully. The studio will confirm your appointment personally.';
      $('#booking-copy-status').classList.add('is-success');
      labelSendButton('Sent');
      window.setTimeout(() => {
        resetBookingForm();
        dialog.close();
      }, 1800);
    } catch (err) {
      sending = false;
      hideFeedback();
      report(err.message || 'Could not send booking. Please try again or message the studio.');
      setActionStatus('');
      $('#booking-copy-status').textContent = '';
      labelSendButton('Send request');
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-booking],.portfolio-book');
    if (!trigger) return;
    event.preventDefault();
    openBooking({ trigger, service: trigger.dataset.bookingService });
  });

  window.addEventListener('booking:open', (event) => openBooking(event.detail || {}));

  $('.booking-close').addEventListener('click', () => {
    if (sending) return;
    dialog.close();
  });

  dialog.addEventListener('click', (event) => {
    if (sending || submitted) return;
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    ) {
      dialog.close();
    }
  });

  dialog.addEventListener('cancel', (event) => {
    if (sending) event.preventDefault();
  });

  dialog.addEventListener('close', () => {
    hideFeedback();
    sending = false;
    if (!document.querySelector('dialog[open]')) {
      document.body.classList.remove('modal-open');
    }
    if (returnFocus?.isConnected && !returnFocus.closest('dialog:not([open])')) {
      returnFocus.focus({ preventScroll: true });
    }
  });

  $('.booking-back').addEventListener('click', () => setStep(Math.max(1, step - 1)));

  form.addEventListener('change', async (event) => {
    error.textContent = '';
    if (event.target?.name === 'date' && liveEnabled) {
      await refreshLiveSlots();
    }
    refreshTimes();
    syncSummary();
    const removal = value('service') === 'removal';
    fields.shape.disabled = removal;
    fields.namedItem('length').disabled = removal;
  });

  form.addEventListener('input', (event) => {
    event.target.removeAttribute('aria-invalid');
    error.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (step === 1 && validateVisit()) setStep(2);
    else if (step === 2) {
      if (!futurePreference(value('date'), timeValue())) {
        setStep(1);
        report('Please choose a future appointment time.', fields.date);
        return;
      }
      if (validateDetails()) setStep(3);
    }
  });

  $('.booking-send').addEventListener('click', (event) => {
    event.preventDefault();
    if (sending || submitted || $('.booking-send').classList.contains('is-busy')) return;
    if (!futurePreference(value('date'), timeValue())) {
      setStep(1);
      report('Please choose a future appointment time.', fields.date);
      return;
    }
    openSendConfirmation();
  });

  feedback?.querySelector('[data-feedback-cancel]')?.addEventListener('click', () => {
    if (sending) return;
    hideFeedback();
  });

  feedback?.querySelector('[data-feedback-confirm]')?.addEventListener('click', async () => {
    if (sending || submitted) return;
    if (liveEnabled) {
      await submitLiveBooking();
      return;
    }
    const mailto =
      `mailto:${STUDIO_EMAIL}?subject=` +
      encodeURIComponent(`Appointment request — ${value('clientName')} — ${value('date')}`) +
      '&body=' +
      encodeURIComponent(requestText);
    hideFeedback();
    setActionStatus('Finish sending in your email app.');
    $('#booking-copy-status').textContent =
      'Finish sending in your email app. If no draft opens, copy your request and text the studio.';
    window.location.href = mailto;
  });

  $('.booking-copy-request').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(requestText);
      $('#booking-copy-status').textContent =
        'Copied. Paste this into an email or text to the studio. It has not been sent yet.';
    } catch {
      const area = $('.booking-manual-copy');
      area.value = requestText;
      area.hidden = false;
      area.focus();
      area.select();
      $('#booking-copy-status').textContent =
        'Select and copy the request below, then send it to the studio.';
    }
  });

  refreshTimes();
  renderBundleOptions();
  syncSummary();
  window.addEventListener('sleek:pricing-ready', () => {
    renderBundleOptions();
    syncSummary();
  });

  return { openBooking, setStep };
}
