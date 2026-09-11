import { Component, input, output, signal, effect, inject, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../../atoms/button/button.component.js';
import { MotionService } from '../../../core/index.js';

@Component({
  selector: 'app-file-summary-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './file-summary-card.component.html',
  host: { class: 'block' },
})
export class FileSummaryCardComponent {
  name = input<string>('');
  dimensions = input<string>('');
  sizeFormatted = input<string>('');
  previewUrl = input<string | null>(null);
  /** Noun used in the removal-confirmation copy, e.g. "image", "document". */
  itemLabel = input<string>('image');
  /** True while metadata (page count, dimensions) is still being read — shows Index Turn beside the dimensions line. */
  loading = input<boolean>(false);
  changeFile = output<void>();

  confirmingRemoval = signal(false);

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
