import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

const BOUNCE_DURATION_MS = 700;

/**
 * A damped-spring hop (ζ=0.28, ω=13), sampled at 25 points and rescaled to a
 * 14px peak — real oscillator math, not hand-drawn stops, so linear
 * interpolation between them still traces a genuine spring curve.
 *
 * A plain keyframe array for native `Element.animate()`, deliberately not a
 * CSS `@keyframes` tied to `:hover`: a CSS-triggered animation is canceled
 * the instant the pointer leaves mid-flight, and this one has to run to
 * completion regardless. It's also deliberately not the `motion` package
 * (`MotionService`) — that path never fired reliably. `Element.animate()`
 * is the browser's own native Web Animations API: no library, no import to
 * mis-wire, and once started it keeps playing independent of whatever the
 * pointer does next.
 */
const BOUNCE_KEYFRAMES: Keyframe[] = [
  { offset: 0, transform: 'translateY(0px)' },
  { offset: 0.04167, transform: 'translateY(-9.51px)' },
  { offset: 0.08333, transform: 'translateY(-14px)' },
  { offset: 0.125, transform: 'translateY(-13.6px)' },
  { offset: 0.16667, transform: 'translateY(-9.68px)' },
  { offset: 0.20833, transform: 'translateY(-4.22px)' },
  { offset: 0.25, transform: 'translateY(0.93px)' },
  { offset: 0.29167, transform: 'translateY(4.49px)' },
  { offset: 0.33333, transform: 'translateY(5.93px)' },
  { offset: 0.375, transform: 'translateY(5.41px)' },
  { offset: 0.41667, transform: 'translateY(3.59px)' },
  { offset: 0.45833, transform: 'translateY(1.29px)' },
  { offset: 0.5, transform: 'translateY(-0.75px)' },
  { offset: 0.54167, transform: 'translateY(-2.06px)' },
  { offset: 0.58333, transform: 'translateY(-2.47px)' },
  { offset: 0.625, transform: 'translateY(-2.13px)' },
  { offset: 0.66667, transform: 'translateY(-1.3px)' },
  { offset: 0.70833, transform: 'translateY(-0.35px)' },
  { offset: 0.75, transform: 'translateY(0.45px)' },
  { offset: 0.79167, transform: 'translateY(0.92px)' },
  { offset: 0.83333, transform: 'translateY(1.02px)' },
  { offset: 0.875, transform: 'translateY(0.82px)' },
  { offset: 0.91667, transform: 'translateY(0.46px)' },
  { offset: 0.95833, transform: 'translateY(0.07px)' },
  { offset: 1, transform: 'translateY(0px)' },
];

/**
 * Splits `text` into per-character spans so each letter can bounce on its
 * own hover — the masthead-sized tool titles inviting a poke, the way a
 * stamped cover line would wobble if you actually pressed on it.
 * `Array.from` rather than `.split('')` so a surrogate pair (an emoji, say)
 * stays one character instead of splitting into two broken halves.
 *
 * Each character locks itself for the duration of its own bounce: entering
 * a letter that's already mid-animation is a no-op, and the running
 * animation always plays to completion — never restarted, never cut short
 * by the pointer leaving. A `WeakSet` (not a boolean field) tracks the lock
 * per DOM element rather than per component instance, since one component
 * instance owns every character span.
 *
 * The split is presentation-only: the host carries the real string as
 * `aria-label` and every character span is `aria-hidden`, so a screen reader
 * still hears one word, never 15 single-letter announcements.
 */
@Component({
  selector: 'app-bounce-text',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bounce-text.component.html',
  host: {
    class: 'inline-block',
    '[attr.aria-label]': 'text()',
  },
})
export class BounceTextComponent {
  readonly text = input.required<string>();

  readonly chars = computed(() => Array.from(this.text()));

  private readonly reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly animating = new WeakSet<Element>();

  onCharEnter(event: PointerEvent): void {
    if (this.reducedMotion) {
      return;
    }

    const el = event.currentTarget as HTMLElement;
    if (this.animating.has(el)) {
      return;
    }

    this.animating.add(el);
    const release = () => this.animating.delete(el);
    el.animate(BOUNCE_KEYFRAMES, { duration: BOUNCE_DURATION_MS, easing: 'linear', fill: 'none' })
      .finished.then(release, release);
  }
}
