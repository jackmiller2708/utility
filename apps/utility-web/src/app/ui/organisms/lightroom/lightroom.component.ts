import { Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '@app/ui/atoms/icon/icon.component';
import { MotionService } from '@app/core';

export type LightroomSide = 'original' | 'export';

/**
 * A full-screen loupe for inspecting a result before committing to download — the press
 * room's own darkroom: the image sits on neutral dark ground with nothing else competing
 * for the eye, chrome kept to wayfinding text per DESIGN.md's press-room rule (no paper
 * card floating in the void here).
 *
 * Mounted/unmounted by the parent (`@if`), matching `JobTicketComponent`'s own
 * leaving/leftView handshake: the parent sets `leaving` in response to `closeRequested`,
 * this plays Pulled Away, then emits `leftView` once it's actually safe to unmount.
 */
@Component({
  selector: 'app-lightroom',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './lightroom.component.html',
  host: {
    class: 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-press p-6',
    tabindex: '-1',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': 'label() ? ("Preview — " + label()) : "Preview"',
    '(click)': 'onBackdropClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class LightroomComponent {
  private readonly motion = inject(MotionService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  readonly initialSide = input<LightroomSide>('original');
  readonly originalUrl = input<string | null>(null);
  readonly exportUrl = input<string | null>(null);
  readonly originalCaption = input<string>('');
  readonly exportCaption = input<string>('');
  readonly label = input<string>('');
  /** Set by the parent to start the exit animation; the parent removes this component only after `leftView` fires. */
  readonly leaving = input<boolean>(false);

  readonly closeRequested = output<void>();
  readonly leftView = output<void>();

  readonly activeSide = signal<LightroomSide>('original');

  readonly showToggle = computed(() => !!this.exportUrl());
  readonly activeUrl = computed(() => this.activeSide() === 'export' ? this.exportUrl() : this.originalUrl());
  readonly activeCaption = computed(() => this.activeSide() === 'export' ? this.exportCaption() : this.originalCaption());

  private _initialized = false;

  constructor() {
    // Signal inputs aren't populated yet during the constructor body itself — Angular applies
    // bound values as part of this view's own update pass, which runs after construction but
    // before this effect's first execution. Reading `initialSide()` directly above would see
    // only its default, never the side that was actually clicked.
    effect(() => {
      if (this._initialized) {
        return;
      }

      this._initialized = true;
      this.activeSide.set(this.initialSide());
      this.motion.stampIn(this.hostRef.nativeElement, 0);
      queueMicrotask(() => this.hostRef.nativeElement.focus());
    });

    effect(() => {
      if (this.leaving()) {
        this.motion.pullAway(this.hostRef.nativeElement).then(() => this.leftView.emit());
      }
    });
  }

  selectSide(side: LightroomSide): void {
    this.activeSide.set(side);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeRequested.emit();
    }
  }

  onEscape(): void {
    this.closeRequested.emit();
  }
}
