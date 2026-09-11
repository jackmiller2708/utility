import { Injectable } from '@angular/core';
import { animate } from 'motion';

/**
 * Every orchestrated motion in the system shares this spring character: a
 * confident, no-overshoot settle (DESIGN.md's no-bounce-by-reflex rule),
 * expressed as a spring rather than a fixed curve so it can retarget mid-flight
 * — a fast batch queue can complete a job while its entrance is still playing.
 */
const PRESS_SPRING = { type: 'spring', bounce: 0 } as const;

const STAMP_STAGGER_STEP = 0.04;
const STAMP_STAGGER_CAP = 4;

/**
 * Named motion patterns for the job lifecycle (see the motion framework shape
 * brief). Pending/Running/Cancelled stay CSS (`reg-cross-spin`, `pulse-slow`,
 * `struck-plate` in styles.css) — this service owns only the states that need
 * sequencing, spring physics, or an exit an Angular `@if` can't hold open for.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  /** Read by `RouteCurtainService` to scale its minimum-hold buffer alongside every duration here. */
  readonly reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Odometer Tick — a ledger number retargets on every `completed` increment instead of restarting, so a fast run of progress updates never stutters. */
  tick(el: Element): void {
    if (this.reducedMotion) {
      return;
    }

    animate(el, { scale: [1, 1.08, 1] }, { duration: 0.12, ease: 'easeOut' });
  }

  /**
   * Pulled Sheet — the system's one authored focal moment: content lifts clear
   * as it completes. `index` staggers a group revealing together (e.g. a
   * ledger's rows filling in at once) using the same cap as Stamped In, so
   * five rows read as one cascading reveal rather than five separate pops.
   */
  pulledSheet(el: Element, index = 0): void {
    const delay = Math.min(index, STAMP_STAGGER_CAP) * STAMP_STAGGER_STEP;

    animate(
      el,
      this.reducedMotion ? { opacity: [0.6, 1] } : { y: [0, -7, 0], opacity: [0.7, 1] },
      { ...PRESS_SPRING, visualDuration: this.reducedMotion ? 0.15 : 0.65, delay }
    );
  }

  /** Misregistration — a failed job snaps out of register in red, then back, rather than a generic shake. */
  misregister(el: Element): void {
    if (this.reducedMotion) {
      return;
    }

    animate(el, { x: [0, -2, 2, 0] }, { duration: 0.22, ease: 'easeOut' });
  }

  /** Stamped In — a new ticket lands in the tray; stagger caps at four slots so a large batch never queues a visible cascade. */
  stampIn(el: Element, index: number): void {
    const delay = Math.min(index, STAMP_STAGGER_CAP) * STAMP_STAGGER_STEP;

    animate(
      el,
      this.reducedMotion ? { opacity: [0, 1] } : { opacity: [0, 1], y: [10, 0] },
      { ...PRESS_SPRING, visualDuration: this.reducedMotion ? 0.1 : 0.3, delay }
    );
  }

  /** Pulled Away — a ticket leaving the tray; the caller awaits this before removing the element so the remaining tickets reflow instead of jumping. */
  async pullAway(el: Element): Promise<void> {
    if (this.reducedMotion) {
      await animate(el, { opacity: [1, 0] }, { duration: 0.1 }).finished;
      return;
    }

    await animate(el, { opacity: [1, 0], y: [0, 8] }, { duration: 0.15, ease: 'easeIn' }).finished;
  }

  /** Ink Stroke — a status glyph (check, X) draws itself rather than appearing whole, the way a rubber stamp's ink traces its own outline as it lands. Works on any stroke-based SVG (path/polyline/line/circle/rect all implement SVGGeometryElement). */
  drawOn(svg: SVGElement): void {
    const shapes = svg.querySelectorAll<SVGGeometryElement & SVGElement>('path, polyline, line, circle, rect');

    shapes.forEach((shape, index) => {
      const length = shape.getTotalLength();
      shape.style.strokeDasharray = `${length}`;

      if (this.reducedMotion) {
        shape.style.strokeDashoffset = '0';
        return;
      }

      shape.style.strokeDashoffset = `${length}`;
      animate(shape, { strokeDashoffset: [length, 0] }, { duration: 0.3, delay: index * 0.06, ease: 'easeOut' });
    });
  }

  /** FLIP move — plays after an element's position changed (a list reorder): inverts the jump into a spring-eased slide instead of letting it snap to the new spot. */
  flipMove(el: Element, deltaY: number): void {
    if (this.reducedMotion || Math.abs(deltaY) < 0.5) {
      return;
    }

    animate(el, { y: [deltaY, 0] }, { ...PRESS_SPRING, visualDuration: 0.35 });
  }

  /**
   * Curtain Show/Hide — the route-transition overlay. Explicit `await`able
   * sequencing rather than a CSS class toggle, because the whole point of the
   * curtain is to fully cover the outgoing/incoming swap: a fast warm
   * navigation can resolve in under the time a CSS opacity transition takes
   * to reach 1, and revealing before that finishes would show the swap
   * through a translucent curtain — the exact flash this exists to prevent.
   * Single-value targets (not `[from, to]` arrays) so a rapid re-trigger
   * retargets smoothly from wherever the element currently is, never snapping.
   */
  async curtainShow(el: Element): Promise<void> {
    await animate(el, { opacity: 1 }, { duration: this.reducedMotion ? 0.05 : 0.12, ease: 'easeOut' }).finished;
  }

  async curtainHide(el: Element): Promise<void> {
    await animate(el, { opacity: 0 }, { duration: this.reducedMotion ? 0.05 : 0.18, ease: 'easeOut' }).finished;
  }
}
