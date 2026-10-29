import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js';
import { getFirebase, ensureAdminAuth } from './app.js?v=20260921a';
import { isR2Configured, uploadPortfolioToR2, deletePortfolioFromR2, portfolioPublicUrl } from '../r2/client.js';

const COLLECTIONS = {
  inventory: 'inventory',
  services: 'services',
  bundles: 'bundles',
  slots: 'slots',
  bookings: 'bookings',
  portfolio: 'portfolio',
  reviews: 'reviews',
  reviewInvites: 'reviewInvites',
};

function db() {
  return getFirebase().db;
}

function storage() {
  return getFirebase().storage;
}

function mapDocs(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function requireAdmin() {
  await ensureAdminAuth();
}

async function writeDoc(collectionName, id, payload, { merge = true } = {}) {
  await requireAdmin();
  if (!id) throw new Error('Missing document id for update.');
  await setDoc(doc(db(), collectionName, id), payload, { merge });
  return id;
}

async function removeDoc(collectionName, id) {
  await requireAdmin();
  if (!id) throw new Error('Missing document id for delete.');
  await deleteDoc(doc(db(), collectionName, id));
}

/* ---------- Inventory (supplies) ---------- */
export async function listInventory() {
  const snap = await getDocs(collection(db(), COLLECTIONS.inventory));
  return mapDocs(snap).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function saveInventoryItem(item, id) {
  const payload = {
    name: String(item.name || '').trim(),
    category: String(item.category || 'General').trim() || 'General',
    quantity: Number(item.quantity) || 0,
    unit: String(item.unit || 'pcs').trim() || 'pcs',
    unitCost: Number(item.unitCost) || 0,
    reorderLevel: Number(item.reorderLevel) || 0,
    notes: String(item.notes || '').trim(),
    updatedAt: serverTimestamp(),
  };
  if (!payload.name) throw new Error('Item name is required.');

  if (id) {
    return writeDoc(COLLECTIONS.inventory, id, payload);
  }
  await requireAdmin();
  payload.createdAt = serverTimestamp();
  const refDoc = await addDoc(collection(db(), COLLECTIONS.inventory), payload);
  return refDoc.id;
}

export async function deleteInventoryItem(id) {
  await removeDoc(COLLECTIONS.inventory, id);
}

/* ---------- Services (price vs material cost) ---------- */
export async function listServices() {
  const snap = await getDocs(collection(db(), COLLECTIONS.services));
  return mapDocs(snap);
}

export async function saveService(service, id) {
  const payload = {
    key: service.key,
    label: service.label,
    price: Number(service.price) || 0,
    materialCost: Number(service.materialCost) || 0,
    duration: service.duration || '',
    active: service.active !== false,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    return writeDoc(COLLECTIONS.services, id, payload);
  }
  await requireAdmin();
  const refDoc = await addDoc(collection(db(), COLLECTIONS.services), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return refDoc.id;
}

export async function seedDefaultServices(defaults) {
  const existing = await listServices();
  if (existing.length) return existing;
  await requireAdmin();
  for (const s of defaults) {
    await saveService(s);
  }
  return listServices();
}

/* ---------- Design bundles (add-on pricing) ---------- */
export async function listBundles() {
  const snap = await getDocs(collection(db(), COLLECTIONS.bundles));
  return mapDocs(snap).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

export async function saveBundle(bundle, id) {
  const payload = {
    key: bundle.key,
    label: bundle.label,
    description: bundle.description || '',
    price: Number(bundle.price) || 0,
    quoteOnly: bundle.quoteOnly === true || bundle.quoteOnly === 'true' || bundle.quoteOnly === 'on',
    order: Number(bundle.order) || 0,
    featured: Boolean(bundle.featured),
    active: bundle.active !== false,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    return writeDoc(COLLECTIONS.bundles, id, payload);
  }
  await requireAdmin();
  const refDoc = await addDoc(collection(db(), COLLECTIONS.bundles), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return refDoc.id;
}

export async function seedDefaultBundles(defaults) {
  const existing = await listBundles();
  if (existing.length) return existing;
  await requireAdmin();
  for (const b of defaults) {
    await saveBundle(b);
  }
  return listBundles();
}

/* ---------- Slots ---------- */
export async function listSlots({ fromDate, toDate } = {}) {
  const snap = await getDocs(collection(db(), COLLECTIONS.slots));
  let rows = mapDocs(snap).sort((a, b) =>
    a.date === b.date ? String(a.time).localeCompare(String(b.time)) : String(a.date).localeCompare(String(b.date))
  );
  if (fromDate) rows = rows.filter((s) => s.date >= fromDate);
  if (toDate) rows = rows.filter((s) => s.date <= toDate);
  return rows;
}

export async function listOpenSlots(date) {
  const snap = await getDocs(
    query(
      collection(db(), COLLECTIONS.slots),
      where('date', '==', date),
      where('status', '==', 'open')
    )
  );
  return mapDocs(snap).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export async function createSlots(dateOrDates, times) {
  await requireAdmin();
  const dates = Array.isArray(dateOrDates) ? dateOrDates : [dateOrDates];
  const uniqueTimes = [...new Set((times || []).filter(Boolean))];
  const created = [];

  for (const date of dates) {
    if (!date) continue;
    for (const time of uniqueTimes) {
      const existing = await getDocs(
        query(
          collection(db(), COLLECTIONS.slots),
          where('date', '==', date),
          where('time', '==', time)
        )
      );
      if (!existing.empty) continue;
      const refDoc = await addDoc(collection(db(), COLLECTIONS.slots), {
        date,
        time,
        status: 'open',
        bookingId: null,
        createdAt: serverTimestamp(),
      });
      created.push(refDoc.id);
    }
  }
  return created;
}

/** Build YYYY-MM-DD dates from start→end, optionally filtered by weekday numbers (0=Sun … 6=Sat). */
export function datesInRange(startDate, endDate, weekdays = null) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const days = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const allow = weekdays == null ? null : new Set(weekdays.map(Number));

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = cursor.getDay();
    if (!allow || allow.has(dow)) days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Slot status patch — public booking may hold an open slot; admin may change freely (rules enforce). */
export async function updateSlotStatus(id, status, bookingId = null) {
  if (!id) throw new Error('Missing slot id.');
  await setDoc(
    doc(db(), COLLECTIONS.slots, id),
    {
      status,
      bookingId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteSlot(id) {
  await removeDoc(COLLECTIONS.slots, id);
}

/* ---------- Bookings ---------- */
export async function listBookings() {
  const snap = await getDocs(collection(db(), COLLECTIONS.bookings));
  return mapDocs(snap).sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });
}

export async function createBooking(data) {
  const payload = {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const refDoc = await addDoc(collection(db(), COLLECTIONS.bookings), payload);
  if (data.slotId) {
    await updateSlotStatus(data.slotId, 'held', refDoc.id);
  }
  return refDoc.id;
}

export async function updateBookingStatus(id, status, extra = {}) {
  await requireAdmin();
  if (!id) throw new Error('Missing booking id.');
  const bookingRef = doc(db(), COLLECTIONS.bookings, id);
  const snap = await getDoc(bookingRef);
  if (!snap.exists()) throw new Error('Booking not found');
  const booking = snap.data();

  await setDoc(
    bookingRef,
    {
      status,
      ...extra,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (booking.slotId) {
    if (status === 'confirmed' || status === 'completed') {
      await updateSlotStatus(booking.slotId, 'booked', id);
    } else if (status === 'cancelled' || status === 'declined') {
      await updateSlotStatus(booking.slotId, 'open', null);
    }
  }

  return { id, ...booking, status, ...extra };
}

/** Permanently remove a booking and free its slot if held/booked. */
export async function deleteBooking(id) {
  await requireAdmin();
  if (!id) throw new Error('Missing booking id.');
  const bookingRef = doc(db(), COLLECTIONS.bookings, id);
  const snap = await getDoc(bookingRef);
  if (!snap.exists()) throw new Error('Booking not found');
  const booking = snap.data();

  if (booking.slotId) {
    try {
      await updateSlotStatus(booking.slotId, 'open', null);
    } catch {
      /* slot may already be gone */
    }
  }

  await removeDoc(COLLECTIONS.bookings, id);
  return id;
}

function makeReviewToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (bytes) return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `rv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function reviewPageUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // From /admin/... go up to site root review page
  const base = origin || '';
  const path = `${base}/review.html?token=${encodeURIComponent(token)}`;
  // When served under a subpath locally, prefer relative to site root from admin
  if (typeof window !== 'undefined' && window.location.pathname.includes('/admin')) {
    const root = window.location.href.split('/admin')[0];
    return `${root}/review.html?token=${encodeURIComponent(token)}`;
  }
  return path;
}

/** Mark booking completed and create a scannable review invite. */
export async function completeBookingWithReviewInvite(id, extra = {}) {
  await requireAdmin();
  const booking = await updateBookingStatus(id, 'completed', extra);
  const token = booking.reviewToken || makeReviewToken();

  await setDoc(doc(db(), COLLECTIONS.reviewInvites, token), {
    bookingId: id,
    clientName: booking.clientName || '',
    phone: booking.phone || '',
    service: booking.service || '',
    serviceLabel: booking.serviceLabel || '',
    quotedPrice: Number(extra.quotedPrice ?? booking.quotedPrice) || 0,
    materialCost: Number(extra.materialCost ?? booking.materialCost) || 0,
    date: booking.date || '',
    time: booking.time || '',
    status: 'open',
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db(), COLLECTIONS.bookings, id),
    {
      reviewToken: token,
      hasReview: false,
      profitCounted: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { ...booking, reviewToken: token, reviewUrl: reviewPageUrl(token) };
}

export async function getReviewInvite(token) {
  if (!token) return null;
  const snap = await getDoc(doc(db(), COLLECTIONS.reviewInvites, token));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Public client review after scanning QR — also records profit fields on the review. */
export async function submitClientReview({ token, quote, rating }) {
  const invite = await getReviewInvite(token);
  if (!invite) throw new Error('This review link is invalid or expired.');
  if (invite.status === 'used') throw new Error('A review was already submitted for this visit.');

  const cleanQuote = String(quote || '').trim();
  if (cleanQuote.length < 5) throw new Error('Please write a short review (at least a few words).');

  const name = invite.clientName || 'Client';
  const payload = {
    name,
    role: invite.serviceLabel || invite.service || 'Client',
    quote: cleanQuote.slice(0, 800),
    rating: Math.min(5, Math.max(1, Number(rating) || 5)),
    avatar: String(name).charAt(0).toUpperCase(),
    published: true,
    order: Date.now(),
    bookingId: invite.bookingId,
    reviewToken: token,
    visitDate: invite.date || '',
    quotedPrice: Number(invite.quotedPrice) || 0,
    materialCost: Number(invite.materialCost) || 0,
    countsTowardProfit: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const reviewRef = await addDoc(collection(db(), COLLECTIONS.reviews), payload);

  await updateDoc(doc(db(), COLLECTIONS.reviewInvites, token), {
    status: 'used',
    usedAt: serverTimestamp(),
    reviewId: reviewRef.id,
  });

  return reviewRef.id;
}

/* ---------- Portfolio ---------- */
export async function listPortfolio() {
  const snap = await getDocs(collection(db(), COLLECTIONS.portfolio));
  return mapDocs(snap)
    .map((item) => {
      const image = portfolioPublicUrl(item.image || item.storagePath);
      const full = portfolioPublicUrl(item.full || item.image || item.storagePath);
      const label = String(item.label || '').trim().toUpperCase();
      const alt = String(item.alt || item.label || '').trim().toUpperCase() || label;
      return { ...item, image, full, label, alt };
    })
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

export async function savePortfolioItem({ file, label, alt, order }, id) {
  await requireAdmin();
  let image = null;
  let storagePath = null;
  let storageProvider = 'firebase';

  if (file) {
    if (isR2Configured()) {
      const uploaded = await uploadPortfolioToR2(file);
      image = uploaded.url;
      storagePath = uploaded.key;
      storageProvider = 'r2';
    } else {
      storagePath = `portfolio/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      const storageRef = ref(storage(), storagePath);
      await uploadBytes(storageRef, file);
      image = await getDownloadURL(storageRef);
      storageProvider = 'firebase';
    }
  }

  const payload = {
    label: String(label || 'Untitled set').trim().toUpperCase(),
    alt: String(alt || label || 'Nail set').trim().toUpperCase(),
    order: Number(order) || 0,
    updatedAt: serverTimestamp(),
  };
  if (image) {
    payload.image = portfolioPublicUrl(image);
    payload.full = portfolioPublicUrl(image);
    payload.storagePath = storagePath;
    payload.storageProvider = storageProvider;
  }

  if (id) {
    return writeDoc(COLLECTIONS.portfolio, id, payload);
  }
  if (!image) throw new Error('Image required for new portfolio item');
  payload.createdAt = serverTimestamp();
  const refDoc = await addDoc(collection(db(), COLLECTIONS.portfolio), payload);
  return refDoc.id;
}

export async function deletePortfolioItem(id, storagePath, storageProvider = 'firebase') {
  await removeDoc(COLLECTIONS.portfolio, id);
  if (!storagePath) return;

  if (storageProvider === 'r2' || String(storagePath).startsWith('portfolio/')) {
    try {
      if (isR2Configured()) await deletePortfolioFromR2(storagePath);
    } catch {
      /* ignore missing remote object */
    }
  }

  if (storageProvider === 'firebase') {
    try {
      await deleteObject(ref(storage(), storagePath));
    } catch {
      /* ignore missing file */
    }
  }
}

/* ---------- Reviews ---------- */
export async function listReviews({ publishedOnly = false } = {}) {
  const base = collection(db(), COLLECTIONS.reviews);
  const snap = publishedOnly
    ? await getDocs(query(base, where('published', '==', true)))
    : await getDocs(base);
  return mapDocs(snap).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

export async function saveReview(review, id) {
  const payload = {
    name: review.name,
    role: review.role || 'Client',
    quote: review.quote,
    rating: Number(review.rating) || 5,
    avatar: review.avatar || (review.name || 'C').charAt(0).toUpperCase(),
    published: review.published !== false,
    order: Number(review.order) || 0,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    return writeDoc(COLLECTIONS.reviews, id, payload);
  }
  await requireAdmin();
  payload.createdAt = serverTimestamp();
  const refDoc = await addDoc(collection(db(), COLLECTIONS.reviews), payload);
  return refDoc.id;
}

export async function deleteReview(id) {
  await removeDoc(COLLECTIONS.reviews, id);
}

/* ---------- Profit helpers ---------- */
export function inventoryValue(items) {
  return items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
}

export function serviceMargin(service) {
  const price = Number(service.price) || 0;
  const cost = Number(service.materialCost) || 0;
  return {
    price,
    cost,
    profit: price - cost,
    marginPct: price > 0 ? ((price - cost) / price) * 100 : 0,
  };
}

export function bookingProfitSummary(bookings, services, reviews = []) {
  const reviewed = (reviews || []).filter(
    (r) => r.countsTowardProfit !== false && r.bookingId && Number(r.quotedPrice) >= 0
  );

  if (reviewed.length) {
    let revenue = 0;
    let materialCost = 0;
    reviewed.forEach((r) => {
      revenue += Number(r.quotedPrice) || 0;
      materialCost += Number(r.materialCost) || 0;
    });
    return {
      count: reviewed.length,
      revenue,
      materialCost,
      profit: revenue - materialCost,
    };
  }

  // Fallback for older data without QR reviews
  const byKey = Object.fromEntries(services.map((s) => [s.key || s.id, s]));
  const completed = bookings.filter((b) => b.status === 'completed' && b.profitCounted === true);
  let revenue = 0;
  let materialCost = 0;
  completed.forEach((b) => {
    const svc = byKey[b.service];
    const price = Number(b.quotedPrice ?? svc?.price) || 0;
    const cost = Number(b.materialCost ?? svc?.materialCost) || 0;
    revenue += price;
    materialCost += cost;
  });
  return {
    count: completed.length,
    revenue,
    materialCost,
    profit: revenue - materialCost,
  };
}

export { Timestamp, COLLECTIONS };
