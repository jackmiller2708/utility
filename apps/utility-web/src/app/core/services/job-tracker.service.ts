import type { JobSubmittedResponse } from '@utility/protocol';
import type { HttpResponse } from '../interfaces.js';
import type { Observable } from 'rxjs';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from './api-client.service.js';
import { JobModel, JobModelsFromJobListResponse } from '../../domain/index.js';
import { Either } from 'effect';
import { tap, forkJoin, map } from 'rxjs';
import { Map as ImmutableMap, Set as ImmutableSet } from 'immutable';

const POLL_INTERVAL_MS = 900;

let batchIdCounter = 0;
const nextBatchId = () => `batch_${Date.now()}_${(++batchIdCounter).toString(36)}`;

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
  private _labels = ImmutableMap<string, string>();
  /** Client-side batch grouping — the backend has no batch concept, every job it tracks is independent. */
  private _batchIds = ImmutableMap<string, string>();
  private _dismissedIds = ImmutableSet<string>();
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

  /**
   * Submits one independent job per file against a single shared parameter set — e.g. resizing
   * 10 images the same way — and tags every resulting job with one client-generated `batchId` so
   * the tray can group them into a single ticket. Each submission is its own HTTP request (the
   * backend has no multi-job endpoint); they run concurrently and the returned observable settles
   * once every submission has resolved, successfully or not.
   */
  submitBatch$(
    operationId: string,
    files: readonly File[],
    params: Readonly<Record<string, unknown>>
  ): Observable<{ batchId: string; succeeded: number; failed: number }> {
    const batchId = nextBatchId();

    const submissions = files.map((file) =>
      this.apiClient.submitJob$(operationId, file, params).pipe(
        tap((response) => Either.match(response, {
          onRight: ({ jobId }) => this._registerJob(jobId, operationId, file.name, batchId),
          onLeft: () => {},
        }))
      )
    );

    return forkJoin(submissions).pipe(
      map((responses) => ({
        batchId,
        succeeded: responses.filter(Either.isRight).length,
        failed: responses.filter(Either.isLeft).length,
      }))
    );
  }

  cancel(id: string): void {
    this.apiClient.cancelJob$(id).subscribe();
  }

  /** Cancels every still-active job in a batch. */
  cancelBatch(batchId: string): void {
    for (const job of this._jobs()) {
      if (job.batchId === batchId && job.isActive) {
        this.cancel(job.id);
      }
    }
  }

  dismiss(id: string): void {
    this._dismissedIds = this._dismissedIds.add(id);
    this._labels = this._labels.delete(id);
    this._batchIds = this._batchIds.delete(id);
    this._jobs.update((list) => list.filter((job) => job.id !== id));
  }

  /** Dismisses every job in a batch at once. */
  dismissBatch(batchId: string): void {
    for (const job of this._jobs()) {
      if (job.batchId === batchId) {
        this.dismiss(job.id);
      }
    }
  }

  private _registerJob(jobId: string, operationId: string, label: string, batchId?: string): void {
    this._labels = this._labels.set(jobId, label);
    if (batchId) {
      this._batchIds = this._batchIds.set(jobId, batchId);
    }

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
        batchId,
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
          .map((job) => job.withLabel(this._labels.get(job.id)).withBatchId(this._batchIds.get(job.id)));

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
