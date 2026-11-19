/**
 * Auto-zoom controller (pure logic, no DOM) – the "WeChat/Alipay" behaviour:
 *
 *  • a code is seen but too small / undecodable → zoom in until its modules
 *    are big enough for the decoder, never so far that it leaves the view
 *  • a code is decoded but tiny → zoom to a comfortable size
 *  • nothing seen for a while → sweep zoom levels (1× → max → 1×) to find far codes
 *  • user pinched / dragged the slider → leave zoom alone for a few seconds
 */
import type { QRHint } from './engine';

export interface ZoomInput {
  now: number;
  zoom: number;
  min: number;
  max: number;
  /** Hint in *video* pixel coordinates, or null when nothing is visible. */
  hint: QRHint | null;
  decoded: boolean;
  videoWidth: number;
  videoHeight: number;
}

const TARGET_MODULE = 6; // px per module the decoder likes
const MIN_OK_MODULE = 4;
const COMFORT_FRACTION = 0.42; // decoded code should fill ≈42 % of the short side
const MAX_FRACTION = 0.7;
const SETTLE_MS = 380; // camera needs time to zoom + refocus
const SWEEP_DWELL_MS = 700;
const LOST_AFTER_MS = 700;

export class AutoZoom {
  private settleMs: number;
  constructor(opts: { settleMs?: number } = {}) {
    this.settleMs = opts.settleMs ?? SETTLE_MS;
  }

  private settleUntil = 0;
  private holdUntil = 0;
  private lostAt: number | null = null;
  private resetDone = false;
  private sweepIdx = 0;
  private sweepDir = 1;
  private lastSweepAt = 0;

  /** The user took control (pinch / slider / tap): back off for a while. */
  hold(now: number, ms = 3500) {
    this.holdUntil = now + ms;
  }

  /** Call after any zoom change so we wait for the camera to settle. */
  settle(now: number, ms = this.settleMs) {
    this.settleUntil = Math.max(this.settleUntil, now + ms);
  }

  /** Returns the zoom value to apply, or null for "leave it". */
  update(i: ZoomInput): number | null {
    if (i.max <= i.min * 1.05) return null; // no zoom available
    if (i.now < this.settleUntil || i.now < this.holdUntil) return null;

    if (i.hint) {
      this.lostAt = null;
      this.resetDone = false;
      return this.follow(i);
    }
    return this.search(i);
  }

  private follow(i: ZoomInput): number | null {
    const h = i.hint!;
    const minSide = Math.min(i.videoWidth, i.videoHeight);
    const frac = h.size / minSide;
    let k = 1;

    if (!i.decoded) {
      if (h.module < MIN_OK_MODULE) k = TARGET_MODULE / Math.max(0.5, h.module);
      if (!h.full) k = Math.min(k, 2); // position is a guess: approach gently
    } else if (frac < COMFORT_FRACTION * 0.7) {
      k = COMFORT_FRACTION / frac;
    }

    // never zoom so much that the code is clipped by the screen edge
    k = Math.min(k, MAX_FRACTION / frac);
    const dx = Math.abs(h.cx - i.videoWidth / 2) + h.size / 2;
    const dy = Math.abs(h.cy - i.videoHeight / 2) + h.size / 2;
    k = Math.min(k, (i.videoWidth / 2 / dx) * 0.92, (i.videoHeight / 2 / dy) * 0.92);

    k = Math.max(0.8, Math.min(3.5, k));
    if (k > 0.9 && k < 1.18) return null;

    const target = clamp(i.zoom * k, i.min, i.max);
    if (Math.abs(target - i.zoom) / i.zoom < 0.08) return null;
    const next = i.zoom + (target - i.zoom) * 0.75;
    this.settle(i.now);
    return clamp(next, i.min, i.max);
  }

  private search(i: ZoomInput): number | null {
    if (this.lostAt === null) this.lostAt = i.now;
    if (i.now - this.lostAt < LOST_AFTER_MS) return null;

    // First thing after losing a code: go back to wide view.
    if (!this.resetDone) {
      this.resetDone = true;
      this.sweepIdx = 0;
      this.sweepDir = 1;
      this.lastSweepAt = i.now;
      this.settle(i.now, 300);
      return i.zoom > i.min * 1.05 ? i.min : null;
    }

    if (i.now - this.lastSweepAt < SWEEP_DWELL_MS) return null;
    const levels = sweepLevels(i.min, i.max);
    if (levels.length < 2) return null;
    let idx = this.sweepIdx + this.sweepDir;
    if (idx >= levels.length) { this.sweepDir = -1; idx = levels.length - 2; }
    if (idx < 0) { this.sweepDir = 1; idx = 1; }
    this.sweepIdx = idx;
    this.lastSweepAt = i.now;
    this.settle(i.now, 300);
    return levels[idx];
  }
}

export function sweepLevels(min: number, max: number): number[] {
  const out = [min];
  for (const z of [2, 3.5, 5.5, 8, 12]) if (z > min * 1.4 && z <= max) out.push(z);
  return out;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
