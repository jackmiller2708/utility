import type { JobSubmittedResponse } from '@utility/protocol';
import type { HttpResponse } from '../interfaces.js';
import type { Observable } from 'rxjs';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from './api-client.service.js';
import { JobModel, JobModelsFromJobListResponse } from '../../domain/index.js';
import { Either } from 'effect';
import { tap } from 'rxjs';

const POLL_INTERVAL_MS = 900;

/**
 * The app-wide job ledger: submits jobs, polls `GET /jobs` while any are
 * active, and exposes the live list to both the footer tray (every job, every
 * tool) and each workbench's own inline progress (its own job, filtered by id).
 * `GET /jobs` already returns the server's full authoritative history, so
 * dismissing a finished ticket is tracked locally rather than asked of the
 * server, which has no delete-from-history concept.
 */
@Injectable({ providedIn: 'root' })
export class JobTrackerService {
  private readonly apiClient = inject(ApiClientService);

  private readonly _jobs = signal<readonly JobModel[]>([]);
  private readonly _labels = new Map<string, string>();
  private readonly _dismissedIds = new Set<string>();
  private pollHandle: ReturnType<typeof setInterval> | undefined;

  readonly jobs = this._jobs.asReadonly();
  readonly activeCount = computed(() => this._jobs().filter((job) => job.isActive).length);

  /** Registers the job the moment submission succeeds, then returns the same observable so the caller still handles its own success/error UI. */
  submit$(operationId: string, label: string, request$: Observable<HttpResponse<JobSubmittedResponse>>): Observable<HttpResponse<JobSubmittedResponse>> {
    return request$.pipe(
      tap((response) => Either.match(response, {
        onRight: ({ jobId }) => this._registerJob(jobId, operationId, label),
        onLeft: () => {},
      }))
    );
  }

  cancel(id: string): void {
    this.apiClient.cancelJob$(id).subscribe();
  }

  dismiss(id: string): void {
    this._dismissedIds.add(id);
    this._labels.delete(id);
    this._jobs.update((list) => list.filter((job) => job.id !== id));
  }

  private _registerJob(jobId: string, operationId: string, label: string): void {
    this._labels.set(jobId, label);
    this._jobs.update((list) => [
      ...list,
      new JobModel({
        id: jobId,
        operationId,
        status: 'pending',
        progress: null,
        result: null,
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        label,
      }),
    ]);
    this._ensurePolling();
  }

  private _ensurePolling(): void {
    if (this.pollHandle) {
      return;
    }

    this.pollHandle = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    this._poll();
  }

  private _poll(): void {
    this.apiClient.listJobs$().subscribe(Either.match({
      onRight: (res) => {
        const fresh = JobModelsFromJobListResponse.from(res)
          .filter((job) => !this._dismissedIds.has(job.id))
          .map((job) => job.withLabel(this._labels.get(job.id)));

        this._jobs.set(fresh);

        if (!fresh.some((job) => job.isActive) && this.pollHandle) {
          clearInterval(this.pollHandle);
          this.pollHandle = undefined;
        }
      },
      onLeft: () => {},
    }));
  }
}
