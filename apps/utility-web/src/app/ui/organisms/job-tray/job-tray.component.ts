import type { JobModel } from '../../../domain/index.js';

import { Component, input, output, signal, computed } from '@angular/core';
import { BatchTicketComponent } from '../../molecules/batch-ticket/batch-ticket.component.js';
import { JobTicketComponent } from '../../molecules/job-ticket/job-ticket.component.js';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { Set as ImmutableSet } from 'immutable';

export type TrayEntry =
  | { readonly kind: 'job'; readonly job: JobModel }
  | { readonly kind: 'batch'; readonly batchId: string; readonly jobs: readonly JobModel[] };

/**
 * The press-room floor's job tray — sheets pulled off the press and stacked
 * for pickup. Lives inside the app footer, expanded by default so progress is
 * visible without a click (frictionless by default; collapse is the opt-out).
 * Dismissal is choreographed here: a ticket plays its exit (JobTicketComponent's
 * Pulled Away) before this organism tells the tracker to actually drop it, so
 * the remaining tickets reflow instead of jumping. Jobs sharing a client-side
 * `batchId` (submitted together against one settings form) group into one
 * `BatchTicketComponent` instead of N separate tickets.
 */
@Component({
  selector: 'app-job-tray',
  standalone: true,
  imports: [CommonModule, JobTicketComponent, BatchTicketComponent, IconComponent],
  templateUrl: './job-tray.component.html',
})
export class JobTrayComponent {
  private readonly _leavingIds = signal(ImmutableSet<string>());

  readonly jobs = input<readonly JobModel[]>([]);
  readonly cancelJob = output<string>();
  readonly dismissJob = output<string>();
  readonly cancelBatch = output<string>();
  readonly dismissBatch = output<string>();

  readonly expanded = signal(true);
  readonly activeCount = computed(() => this.jobs().filter((job) => job.isActive).length);

  /** Groups consecutive-by-arrival jobs sharing a `batchId` into one tray entry, in first-seen order. */
  readonly entries = computed<readonly TrayEntry[]>(() => {
    const result: TrayEntry[] = [];
    const batchIndex = new Map<string, number>();

    for (const job of this.jobs()) {
      if (job.batchId) {
        const idx = batchIndex.get(job.batchId);

        if (idx !== undefined) {
          const entry = result[idx];

          if (entry.kind === 'batch') {
            result[idx] = { ...entry, jobs: [...entry.jobs, job] };
          }
        } else {
          batchIndex.set(job.batchId, result.length);
          result.push({ kind: 'batch', batchId: job.batchId, jobs: [job] });
        }
      } else {
        result.push({ kind: 'job', job });
      }
    }

    return result;
  });


  toggle(): void {
    this.expanded.update((value) => !value);
  }

  isLeaving(id: string): boolean {
    return this._leavingIds().has(id);
  }

  requestDismiss(id: string): void {
    this._leavingIds.update((set) => set.add(id));
  }

  onLeftView(id: string): void {
    this.dismissJob.emit(id);
    this._leavingIds.update((set) => set.delete(id));
  }
}
