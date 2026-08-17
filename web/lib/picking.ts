/**
 * Pick throttle + NO_TAP guard state machines (03-03 Task 1, D-14).
 * Pure TS - zero three/React/DOM. The scene PickingController (03-07) drives
 * these; the R3F component stays thin.
 *
 * D-14 / UI-SPEC PickingController row:
 *  - Pointer-move: raycast throttle at 8 Hz (125 ms) - hover-only.
 *  - NO_TAP guard: if more than 2 pointer-move raycasts fire within any
 *    500 ms window, suppress tap registration until the next pointer-up with
 *    no intervening move event.
 *  - Drag-aways (OrbitControls grabbing) never tap: dragDistanceExceeded.
 *
 * Security (T-03-04): pure counters/timestamps only - no regex, no array
 * bloat on file strings; state is a handful of scalars.
 */

/** 8 Hz hover throttle: pass only when `now - last >= intervalMs`. */
export interface HoverThrottle {
  shouldFire(now: number): boolean;
  last: number;
}

export function createHoverThrottle(intervalMs = 125): HoverThrottle {
  let last = -Infinity;
  return {
    get last() {
      return last;
    },
    shouldFire(now: number): boolean {
      if (now - last >= intervalMs) {
        last = now;
        return true;
      }
      return false;
    },
  };
}

/**
 * NO_TAP guard: counts pointer-move ticks through a sliding 500 ms window.
 * `move(now)` returns whether the tap is now suppressed (more than `maxTicks`
 * moves within the window). `up()` returns whether a tap is permitted: after
 * suppression, the next pointer-up with NO intervening move re-permits a
 * deliberate still-tap (D-14 recovery).
 */
export interface NoTapGuard {
  move(now: number): boolean;
  up(): boolean;
}

export function createNoTapGuard(windowMs = 500, maxTicks = 2): NoTapGuard {
  let suppressed = false;
  const moveTimes: number[] = [];

  const prune = (now: number): void => {
    const cutoff = now - windowMs;
    while (moveTimes.length > 0 && moveTimes[0] < cutoff) moveTimes.shift();
  };

  return {
    move(now: number): boolean {
      prune(now);
      moveTimes.push(now);
      suppressed = moveTimes.length > maxTicks;
      return suppressed;
    },
    up(): boolean {
      const permitted = !suppressed;
      suppressed = false; // a pointer-up resets the window
      moveTimes.length = 0;
      return permitted;
    },
  };
}

/**
 * Tap registration decision (pure). `hadMoveSinceLastUp` is the caller's
 * bookkeeping: a tap is permitted only when the guard allows it AND no drag
 * happened (the caller still checks dragDistanceExceeded separately).
 */
export function shouldRegisterTap(guard: NoTapGuard, hadMoveSinceLastUp: boolean): boolean {
  if (hadMoveSinceLastUp) return false;
  return guard.up();
}

/** Euclidean px distance between two pointer points. */
function pointDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * Drag-distance escape: once the pointer has moved more than `thresholdPx`
 * between pointer-down and pointer-up, the gesture is a drag (OrbitControls),
 * never a tap (D-14).
 */
export function dragDistanceExceeded(pxMoved: number, thresholdPx = 6): boolean {
  return pxMoved >= thresholdPx;
}

export { pointDistance };
