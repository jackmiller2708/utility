import type { PlatformError } from "@effect/platform/Error";

import { Controller, Get, Post, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFiles, NotFoundException } from "@nestjs/common";
import { ToolRegistry, JobRegistry, JobProgress, trackJob, Operation } from "@utility/toolkit";
import { WorkspaceManager, WorkspaceInstance } from "@utility/runtime";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

interface MulterUploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Coerces a raw multipart form value according to the operation's declared parameter type. */
function coerceParamValue(type: string, raw: string): unknown {
  switch (type) {
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true";
    case "string": {
      const trimmed = raw.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return raw;
        }
      }
      return raw;
    }
    default:
      return raw;
  }
}

/**
 * Builds an operation's input generically from uploaded files + body fields, using the
 * operation's own declared `parameters` to know which field carries file(s) and how to
 * coerce every other field. This is what lets `POST /jobs/:operationId` work for any
 * registered operation without per-operation controller code.
 */
function prepareJobInput(
  fs: FileSystem.FileSystem,
  ws: WorkspaceInstance,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  op: Operation<any, any, any, any>,
  files: readonly MulterUploadedFile[],
  body: Record<string, string>
): Effect.Effect<Record<string, unknown>, PlatformError | Error> {
  return Effect.gen(function* () {
    const input: Record<string, unknown> = {};
    const fileParam = op.parameters.find((p) => p.type === "file");

    // A "files" parameter (e.g. pdf.merge) is the only one built to take more than one
    // upload; every other operation's own contract is exactly one file. Without this guard,
    // extra uploads to a singular "file" param would be written to the workspace (each
    // resolved through `prepareJobInput`'s numbered-prefix naming below) but silently
    // dropped from the built input, since only `filenames[0]` is ever assigned to it —
    // exactly the shape a future batch-upload UI could trigger by accident. A batch is
    // multiple independent jobs (one `POST` per file), not multiple files in one job.
    if (fileParam && fileParam.name !== "files" && files.length > 1) {
      return yield* Effect.fail(
        new Error(
          `Operation "${op.id}" accepts a single file ("${fileParam.name}"); received ${files.length}. Submit one job per file instead of batching files into one job.`
        )
      );
    }

    if (fileParam && files.length > 0) {
      const filenames: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const filename = files.length > 1 ? `${i}_${files[i].originalname || "input"}` : files[i].originalname || "input";
        yield* fs.writeFile(ws.resolveInputPath(filename), files[i].buffer);
        filenames.push(filename);
      }

      input[fileParam.name] = fileParam.name === "files" ? filenames : filenames[0];
    }

    for (const param of op.parameters) {
      if (param.type === "file") {
        continue;
      }
      const raw = body[param.name];
      if (raw !== undefined) {
        input[param.name] = coerceParamValue(param.type, raw);
      }
    }

    return input;
  });
}

/**
 * Bounds how many jobs actually execute (decode/process) at once, process-wide — submitting
 * a batch of N files from the UI fires N `POST /jobs/:operationId` requests essentially
 * simultaneously, and without this, N jobs would start executing concurrently too. A single
 * large photo can hold 100+ MB of decoded pixel data in memory at once; this container has a
 * fixed `memory: 512M` cgroup limit (see docker-compose.yml), and letting even two or three
 * such jobs decode concurrently reliably exceeds it and gets the whole process OOM-killed —
 * which silently drops every in-flight job when Docker restarts the container, since job
 * state lives only in memory. A job still shows up immediately as "pending" on submission; it
 * just waits here for a permit before it actually starts running. Raise this only alongside
 * the memory limit it's sized against.
 */
const jobExecutionLimiter = Effect.runSync(Effect.makeSemaphore(1));

