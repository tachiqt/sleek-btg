export const peso = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

export const pct = (n) => `${Number(n || 0).toFixed(0)}%`;

export function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
