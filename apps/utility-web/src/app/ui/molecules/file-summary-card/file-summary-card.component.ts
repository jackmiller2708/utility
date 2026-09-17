import { Component, input, output, signal, effect, inject, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '@app/ui/atoms/button/button.component';
import { MotionService } from '@app/core';

@Component({
  selector: 'app-file-summary-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './file-summary-card.component.html',
  host: { class: 'block' },
})
export class FileSummaryCardComponent {
  readonly name = input<string>('');
  readonly dimensions = input<string>('');
  readonly sizeFormatted = input<string>('');
  readonly previewUrl = input<string | null>(null);
  /** Noun used in the removal-confirmation copy, e.g. "image", "document". */
  readonly itemLabel = input<string>('image');
  /** True while metadata (page count, dimensions) is still being read — shows Index Turn beside the dimensions line. */
  readonly loading = input<boolean>(false);
  readonly changeFile = output<void>();

  readonly confirmingRemoval = signal(false);

  private readonly removalAlert = viewChild<ElementRef<HTMLElement>>('removalAlert');

  constructor() {
    const motion = inject(MotionService);
    const hostRef = inject(ElementRef<HTMLElement>);

    /** Stamped In — a plate landing on the press the moment a file is accepted, replacing the dropzone. Fires once, on this instance's first render (a new file always mounts a fresh card, never reuses one). */
    effect(() => {
      motion.stampIn(hostRef.nativeElement, 0);
    });

    /** Same entrance, reused for the removal-confirmation alert appearing. */
    effect(() => {
      const el = this.removalAlert()?.nativeElement;

      if (el) {
        motion.stampIn(el, 0);
      }
    });
  }

  requestRemoval(): void {
    this.confirmingRemoval.set(true);
  }

  cancelRemoval(): void {
    this.confirmingRemoval.set(false);
  }

  confirmRemoval(): void {
    this.confirmingRemoval.set(false);
    this.changeFile.emit();
  }
}
