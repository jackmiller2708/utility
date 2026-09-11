import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobTicketComponent } from '../../molecules/job-ticket/job-ticket.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import type { JobModel } from '../../../domain/index.js';

/**
 * The press-room floor's job tray — sheets pulled off the press and stacked
 * for pickup. Lives inside the app footer, expanded by default so progress is
 * visible without a click (frictionless by default; collapse is the opt-out).
 * Dismissal is choreographed here: a ticket plays its exit (JobTicketComponent's
 * Pulled Away) before this organism tells the tracker to actually drop it, so
 * the remaining tickets reflow instead of jumping.
 */
@Component({
  selector: 'app-job-tray',
  standalone: true,
  imports: [CommonModule, JobTicketComponent, IconComponent],
  templateUrl: './job-tray.component.html',
})
export class JobTrayComponent {
  jobs = input<readonly JobModel[]>([]);

  cancelJob = output<string>();
  dismissJob = output<string>();

  readonly expanded = signal(true);
  readonly activeCount = computed(() => this.jobs().filter((job) => job.isActive).length);

  private readonly _leavingIds = signal<ReadonlySet<string>>(new Set());

  toggle(): void {
    this.expanded.update((value) => !value);
  }

  isLeaving(id: string): boolean {
    return this._leavingIds().has(id);
  }

  requestDismiss(id: string): void {
    this._leavingIds.update((set) => new Set(set).add(id));
  }

  onLeftView(id: string): void {
    this.dismissJob.emit(id);
    this._leavingIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }
}
