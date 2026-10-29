/** Clamp a number to a range. */
export const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
