import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

const BOUNCE_DURATION_MS = 700;

/**
 * A damped-spring hop (ζ=0.28, ω=13), sampled at 25 points and rescaled to a
 * 14px peak — real oscillator math, not hand-drawn stops, so linear
 * interpolation between them still traces a genuine spring curve.
 *
 * Squash-and-stretch is derived from that same curve, not hand-tuned: each
 * sample's velocity and acceleration are estimated by finite difference
 * against its neighbors, then mapped to `scaleY` two ways that a coil
 * actually deforms —
 *   - fast (high |velocity|, near the equilibrium crossings): the letter is
 *     in flight and elongates in the direction of travel;
 *   - decelerating hard into a direction reversal (high |acceleration|, at
 *     each peak/trough): the letter is fighting its own restoring force and
 *     compresses.
 * `scaleX` is the reciprocal of `scaleY` so cross-section shrinks exactly as
 * height grows — constant apparent volume, the tell that distinguishes a
 * rubbery spring from a flat stretch-in-place. `.bounce-char`'s
 * `transform-origin: bottom` roots that deformation at the baseline, the
 * character's fixed end, so it reads as anchored and springing rather than
 * scaling from its own center.
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
  { offset: 0, transform: 'translateY(0px) scaleY(1.1) scaleX(0.9091)' },
  { offset: 0.04167, transform: 'translateY(-9.51px) scaleY(0.9886) scaleX(1.0115)' },
  { offset: 0.08333, transform: 'translateY(-14px) scaleY(0.9387) scaleX(1.0653)' },
  { offset: 0.125, transform: 'translateY(-13.6px) scaleY(0.9631) scaleX(1.0383)' },
  { offset: 0.16667, transform: 'translateY(-9.68px) scaleY(1.0232) scaleX(0.9773)' },
  { offset: 0.20833, transform: 'translateY(-4.22px) scaleY(1.0505) scaleX(0.9519)' },
  { offset: 0.25, transform: 'translateY(0.93px) scaleY(1.0189) scaleX(0.9815)' },
  { offset: 0.29167, transform: 'translateY(4.49px) scaleY(0.9904) scaleX(1.0097)' },
  { offset: 0.33333, transform: 'translateY(5.93px) scaleY(0.9716) scaleX(1.0292)' },
  { offset: 0.375, transform: 'translateY(5.41px) scaleY(0.9903) scaleX(1.0098)' },
  { offset: 0.41667, transform: 'translateY(3.59px) scaleY(1.0135) scaleX(0.9866)' },
  { offset: 0.45833, transform: 'translateY(1.29px) scaleY(1.0184) scaleX(0.9819)' },
  { offset: 0.5, transform: 'translateY(-0.75px) scaleY(1.0053) scaleX(0.9948)' },
  { offset: 0.54167, transform: 'translateY(-2.06px) scaleY(0.9938) scaleX(1.0062)' },
  { offset: 0.58333, transform: 'translateY(-2.47px) scaleY(0.9877) scaleX(1.0125)' },
  { offset: 0.625, transform: 'translateY(-2.13px) scaleY(0.9979) scaleX(1.0022)' },
  { offset: 0.66667, transform: 'translateY(-1.3px) scaleY(1.0073) scaleX(0.9927)' },
  { offset: 0.70833, transform: 'translateY(-0.35px) scaleY(1.0067) scaleX(0.9934)' },
  { offset: 0.75, transform: 'translateY(0.45px) scaleY(1.0011) scaleX(0.9989)' },
  { offset: 0.79167, transform: 'translateY(0.92px) scaleY(0.9967) scaleX(1.0033)' },
  { offset: 0.83333, transform: 'translateY(1.02px) scaleY(0.9954) scaleX(1.0046)' },
  { offset: 0.875, transform: 'translateY(0.82px) scaleY(1.0002) scaleX(0.9998)' },
  { offset: 0.91667, transform: 'translateY(0.46px) scaleY(1.0034) scaleX(0.9966)' },
  { offset: 0.95833, transform: 'translateY(0.07px) scaleY(0.997) scaleX(1.003)' },
  { offset: 1, transform: 'translateY(0px) scaleY(1) scaleX(1)' },
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