@UseGuards(DeviceAuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(private readonly effectRuntime: EffectRuntimeService) {}

  @Post(":operationId")
  @UseInterceptors(AnyFilesInterceptor())
  async submitJob(
    @Param("operationId") operationId: string,
    @UploadedFiles() files: MulterUploadedFile[] = [],
    @Body() body: Record<string, string> = {}
  ) {
    const jobId = await this.submitOneJob(operationId, files, body);
    return { jobId };
  }

  /**
   * One HTTP request that creates N independent jobs, one per uploaded file, against a single
   * shared parameter set — the server-side counterpart to `JobTrackerService`'s batch submission.
   * Collapses what used to be N simultaneous `POST /jobs/:operationId` requests (one per file,
   * all fired at once from the browser) into a single request; every resulting job is still
   * exactly as independent, pollable, cancellable, and concurrency-limited (`jobExecutionLimiter`
   * above) as if it had been submitted the old way — only the submission round-trip changes.
   * Each file becomes its own job with exactly that one file, never a multi-file input, so this
   * only makes sense for single-file operations (image.resize, media.thumbnail, a recipe's
   * `recipe.<id>`, …), never a "files"-plural operation like pdf.merge.
   */
  @Post(":operationId/batch")
  @UseInterceptors(AnyFilesInterceptor())
  async submitBatch(
    @Param("operationId") operationId: string,
    @UploadedFiles() files: MulterUploadedFile[] = [],
    @Body() body: Record<string, string> = {}
  ) {
    const jobs = await Promise.all(
      files.map(async (file) => ({
        jobId: await this.submitOneJob(operationId, [file], body),
        filename: file.originalname,
      }))
    );

    return { jobs };
  }

  /**
   * Creates one job and starts its (concurrency-gated) execution in the background, returning
   * as soon as the job record exists rather than waiting for it to run. Shared by the single-file
   * and batch routes above — `files` holds more than one upload only for a "files"-typed
   * parameter (e.g. pdf.merge); the batch route above always calls this with a single-element
   * array.
   */
  private async submitOneJob(
    operationId: string,
    files: MulterUploadedFile[],
    body: Record<string, string>
  ): Promise<string> {
    const jobId = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* ToolRegistry;
        const jobRegistry = yield* JobRegistry;

        const op = yield* registry.getOperation(operationId);
        if (!op) {
          return yield* Effect.fail(new NotFoundException(`Operation ${operationId} not found`));
        }

        const job = yield* jobRegistry.createJob(operationId);
        return job.id;
      })
    );

    const jobEffect = Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      const jobRegistry = yield* JobRegistry;
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      const op = yield* registry.getOperation(operationId);
      if (!op) {
        return yield* Effect.fail(new NotFoundException(`Operation ${operationId} not found`));
      }

      const runEffect = wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const input = yield* prepareJobInput(fs, ws, op, files, body);

          const reportProgress = (progress: JobProgress) => {
            Effect.runSync(jobRegistry.updateProgress(jobId, progress));
          };

          return yield* op.execute(input, { workspace: ws, reportProgress });
        })
      );

      yield* jobExecutionLimiter.withPermits(1)(trackJob(jobRegistry, jobId, runEffect));
    });

    const fiber = this.effectRuntime.runFork(jobEffect);

    // Best-effort: lets a near-immediate cancel request interrupt the fiber. A cancel that
    // races ahead of this attach simply reports "not cancellable yet" rather than erroring.
    this.effectRuntime
      .runPromise(
        Effect.gen(function* () {
          const jobRegistry = yield* JobRegistry;
          yield* jobRegistry.attachFiber(jobId, fiber);
        })
      )
      .catch(() => {});

    return jobId;
  }

  @Get()
  async listJobs() {
    const jobs = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const jobRegistry = yield* JobRegistry;
        return yield* jobRegistry.listJobs();
      })
    );

    return { jobs };
  }

  @Get(":id")
  async getJob(@Param("id") id: string) {
    return this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const jobRegistry = yield* JobRegistry;
        const job = yield* jobRegistry.getJob(id);

        if (!job) {
          return yield* Effect.fail(new NotFoundException(`Job ${id} not found`));
        }

        return job;
      })
    );
  }

  @Delete(":id")
  async cancelJob(@Param("id") id: string) {
    const cancelled = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const jobRegistry = yield* JobRegistry;
        return yield* jobRegistry.cancelJob(id);
      })
    );

    return { cancelled };
  }
}
