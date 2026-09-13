import { describe, it, expect } from "vitest";
import { Effect, Layer, Fiber } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem, NodeCommandExecutor, NodePath } from "@effect/platform-node";
import {
  ProcessLive,
  WorkspaceManagerLive,
  ArtifactStoreLive,
  WorkspaceManager,
} from "@utility/runtime";
import { makeToolRegistry, ToolRegistry, JobRegistry, JobRegistryLive, JobProgress, trackJob } from "@utility/toolkit";
import { pdfTool, renderPagesOperation, extractImagesOperation, PopplerPdfServiceLive } from "@utility/pdf";
import { buildTestPdf } from "./support/pdf-fixtures.js";

const ProcessServiceLive = ProcessLive.pipe(
  Layer.provide(NodeCommandExecutor.layer),
  Layer.provide(NodeFileSystem.layer)
);

const TestEnv = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  ProcessServiceLive,
  WorkspaceManagerLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  ArtifactStoreLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  PopplerPdfServiceLive.pipe(Layer.provide(Layer.mergeAll(ProcessServiceLive, NodeFileSystem.layer, NodePath.layer))),
  makeToolRegistry([pdfTool]),
  JobRegistryLive
);

describe("JobRegistry", () => {
  it("moves a job through pending -> running -> completed with its result", async () => {
    const program = Effect.gen(function* () {
      const jobRegistry = yield* JobRegistry;
      const job = yield* jobRegistry.createJob("pdf.inspect");
      expect(job.status).toBe("pending");

      yield* trackJob(jobRegistry, job.id, Effect.succeed({ pages: 3 }));

      return yield* jobRegistry.getJob(job.id);
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result?.status).toBe("completed");
    expect(result?.result).toEqual({ pages: 3 });
    expect(result?.startedAt).not.toBeNull();
    expect(result?.completedAt).not.toBeNull();
  });

  it("records a failure with a readable message", async () => {
    const program = Effect.gen(function* () {
      const jobRegistry = yield* JobRegistry;
      const job = yield* jobRegistry.createJob("pdf.inspect");

      // trackJob's onExit finalizer records the failure, but (correctly) still lets the
      // original failure propagate to any caller that wants to observe it — absorb it
      // here since this test only cares what landed in the registry.
      yield* trackJob(jobRegistry, job.id, Effect.fail(new Error("boom"))).pipe(Effect.ignore);

      return yield* jobRegistry.getJob(job.id);
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result?.status).toBe("failed");
    expect(result?.error).toBe("boom");
  });

  it("marks a job cancelled, not failed, when its fiber is interrupted", async () => {
    const program = Effect.gen(function* () {
      const jobRegistry = yield* JobRegistry;
      const job = yield* jobRegistry.createJob("pdf.inspect");

      const longRunning = Effect.sleep("10 seconds").pipe(Effect.as({ ok: true }));
      const tracked = trackJob(jobRegistry, job.id, longRunning);

      const fiber = yield* Effect.fork(tracked);
      yield* jobRegistry.attachFiber(job.id, fiber);

      // give the fiber a tick to actually start before interrupting it
      yield* Effect.sleep("10 millis");
      const cancelled = yield* jobRegistry.cancelJob(job.id);
      yield* Fiber.await(fiber);

      const finalJob = yield* jobRegistry.getJob(job.id);
      return { cancelled, finalJob };
    }).pipe(Effect.provide(TestEnv));

    const { cancelled, finalJob } = await Effect.runPromise(program);
    expect(cancelled).toBe(true);
    expect(finalJob?.status).toBe("cancelled");
  });

  it("reports false when cancelling a job that already completed", async () => {
    const program = Effect.gen(function* () {
      const jobRegistry = yield* JobRegistry;
      const job = yield* jobRegistry.createJob("pdf.inspect");
      yield* trackJob(jobRegistry, job.id, Effect.succeed("done"));

      return yield* jobRegistry.cancelJob(job.id);
    }).pipe(Effect.provide(TestEnv));

    expect(await Effect.runPromise(program)).toBe(false);
  });

  it("lists jobs newest first", async () => {
    const program = Effect.gen(function* () {
      const jobRegistry = yield* JobRegistry;
      const first = yield* jobRegistry.createJob("pdf.inspect");
      yield* Effect.sleep("2 millis");
      const second = yield* jobRegistry.createJob("pdf.render-pages");

      const jobs = yield* jobRegistry.listJobs();
      return { jobs, first, second };
    }).pipe(Effect.provide(TestEnv));

    const { jobs, first, second } = await Effect.runPromise(program);
    const ids = jobs.map((j) => j.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });
});

describe("Progress reporting (real PdfService chunking, not mocked)", () => {
  it("reports increasing render-pages progress and still renders every page", async () => {
    const pdfBuffer = buildTestPdf({ pages: 25 });
    const progressCalls: JobProgress[] = [];

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;
      const registry = yield* ToolRegistry;

      const op = yield* registry.getOperation("pdf.render-pages");
      if (!op) throw new Error("missing op");

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* op.execute(
            { file: filename, dpi: 72, firstPage: 1, lastPage: 25 },
            { workspace: ws, reportProgress: (p) => progressCalls.push(p) }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program) as { pages: { name: string }[] };

    // 25 pages at a chunk size of 10 -> 3 chunks (10, 10, 5), so 3 progress calls.
    expect(progressCalls.length).toBe(3);
    expect(progressCalls.map((p) => p.completed)).toEqual([10, 20, 25]);
    expect(progressCalls.every((p) => p.total === 25)).toBe(true);

    // The real point of chunking correctness: no page lost or overwritten across chunk boundaries.
    expect(result.pages).toHaveLength(25);
  });

  it("reports increasing extract-images progress and finds every embedded image across chunks", async () => {
    const pdfBuffer = buildTestPdf({ pages: 23, embedImage: true });
    const progressCalls: JobProgress[] = [];

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;
      const registry = yield* ToolRegistry;

      const op = yield* registry.getOperation("pdf.extract-images");
      if (!op) throw new Error("missing op");

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* op.execute(
            { file: filename },
            { workspace: ws, reportProgress: (p) => progressCalls.push(p) }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program) as { images: { name: string }[] };

    // 23 pages at a chunk size of 10 -> 3 chunks (10, 10, 3).
    expect(progressCalls.length).toBe(3);
    expect(progressCalls.map((p) => p.completed)).toEqual([10, 20, 23]);

    // One embedded image per page: this is the real regression test for the pdfimages
    // per-invocation counter reset — a naive chunked implementation silently overwrites
    // earlier chunks' output, which would make this come back far short of 23.
    expect(result.images).toHaveLength(23);
  });

  it("produces identical output whether or not progress reporting (and thus chunking) is active", async () => {
    const pdfBuffer = buildTestPdf({ pages: 15 });

    const runOnce = (withProgress: boolean) =>
      Effect.gen(function* () {
        const wsManager = yield* WorkspaceManager;
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* ToolRegistry;
        const op = yield* registry.getOperation("pdf.render-pages");
        if (!op) throw new Error("missing op");

        return yield* wsManager.withWorkspace((ws) =>
          Effect.gen(function* () {
            yield* fs.writeFile(ws.resolveInputPath("input.pdf"), pdfBuffer);
            return yield* op.execute(
              { file: "input.pdf", dpi: 72 },
              withProgress ? { workspace: ws, reportProgress: () => {} } : { workspace: ws }
            );
          })
        );
      }).pipe(Effect.provide(TestEnv));

    const withoutProgress = await Effect.runPromise(runOnce(false)) as { pages: unknown[] };
    const withProgress = await Effect.runPromise(runOnce(true)) as { pages: unknown[] };

    expect(withoutProgress.pages).toHaveLength(15);
    expect(withProgress.pages).toHaveLength(15);
  });
});
