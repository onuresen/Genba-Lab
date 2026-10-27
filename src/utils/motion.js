// Motion preferences. With `prefers-reduced-motion: reduce`, moves become
// cuts: the end state is the same, only the travel is skipped.

export function prefersReducedMotion(win = typeof window === 'undefined' ? undefined : window) {
  return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

// Tween length to use: 0 (an instant set in GSAP) when motion is reduced.
export function motionDuration(seconds, reduced = prefersReducedMotion()) {
  return reduced ? 0 : seconds
}
