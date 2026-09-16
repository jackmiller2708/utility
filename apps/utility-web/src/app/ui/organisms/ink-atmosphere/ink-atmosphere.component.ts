import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, viewChild, viewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';

interface RegisterMark {
  readonly leftPct: number;
  readonly topPct: number;
  readonly baseRotation: number;
  readonly baseOpacity: number;
}

const MARK_COLS = 9;
const MARK_ROWS = 5;
/** How close the cursor has to get, in CSS px, before a mark starts finding register. */
const ACTIVATION_RADIUS = 220;
/**
 * Max px an ink plate is pulled toward the cursor — position is the effect
 * now, not a proxy for it. Bold on purpose, after the source direction
 * (NestJS's own interactive hero background): the light actually moves
 * through the room to meet the cursor, it doesn't just glow harder in place.
 */
const PLATE_DRIFT = 320;
/**
 * How much of the raw cursor-to-rest-center distance becomes pull, before
 * the `PLATE_DRIFT` clamp — e.g. a plate reaches its full pull by roughly
 * `PLATE_DRIFT / PLATE_PULL_FACTOR` px away. Deliberately plain
 * displacement × factor, not a normalized direction vector: a unit vector
 * (`dx / distance`) is numerically unstable as distance approaches zero —
 * exactly what happens whenever the cursor nears a plate's own corner —
 * and tiny cursor movements there were flipping the pull direction wildly.
 * This formulation is zero at zero distance and never divides by anything.
 */
const PLATE_PULL_FACTOR = 0.35;
/** Parallax weight per plate — distinct pull strength so the three lights read as ink pooled at different depths chasing the same hand, not one blob riding under the cursor. */
const PLATE_WEIGHT_PINK = 1;
const PLATE_WEIGHT_GOLD = 0.82;
const PLATE_WEIGHT_BLUE = 0.6;
/** Active opacity is one fixed step up from idle's 0.55 — a single tell that the room is occupied, not a second effect competing with the movement for attention. */
const PLATE_ACTIVE_OPACITY = '0.62';
/**
 * Max px the bleed mark drifts toward the cursor. Chrome, not the show — a
 * fraction of a plate's travel. Translated, never rotated: the mark's inner
 * square sits off-center in its own 32-unit grid by design (DESIGN.md's
 * actual brand mark), so any rotation swings that square through a visible
 * arc around the mark's geometric center. Drift doesn't have that problem —
 * an asymmetric shape sliding in a straight line still reads as one shape.
 */
const MARK_DRIFT = 36;
/** How long the cursor can sit still before the press bed settles back to rest. */
const IDLE_AFTER_MS = 3000;

/** Deterministic pseudo-random in [0, 1) — never `Math.random()`, so SSR and the client's first paint agree on every mark's jitter (hydration would otherwise mismatch). */
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildMarks(): readonly RegisterMark[] {
  const marks: RegisterMark[] = [];
  const colStep = 100 / MARK_COLS;
  const rowStep = 100 / MARK_ROWS;

  for (let row = 0; row < MARK_ROWS; row++) {
    for (let col = 0; col < MARK_COLS; col++) {
      const i = row * MARK_COLS + col;
      const jitterX = (hash(i * 3.1 + 1) - 0.5) * colStep * 0.6;
      const jitterY = (hash(i * 3.1 + 2) - 0.5) * rowStep * 0.6;

      marks.push({
        leftPct: col * colStep + colStep / 2 + jitterX,
        topPct: row * rowStep + rowStep / 2 + jitterY,
        baseRotation: hash(i * 3.1 + 3) > 0.5 ? 45 : 0,
        baseOpacity: 0.25 + hash(i * 3.1 + 4) * 0.25,
      });
    }
  }

  return marks;
}

/**
 * The press room's atmosphere: three ink plates (pink, blue, gold — the
 * system's working spot-ink set, matching the source risograph reference), a
 * halftone screen, an oversized bleed mark, and a loose field of the
 * product's own registration crosses scattered across the floor. The plates
 * are soft blurred pools of light on the press bed (matching the source
 * reference's own `blur(18px)`/screen-blend treatment); the registration
 * crosses stay flat and hard-edged, the same `.reg-cross` language used
 * everywhere else. Nothing here loops on its own clock — the halftone screen
 * sits still, and the plates, marks, and mark only move because the cursor
 * is stirring them. The room settles back to rest — every mark and plate
 * eased to its idle opacity/position, not snapped — once the cursor has sat
 * still for `IDLE_AFTER_MS`, or the instant it leaves the window; a still or
 * absent operator shouldn't leave the floor lit as if a hand were still on
 * it. Entirely `aria-hidden` and `pointer-events-none`; it never competes
 * with the actual workbench.
 */
