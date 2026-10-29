/** Shared reduced-motion preference. */
export const motion = matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion() {
  return motion.matches;
}
