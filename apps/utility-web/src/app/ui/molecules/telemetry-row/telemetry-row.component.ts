import { Component, input, effect, inject, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MotionService } from '../../../core/index.js';

@Component({
  selector: 'app-telemetry-row',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './telemetry-row.component.html',
  host: { class: 'flex gap-4 items-center py-3 px-6 border-b border-paper-hairline flex-wrap' },
})
export class TelemetryRowComponent {
  private readonly motion = inject(MotionService);

  label = input<string>('');
  srcValue = input<string>('');
  outValue = input<string>('');
  filled = input<boolean>(false);
  tone = input<'neutral' | 'mint' | 'gold'>('neutral');
  /** Position among the sibling rows revealing together — staggers Pulled Sheet so the ledger fills in as one cascade. */
  index = input<number>(0);

  private readonly badge = viewChild<ElementRef<HTMLElement>>('badge');
  private _seenFirstRender = false;
  private _previousFilled = false;

  constructor() {
    /** Pulled Sheet, reused: a result value arriving IS a job completing, whether that's a tray ticket or one cell of this ledger. */
    effect(() => {
      const filled = this.filled();

      if (!this._seenFirstRender) {
        this._seenFirstRender = true;
        this._previousFilled = filled;
        return;
      }

      if (filled && !this._previousFilled) {
        const el = this.badge()?.nativeElement;
        if (el) {
          this.motion.pulledSheet(el, this.index());
        }
      }

      this._previousFilled = filled;
    });
  }
}