@Component({
  selector: 'app-ink-atmosphere',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ink-atmosphere.component.html',
  host: {
    class: 'absolute inset-0 z-0 overflow-hidden pointer-events-none',
    'aria-hidden': 'true',
  },
})
export class InkAtmosphereComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  private readonly bleedMark = viewChild<ElementRef<HTMLElement>>('mark');
  private readonly inkCrosses = viewChildren<ElementRef<HTMLElement>>('inkCross');
  private readonly pinkPlate = viewChild<ElementRef<HTMLElement>>('pinkPlate');
  private readonly bluePlate = viewChild<ElementRef<HTMLElement>>('bluePlate');
  private readonly goldPlate = viewChild<ElementRef<HTMLElement>>('goldPlate');

  /**
   * Each plate's untransformed rest center, captured once before any
   * transform is ever applied and kept fixed thereafter — the anchor every
   * pull vector is measured from. Measuring from the plate's own *live*
   * (mid-transition) position instead was the bug: the reference point kept
   * sliding as the previous transition caught up, so a fixed-magnitude pull
   * recomputed against it could overshoot, flip direction, and oscillate —
   * the "jello" jitter. A fixed anchor makes the target a pure function of
   * the cursor position, so it can't feed back on itself.
   */
  private readonly restCenters = new Map<HTMLElement, { x: number; y: number }>();

  /** A loose 9x5 field with hash-based jitter so it reads as scattered, off-register marks rather than a drafted grid — the same imperfection the original halftone/trim-mark decor leaned on. */
  readonly marks: readonly RegisterMark[] = buildMarks();

  /** Only a real mouse finds register — a touch drag scrolling the page shouldn't stir the floor. */
  private readonly canTrackPointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  private readonly reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private pendingX = 0;
  private pendingY = 0;
  private frameQueued = false;
  private isIdle = true;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (this.reducedMotion || !this.canTrackPointer) {
      return;
    }

    if (this.isIdle) {
      this.wake();
    }
    this.isIdle = false;
    this.scheduleIdle();

    this.pendingX = event.clientX;
    this.pendingY = event.clientY;

    if (!this.frameQueued) {
      this.frameQueued = true;
      requestAnimationFrame(() => this.applyPointer());
    }
  }

  /** The cursor leaving the window is a harder signal than mere stillness — settle immediately rather than waiting out the idle timer. `document:mouseleave` (not `window:`) is what actually fires when the pointer crosses the viewport edge. */
  @HostListener('document:mouseleave')
  onPointerLeaveWindow(): void {
    if (this.reducedMotion || !this.canTrackPointer) {
      return;
    }

    this.clearIdleTimer();
    this.goIdle();
  }

  /** A layout change invalidates every cached rest center — recapture rather than let the pull vectors drift stale against the old viewport size. */
  @HostListener('window:resize')
  onWindowResize(): void {
    this.captureRestCenters();
  }

  ngAfterViewInit(): void {
    this.captureRestCenters();
  }

  ngOnDestroy(): void {
    this.clearIdleTimer();
  }

  private captureRestCenters(): void {
    for (const plateRef of [this.pinkPlate(), this.bluePlate(), this.goldPlate(), this.bleedMark()]) {
      const el = plateRef?.nativeElement;
      if (!el) {
        continue;
      }

      const hadTransform = el.style.transform;
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      el.style.transform = hadTransform;

      this.restCenters.set(el, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
  }

  private scheduleIdle(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.goIdle(), IDLE_AFTER_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Settles every mark, plate, and the bleed mark back to its resting state,
   * eased by the same CSS transitions as any other write — a stationary or
   * absent cursor reads as the press room at rest, not frozen mid-gesture.
   * The plates keep one small sign of life at rest: `press-breathe` (styles.css)
   * takes over their opacity once the settle transition finishes, a slow
   * idle pulse distinct from the interactive chase, so "resting" never reads
   * as "the page broke."
   */
  private goIdle(): void {
    this.isIdle = true;

    this.inkCrosses().forEach((crossRef, i) => {
      const m = this.marks[i];
      const el = crossRef.nativeElement;
      el.style.opacity = '0';
      el.style.transform = `rotate(${m.baseRotation}deg) scale(1)`;
    });

    const markEl = this.bleedMark()?.nativeElement;
    if (markEl) {
      markEl.style.transform = 'translate(0px, 0px)';
    }

    for (const plateRef of [this.pinkPlate(), this.bluePlate(), this.goldPlate()]) {
      const el = plateRef?.nativeElement;
      if (el) {
        el.style.transform = 'translate(0px, 0px)';
        el.style.opacity = '0.55';
        el.classList.add('is-idle');
      }
    }
  }

  /** The first movement after a rest breaks the idle pulse and sets the one active-opacity step immediately; `applyPointer`, running the same frame, takes the plates' position from there. */
  private wake(): void {
    for (const plateRef of [this.pinkPlate(), this.bluePlate(), this.goldPlate()]) {
      const el = plateRef?.nativeElement;
      if (el) {
        el.classList.remove('is-idle');
        el.style.opacity = PLATE_ACTIVE_OPACITY;
      }
    }
  }

  /**
   * Coalesces however many pointermove events fired since the last frame into
   * one style write per mark. Writes `opacity`/`transform` straight to the
   * DOM (bypassing change detection, deliberately — this runs up to 60
   * times/sec) and lets each mark's own CSS `transition` do the easing, so a
   * fast mouse chases smoothly instead of the field snapping frame to frame.
   */
  private applyPointer(): void {
    this.frameQueued = false;

    // A pointermove can queue this frame and then immediately leave the
    // window before the frame runs (`mouseleave` fires synchronously,
    // rAF doesn't) — without this guard, the stale frame would re-light
    // the field a moment after `goIdle` just settled it.
    if (this.isIdle) {
      return;
    }

    const rect = this.hostRef.nativeElement.getBoundingClientRect();
    const x = this.pendingX;
    const y = this.pendingY;

    this.inkCrosses().forEach((crossRef, i) => {
      const m = this.marks[i];
      const markX = rect.left + (m.leftPct / 100) * rect.width;
      const markY = rect.top + (m.topPct / 100) * rect.height;
      const distance = Math.hypot(x - markX, y - markY);
      const proximity = Math.max(0, 1 - distance / ACTIVATION_RADIUS);

      const el = crossRef.nativeElement;
      el.style.opacity = proximity.toFixed(3);
      el.style.transform = `rotate(${m.baseRotation}deg) scale(${(1 + proximity * 0.9).toFixed(3)})`;
    });

    this.drift(this.pinkPlate()?.nativeElement, x, y, PLATE_DRIFT * PLATE_WEIGHT_PINK);
    this.drift(this.goldPlate()?.nativeElement, x, y, PLATE_DRIFT * PLATE_WEIGHT_GOLD);
    this.drift(this.bluePlate()?.nativeElement, x, y, PLATE_DRIFT * PLATE_WEIGHT_BLUE);
    this.drift(this.bleedMark()?.nativeElement, x, y, MARK_DRIFT);
  }

  /**
   * Pulls an element toward wherever the cursor is, measured from its fixed
   * rest center (`restCenters`) rather than its live transformed position —
   * the target is a pure function of the cursor position, so it can't chase
   * its own tail. Each axis is plain displacement × factor, clamped, not a
   * normalized direction vector — see `PLATE_PULL_FACTOR` for why: an
   * element's own rest position is exactly where a unit vector's instability
   * would otherwise show up worst. `cap` is the max px of pull on either
   * axis, letting the ink plates and the bleed mark share one implementation
   * at very different scales.
   */
  private drift(el: HTMLElement | undefined, x: number, y: number, cap: number): void {
    if (!el) {
      return;
    }

    const rest = this.restCenters.get(el);
    if (!rest) {
      return;
    }

    const nx = Math.max(-cap, Math.min(cap, (x - rest.x) * PLATE_PULL_FACTOR));
    const ny = Math.max(-cap, Math.min(cap, (y - rest.y) * PLATE_PULL_FACTOR));

    el.style.transform = `translate(${nx.toFixed(1)}px, ${ny.toFixed(1)}px)`;
  }
}
