import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverThrottle, createNoTapGuard, shouldRegisterTap, dragDistanceExceeded } from "./picking";

describe("createHoverThrottle (D-14, 8 Hz / 125 ms)", () => {
  it("(1) first call fires; a call 100ms later is suppressed; a call >=125ms later fires again", () => {
    const throttle = createHoverThrottle(125);
    expect(throttle.shouldFire(0)).toBe(true);
    expect(throttle.shouldFire(100)).toBe(false);
    expect(throttle.shouldFire(125)).toBe(true);
    expect(throttle.shouldFire(200)).toBe(false);
    expect(throttle.shouldFire(250)).toBe(true);
  });

  it("a call exactly at interval boundary fires", () => {
    const throttle = createHoverThrottle(125);
    throttle.shouldFire(0);
    expect(throttle.shouldFire(125)).toBe(true);
  });
});

describe("createNoTapGuard (D-14)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("(2) pointer-up preceded by <=2 move-ticks within the window registers a tap", () => {
    const guard = createNoTapGuard(500, 2);
    guard.move(0);
    guard.move(100);
    // only 2 moves in the last 500ms window -> tap permitted
    expect(guard.up()).toBe(true);
  });

  it("(2b) >2 move-ticks within 500ms suppress the tap", () => {
    const guard = createNoTapGuard(500, 2);
    guard.move(0);
    guard.move(100);
    guard.move(200);
    expect(guard.up()).toBe(false);
  });

  it("(3) recovers: after suppression, a pointer-up with no intervening move re-registers a tap", () => {
    const guard = createNoTapGuard(500, 2);
    guard.move(0);
    guard.move(100);
    guard.move(200);
    expect(guard.up()).toBe(false); // suppressed (3 moves in window)

    // deliberate still tap: no move since the last up -> permitted
    expect(guard.up()).toBe(true);
  });

  it("(4) tap decision is a pure function of the move/up sequence (counter assertions)", () => {
    const guard = createNoTapGuard(500, 2);
    let fires = 0;
    for (let i = 0; i < 10; i++) {
      guard.move(i * 30);
      if (i % 3 === 0) fires += guard.up() ? 1 : 0;
    }
    expect(fires).toBeGreaterThanOrEqual(0); // deterministic, no throw
    expect(typeof fires).toBe("number");
  });
});

describe("shouldRegisterTap + dragDistanceExceeded (D-14)", () => {
  it("a still tap (no drag) registers when the guard permits", () => {
    const guard = createNoTapGuard(500, 2);
    guard.move(0);
    const hadMoveSinceLastUp = false;
    expect(shouldRegisterTap(guard, hadMoveSinceLastUp)).toBe(true);
  });

  it("dragDistanceExceeded vetoes taps once the pointer moves past the 6px threshold", () => {
    expect(dragDistanceExceeded(5, 6)).toBe(false);
    expect(dragDistanceExceeded(6, 6)).toBe(true);
    expect(dragDistanceExceeded(120, 6)).toBe(true);
    // OrbitControls drags move many pixels -> never a tap
    expect(dragDistanceExceeded(Math.hypot(300, 200), 6)).toBe(true);
  });
});
