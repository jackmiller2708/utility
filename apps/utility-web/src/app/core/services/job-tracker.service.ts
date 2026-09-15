import type { JobSubmittedResponse } from '@utility/protocol';
import type { HttpResponse } from '../interfaces';
import type { Observable } from 'rxjs';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { JobModel, JobModelsFromJobListResponse } from '../../domain';
import { Either } from 'effect';
import { tap, forkJoin, map } from 'rxjs';
import { Map as ImmutableMap, Set as ImmutableSet } from 'immutable';

const POLL_INTERVAL_MS = 900;
/** Consecutive failed polls (server unreachable — e.g. mid-restart) before active jobs are treated as dropped rather than left spinning silently forever. */
const POLL_FAILURE_THRESHOLD = 5;

/**
 * Shown for a job with no retry context (a single-file submission, or the rare case a batch
 * job's context is already gone) — honest about the server having lost it, but with nothing
 * of ours left to resubmit automatically.
 */
const SESSION_LOST_MESSAGE = 'Lost track of this job — the server restarted while it was running. Please retry.';
/** Shown only after a batch job has already been silently retried once and dropped again. */
const OVERRUN_MESSAGE = "This file didn't make it through twice — it's likely too large for the press to run in one pass. Try a smaller batch, or resize a copy down first.";

let batchIdCounter = 0;
const nextBatchId = () => `batch_${Date.now()}_${(++batchIdCounter).toString(36)}`;

let ticketIdCounter = 0;
const nextTicketId = () => `ticket_${Date.now()}_${(++ticketIdCounter).toString(36)}`;

/** What's needed to silently resubmit a dropped batch job once, without bothering the user. */
interface RetryContext {
  readonly file: File;
  readonly operationId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly batchId?: string;
  readonly label: string;
  readonly retried: boolean;
}

/**
 * The app-wide job ledger: submits jobs, polls `GET /jobs` while any are
 * active, and exposes the live list to both the footer tray (every job, every
 * tool) and each workbench's own inline progress (its own job, filtered by id).
 * `GET /jobs` already returns the server's full authoritative history, so
 * dismissing a finished ticket is tracked locally rather than asked of the
 * server, which has no delete-from-history concept.
 *
 * A job's server-assigned id can change out from under a ticket — a dropped
 * batch job silently resubmits under a new id (see `_attemptRetry`) — so every
 * `JobModel` also carries a `ticketId` that stays stable across that swap;
 * templates track by `ticketId`, never by `id`, so a silent retry never reads
 * as the ticket leaving and a new one arriving.
 */
@Injectable({ providedIn: 'root' })
export class JobTrackerService {
  private readonly apiClient = inject(ApiClientService);

