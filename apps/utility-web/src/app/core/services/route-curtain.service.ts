import { Injectable, signal, inject } from '@angular/core';
import { MotionService } from './motion.service.js';

/**
 * The press-room curtain's state, held here (not in the component) so a
 * route guard can drive it: the guard calls `show()` and holds the
 * navigation open until it resolves, so the destination component is
 * created entirely behind a fully opaque curtain — never mid-fade.
 */
@Injectable({ providedIn: 'root' })
export class RouteCurtainService {
  /**
   * Floor on how long the curtain stays fully opaque, timed from the moment
   * it reaches opacity rather than from the click: a warm local navigation
   * can settle before the fade-in even finishes, and lifting the curtain
   * that fast reads as a flicker or a bug, not a job that ran — the press
   * has to visibly turn before it's done. Slower navigations that already
   * clear this on their own pay no extra wait. Shorter under reduced motion,
   * matching every other duration in `MotionService`, not skipped outright —
   * the illusion is legible as a plain hold even without the spin.
   */
  private static readonly MIN_HOLD_MS = 320;
  private static readonly MIN_HOLD_MS_REDUCED = 120;

  private readonly motion = inject(MotionService);
  private element: HTMLElement | null = null;
  private pendingShow: Promise<void> = Promise.resolve();
  private openedAt = 0;

  readonly blocking = signal(true);

  registerElement(el: HTMLElement): void {
    this.element = el;
  }

  /**
   * Called by the route guard. Does not resolve until the curtain is fully
   * opaque. A no-op during SSR/prerendering: Motion's animation engine needs
   * a real browser clock (WAAPI/rAF), and a guard that never resolves there
   * would hang the prerender indefinitely rather than just skip the motion.
   */
  show(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    this.blocking.set(true);
    this.pendingShow = (this.element ? this.motion.curtainShow(this.element) : Promise.resolve()).then(() => {
      this.openedAt = performance.now();
    });
    return this.pendingShow;
  }

  /** Called once the navigation has settled (or was cancelled/errored). Waits for full opacity, holds the minimum dwell, syncs to a real paint, then lifts the curtain. */
  async reveal(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    await this.pendingShow;

    const minHold = this.motion.reducedMotion ? RouteCurtainService.MIN_HOLD_MS_REDUCED : RouteCurtainService.MIN_HOLD_MS;
    const remaining = minHold - (performance.now() - this.openedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    if (this.element) {
      await this.motion.curtainHide(this.element);
    }

    this.blocking.set(false);
  }
}
