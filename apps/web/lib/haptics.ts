"use client";

/**
 * Tiny haptic feedback helpers (apple-design pass, §13 Multimodal).
 * Fire on the SAME event as the visual change so the senses agree.
 *
 * Honest limitation: navigator.vibrate is a no-op on iOS Safari/PWA today —
 * Android gets the buzz, iOS gets it if/when there's a native shell. The
 * call sites are the durable part, so they ship now.
 */
function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // never let feedback break the action it decorates
  }
}

/** A light tick — arming, a swipe crossing its threshold. */
export function hapticTick(): void {
  vibrate(6);
}

/** A firmer double-pulse — a commit landed (task done, card filed). */
export function hapticSuccess(): void {
  vibrate([12, 28, 14]);
}

/** A warning buzz — something needs attention. */
export function hapticWarn(): void {
  vibrate(20);
}