  private readonly _jobs = signal<readonly JobModel[]>([]);
  private _labels = ImmutableMap<string, string>();
  /** Client-side batch grouping — the backend has no batch concept, every job it tracks is independent. */
  private _batchIds = ImmutableMap<string, string>();
  /** Current job id -> the ticket's stable client-side id (survives a silent retry's id change). */
  private _ticketIds = ImmutableMap<string, string>();
  /** Current job id -> what's needed to silently resubmit it once if the server drops it. Only populated for batch submissions — see `submitBatch$`. */
  private _retryContext = ImmutableMap<string, RetryContext>();
  /** Ticket ids with a resubmission in flight — excluded from lost-job detection so the placeholder isn't flagged lost again while its retry is still pending. */
  private _retrying = ImmutableSet<string>();
  private _dismissedIds = ImmutableSet<string>();
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private _consecutivePollFailures = 0;

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
   * 10 images the same way — in one HTTP request (`ApiClientService.submitBatchJob$`), and tags
   * every resulting job with one client-generated `batchId` so the tray can group them into a
   * single ticket. Every job stays as independent, pollable, and cancellable as if it had been
   * submitted separately; only the submission round-trip is shared. Each job also keeps enough
   * context (its file, params) to silently resubmit itself once if the server drops it — see
   * `_attemptRetry`.
   */
  submitBatch$(
    operationId: string,
    files: readonly File[],
    params: Readonly<Record<string, unknown>>
  ): Observable<{ batchId: string; succeeded: number; failed: number }> {
    const batchId = nextBatchId();
    const filesByName = new Map(files.map((file) => [file.name, file]));

    return this.apiClient.submitBatchJob$(operationId, files, params).pipe(
      tap((response) => Either.match(response, {
        onRight: ({ jobs }) => {
          for (const { jobId, filename } of jobs) {
            const file = filesByName.get(filename);
            this._registerJob(jobId, operationId, filename, batchId, file ? { file, operationId, params, batchId, label: filename } : undefined);
          }
        },
        onLeft: () => {},
      })),
      map((response) => Either.match(response, {
        onRight: ({ jobs }) => ({ batchId, succeeded: jobs.length, failed: 0 }),
        onLeft: () => ({ batchId, succeeded: 0, failed: files.length }),
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
    this._forgetJob(id);
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

  private _forgetJob(jobId: string): void {
    this._labels = this._labels.delete(jobId);
    this._batchIds = this._batchIds.delete(jobId);
    this._ticketIds = this._ticketIds.delete(jobId);
    this._retryContext = this._retryContext.delete(jobId);
  }

  private _registerJob(jobId: string, operationId: string, label: string, batchId?: string, retryable?: Omit<RetryContext, 'retried'>): void {
    const ticketId = nextTicketId();

    this._labels = this._labels.set(jobId, label);
    this._ticketIds = this._ticketIds.set(jobId, ticketId);
    if (batchId) {
      this._batchIds = this._batchIds.set(jobId, batchId);
    }
    if (retryable) {
      this._retryContext = this._retryContext.set(jobId, { ...retryable, retried: false });
    }

    this._jobs.update((list) => [
      ...list,
      new JobModel({
        id: jobId,
        ticketId,
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

  /**
   * A job that's active in our own list but absent from the server's (or the server's been
   * unreachable across several polls) was dropped mid-run — its process restarted, and job
   * state is in-memory only (see `JobRegistry`). Two ways to handle that, chosen per job:
   *
   * - It still has retry context and hasn't used its one resubmission yet: fire `_attemptRetry`,
   *   which keeps the ticket showing an ordinary queued state under the hood — no failure ever
   *   renders for a first drop that recovers.
   * - Otherwise (no context — a single-file submission — or already retried once): surface a
   *   real, terminal failure now, worded for which of those two happened.
   *
   * Returns the jobs that should render as failed this tick; jobs sent for a silent retry are
   * *not* included; call `_pollPlaceholders()` to fold their in-flight ticket state back in.
   */
  private _handleLostJobs(lost: readonly JobModel[]): readonly JobModel[] {
    const stillLost: JobModel[] = [];

    for (const job of lost) {
      const context = this._retryContext.get(job.id);

      if (context && !context.retried) {
        this._attemptRetry(job.id, job.ticketId, context);
        continue;
      }

      stillLost.push(new JobModel({
        ...job,
        status: 'failed',
        error: context ? OVERRUN_MESSAGE : SESSION_LOST_MESSAGE,
        failureKind: context ? 'overrun' : 'session-lost',
        completedAt: job.completedAt ?? new Date().toISOString(),
      }));
    }

    return stillLost;
  }

  /** Tickets currently mid-silent-retry — kept in the list as-is so the placeholder survives the tick that fired `_attemptRetry` until its response lands. */
  private _pollPlaceholders(freshIds: ReadonlySet<string>): readonly JobModel[] {
    return this._jobs().filter((job) => this._retrying.has(job.ticketId) && !freshIds.has(job.id));
  }

  /** Silently resubmits one dropped job's file once. The ticket (same `ticketId`) stays visually queued throughout; only a second drop — of the retry itself, or of the job it creates — ever becomes a visible failure. */
  private _attemptRetry(oldJobId: string, ticketId: string, context: RetryContext): void {
    this._retrying = this._retrying.add(ticketId);

    // Keep the ticket showing as queued under its old id while the resubmission is in flight.
    this._jobs.update((list) => list.map((job) => job.ticketId === ticketId
      ? new JobModel({ ...job, status: 'pending', progress: null, error: null })
      : job
    ));

    this.apiClient.submitJob$(context.operationId, context.file, context.params).subscribe(Either.match({
      onRight: ({ jobId: newJobId }) => {
        this._forgetJob(oldJobId);
        this._labels = this._labels.set(newJobId, context.label);
        this._ticketIds = this._ticketIds.set(newJobId, ticketId);
        if (context.batchId) {
          this._batchIds = this._batchIds.set(newJobId, context.batchId);
        }
        this._retryContext = this._retryContext.set(newJobId, { ...context, retried: true });
        this._retrying = this._retrying.delete(ticketId);

        this._jobs.update((list) => list.map((job) => job.ticketId === ticketId
          ? new JobModel({ ...job, id: newJobId, status: 'pending' })
          : job
        ));
        this._ensurePolling();
      },
      onLeft: () => {
        this._retrying = this._retrying.delete(ticketId);

        this._jobs.update((list) => list.map((job) => job.ticketId === ticketId
          ? new JobModel({
            ...job,
            status: 'failed',
            error: OVERRUN_MESSAGE,
            failureKind: 'overrun',
            completedAt: new Date().toISOString(),
          })
          : job
        ));
      },
    }));
  }

  private _poll(): void {
    this.apiClient.listJobs$().subscribe(Either.match({
      onRight: (res) => {
        this._consecutivePollFailures = 0;

        const fresh = JobModelsFromJobListResponse.from(res)
          .filter((job) => !this._dismissedIds.has(job.id))
          .map((job) => job.withLabel(this._labels.get(job.id)).withBatchId(this._batchIds.get(job.id)).withTicketId(this._ticketIds.get(job.id)));

        const freshIds = new Set(fresh.map((job) => job.id));
        const lost = this._jobs().filter((job) =>
          job.isActive && !this._dismissedIds.has(job.id) && !freshIds.has(job.id) && !this._retrying.has(job.ticketId)
        );
        const stillLost = this._handleLostJobs(lost);
        const placeholders = this._pollPlaceholders(freshIds);
        // A job JobTrackerService itself failed (Overrun/session-lost) has no server-side
        // record under any id, so it can never appear in `fresh` again — without carrying it
        // forward here, this tick's full rebuild of `_jobs` below would silently drop it the
        // moment it turns terminal, erasing the very failure ticket the user is meant to see.
        const clientOnlyTerminal = this._jobs().filter((job) => job.failureKind && !freshIds.has(job.id));

        this._jobs.set([...fresh, ...stillLost, ...placeholders, ...clientOnlyTerminal]);

        if (!fresh.some((job) => job.isActive) && stillLost.length === 0 && placeholders.length === 0 && this.pollHandle) {
          clearInterval(this.pollHandle);
          this.pollHandle = undefined;
        }
      },
      onLeft: () => {
        this._consecutivePollFailures++;

        if (this._consecutivePollFailures < POLL_FAILURE_THRESHOLD) {
          return;
        }

        // The server's been unreachable across several polls in a row (not one blip) — stop
        // leaving active tickets spinning forever with no explanation.
        const active = this._jobs().filter((job) => job.isActive && !this._retrying.has(job.ticketId));
        if (active.length === 0) {
          return;
        }

        const activeIds = new Set(active.map((job) => job.id));
        // May itself mutate `_jobs`/`_retrying` synchronously (via `_attemptRetry`) for any job
        // eligible for a silent retry — read `_jobs()` fresh below rather than reusing `active`.
        const stillLost = this._handleLostJobs(active);
        const retryingNow = this._jobs().filter((job) => this._retrying.has(job.ticketId));

        this._jobs.update((list) => [
          ...list.filter((job) => !activeIds.has(job.id) && !this._retrying.has(job.ticketId)),
          ...stillLost,
          ...retryingNow,
        ]);
      },
    }));
  }
}
