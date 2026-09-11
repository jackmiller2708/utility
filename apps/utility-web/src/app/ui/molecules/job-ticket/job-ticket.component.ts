import { Component, input, output, effect, inject, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { MotionService } from '../../../core/index.js';
import type { JobModel } from '../../../domain/index.js';

/**
 * A stamped job ledger ticket — used both compact in the footer tray and full
 * size inline on a workbench. Owns the job lifecycle's motion (see the motion
 * framework brief): pending/running/cancelled stay pure CSS (`pulse-slow`,
 * `reg-cross-spin`, `struck-plate`); completed, failed, entrance, and exit are
 * orchestrated here via MotionService (Motion/motion.dev).
 */
@Component({
  selector: 'app-job-ticket',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './job-ticket.component.html',
  host: { class: 'block relative' },
})
export class JobTicketComponent {
  private readonly motion = inject(MotionService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  job = input.required<JobModel>();
  /** Position within the tray's list — caps the Stamped In stagger delay. */
  index = input<number>(0);
  compact = input<boolean>(false);
  /** Set by the parent to start the Pulled Away exit; the parent removes the ticket only after `leftView` fires. */
  leaving = input<boolean>(false);

  cancelled = output<string>();
  dismissed = output<string>();
  leftView = output<void>();

  private readonly ledger = viewChild<ElementRef<HTMLElement>>('ledger');
  private readonly statusIcon = viewChild<ElementRef<HTMLElement>>('statusIcon');

  private _stamped = false;
  private _previousStatus: JobModel['status'] | null = null;
  private _previousCompleted: number | null = null;

  constructor() {
    effect(() => {
      const job = this.job();
      const el = this.hostRef.nativeElement;

      if (!this._stamped) {
        this._stamped = true;
        this.motion.stampIn(el, this.index());
        this._previousStatus = job.status;
        this._previousCompleted = job.progress?.completed ?? null;
        return;
      }

      if (job.status !== this._previousStatus) {
        const previous = this._previousStatus;
        this._previousStatus = job.status;

        if (job.status === 'completed' && previous !== null) {
          this.motion.pulledSheet(el);
          this.drawStatusIcon();
        } else if (job.status === 'failed' && previous !== null) {
          this.motion.misregister(el);
          this.drawStatusIcon();
        }
      }

      const completed = job.progress?.completed ?? null;
      if (completed != null && this._previousCompleted != null && completed > this._previousCompleted) {
        const ledgerEl = this.ledger()?.nativeElement;
        if (ledgerEl) {
          this.motion.tick(ledgerEl);
        }
      }
      this._previousCompleted = completed;
    });

    effect(() => {
      if (this.leaving()) {
        this.motion.pullAway(this.hostRef.nativeElement).then(() => this.leftView.emit());
      }
    });
  }

  /** Ink Stroke — the completed/failed glyph draws its own outline rather than appearing whole. */
  private drawStatusIcon(): void {
    const svg = this.statusIcon()?.nativeElement.querySelector('svg');
    if (svg) {
      this.motion.drawOn(svg);
    }
  }
}
