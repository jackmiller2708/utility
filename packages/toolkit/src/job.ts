import { Context, Effect, Layer, Fiber, Cause, Exit } from "effect";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobProgress {
  readonly completed: number;
  readonly total: number;
  readonly message?: string;
}

/** Threaded through `OperationContext` so an operation can report incremental progress when run as a job. A no-op when the operation runs synchronously. */
export type ProgressReporter = (progress: JobProgress) => void;

export interface Job {
  readonly id: string;
  readonly operationId: string;
  readonly status: JobStatus;
  readonly progress: JobProgress | null;
  readonly result: unknown | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

interface JobRecord {
  job: Job;
  fiber: Fiber.RuntimeFiber<unknown, unknown> | null;
}

export interface JobRegistry {
  readonly createJob: (operationId: string) => Effect.Effect<Job>;
  readonly attachFiber: (id: string, fiber: Fiber.RuntimeFiber<unknown, unknown>) => Effect.Effect<void>;
  readonly markRunning: (id: string) => Effect.Effect<void>;
  readonly updateProgress: (id: string, progress: JobProgress) => Effect.Effect<void>;
  readonly markCompleted: (id: string, result: unknown) => Effect.Effect<void>;
  readonly markFailed: (id: string, error: string) => Effect.Effect<void>;
  readonly markCancelled: (id: string) => Effect.Effect<void>;
  readonly getJob: (id: string) => Effect.Effect<Job | undefined>;
  readonly listJobs: () => Effect.Effect<readonly Job[]>;
  /** Requests interruption of the job's running fiber. Returns false when the job isn't running (already finished, or unknown id). */
  readonly cancelJob: (id: string) => Effect.Effect<boolean>;
}

export const JobRegistry = Context.GenericTag<JobRegistry>("@utility/toolkit/JobRegistry");

let jobIdCounter = 0;
const nextJobId = () => `job_${Date.now()}_${(++jobIdCounter).toString(36)}`;

export const makeJobRegistry = () =>
  Layer.sync(JobRegistry, () => {
    const jobs = new Map<string, JobRecord>();

    const update = (id: string, patch: Partial<Job>): void => {
      const record = jobs.get(id);

      if (record) {
        record.job = { ...record.job, ...patch };
      }
    };

    return JobRegistry.of({
      createJob: (operationId: string) => Effect.sync(() => {
        const job: Job = {
          id: nextJobId(),
          operationId,
          status: "pending",
          progress: null,
          result: null,
          error: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        };
        jobs.set(job.id, { job, fiber: null });

        return job;
      }),

      attachFiber: (id: string, fiber: Fiber.RuntimeFiber<unknown, unknown>) => Effect.sync(() => {
        const record = jobs.get(id);

        if (record) {
          record.fiber = fiber;
        }
      }),

      markRunning: (id: string) => Effect.sync(() => update(id, { status: "running", startedAt: new Date().toISOString() })),

      updateProgress: (id: string, progress: JobProgress) => Effect.sync(() => update(id, { progress })),

      markCompleted: (id: string, result: unknown) => Effect.sync(() => update(id, { status: "completed", result, completedAt: new Date().toISOString() })),

      markFailed: (id: string, error: string) => Effect.sync(() => update(id, { status: "failed", error, completedAt: new Date().toISOString() })),

      markCancelled: (id: string) => Effect.sync(() => update(id, { status: "cancelled", completedAt: new Date().toISOString() })),

      getJob: (id: string) => Effect.sync(() => jobs.get(id)?.job),

      listJobs: () => Effect.sync(() => Array.from(jobs.values()).map((r) => r.job).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),

      cancelJob: (id: string) => Effect.gen(function* () {
        const record = jobs.get(id);

        if (!record || !record.fiber || record.job.status !== "running" && record.job.status !== "pending") {
          return false;
        }

        yield* Fiber.interrupt(record.fiber);

        return true;
      }),
    });
  });

export const JobRegistryLive = makeJobRegistry();

/**
 * Wraps an operation's effect so its outcome updates the job record automatically —
 * including on interruption. Uses `Effect.onExit` rather than sequencing status
 * updates after `Effect.exit`: interrupting a fiber tears down every remaining step
 * in that fiber, so plain `yield*` calls placed after an awaited exit can themselves
 * be interrupted before they run. `onExit`'s finalizer is guaranteed to run, and to
 * run uninterruptibly, so the job's final status is never lost to that race.
 */
export const trackJob = <A, E, R>(registry: JobRegistry, jobId: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    yield* registry.markRunning(jobId);
    return yield* effect;
  }).pipe(Effect.onExit((exit) => {
    if (Exit.isSuccess(exit)) {
      return registry.markCompleted(jobId, exit.value);
    }

    if (Cause.isInterruptedOnly(exit.cause)) {
      return registry.markCancelled(jobId);
    }

    const failure = Cause.failureOption(exit.cause);
    const message = failure._tag === "Some"
      ? (failure.value instanceof Error ? failure.value.message : String(failure.value))
      : Cause.pretty(exit.cause);

    return registry.markFailed(jobId, message);
  })
);
