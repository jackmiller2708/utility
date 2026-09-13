import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { Effect } from "effect";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { ToolRegistry, JobRegistry, JobProgress, trackJob, Operation } from "@utility/toolkit";
import { WorkspaceManager, WorkspaceInstance } from "@utility/runtime";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";

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

      yield* trackJob(jobRegistry, jobId, runEffect);
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

    return { jobId };
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
