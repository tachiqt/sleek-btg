/**
 * Booking-time helpers use the studio's timezone (Asia/Manila),
 * regardless of the visitor's device clock.
 */

export function studioClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function futurePreference(date, time, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;

  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) return false;

  const clock = studioClock(now);
  const instant = new Date(`${date}T${time}:00+08:00`);

  return (
    !Number.isNaN(instant.valueOf()) &&
    studioClock(instant).date === date &&
    (date > clock.date || (date === clock.date && hour * 60 + minute > clock.minutes))
  );
}

export function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00+08:00`));
}

export function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
