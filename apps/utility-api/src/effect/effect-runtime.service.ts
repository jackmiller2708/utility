import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  HttpException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { Effect, Layer, ManagedRuntime, Cause } from "effect";
import { NodeFileSystem, NodeCommandExecutor, NodePath } from "@effect/platform-node";
import { isPlatformError } from "@effect/platform/Error";
import {
  ProcessLive,
  WorkspaceManagerLive,
  ArtifactStore,
  ArtifactStoreLive,
  ArtifactNotFoundError,
  WorkspaceError,
  ProcessError,
  ArtifactError,
} from "@utility/runtime";
import {
  ToolRegistry,
  makeToolRegistry,
  JobRegistry,
  JobRegistryLive,
  WorkflowRegistryLive,
  WorkflowValidationError,
  WorkflowStepError,
  WorkflowNotFoundError,
} from "@utility/toolkit";
import {
  imageTool,
  SharpImageServiceLive,
  InvalidImageError,
  UnsupportedImageFormatError,
  ImageProcessingError,
} from "@utility/image";
import {
  pdfTool,
  pdfMergeSplitTool,
  PopplerPdfServiceLive,
  InvalidPdfError,
  PdfProcessingError,
} from "@utility/pdf";
import {
  mediaTool,
  FfmpegMediaServiceLive,
  InvalidMediaError,
  MediaProcessingError,
} from "@utility/media";
import { SecurityError, ValidationError } from "@utility/domain";

const toolRegistryLayer = makeToolRegistry([imageTool, pdfTool, pdfMergeSplitTool, mediaTool]);

// Process, backed by Effect Platform's Command/CommandExecutor, needs a FileSystem to
// build the Node executor — so it isn't a fully closed layer on its own like ProcessLive
// used to be; every site that needs it provides FileSystem alongside it here.
const ProcessServiceLive = ProcessLive.pipe(
  Layer.provide(NodeCommandExecutor.layer),
  Layer.provide(NodeFileSystem.layer)
);

// Compose the full Live layer
export const AppLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  ProcessServiceLive,
  WorkspaceManagerLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  ArtifactStoreLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  SharpImageServiceLive,
  PopplerPdfServiceLive.pipe(Layer.provide(Layer.mergeAll(ProcessServiceLive, NodeFileSystem.layer, NodePath.layer))),
  FfmpegMediaServiceLive.pipe(Layer.provide(ProcessServiceLive)),
  toolRegistryLayer,
  JobRegistryLive,
  WorkflowRegistryLive.pipe(
    Layer.provide(Layer.mergeAll(
      toolRegistryLayer,
      NodeFileSystem.layer,
      NodePath.layer,
      ArtifactStoreLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))
    ))
  )
).pipe(Layer.orDie);

export type AppServices = Layer.Layer.Success<typeof AppLive>;

// Artifacts are derived output (image/PDF/media results the user already downloaded or can
// re-generate), so a week-long window trades a little "oops I needed that" risk for keeping
// disk usage bounded on a host with no database to page through instead.
const ARTIFACT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// Finished jobs are just status/progress bookkeeping for the UI — an hour past completion is
// far longer than anyone leaves a result tab open to poll it.
const JOB_RETENTION_MS = 60 * 60 * 1000;
// Backstop against a burst of short-lived jobs outrunning the hourly sweep.
const JOB_MAX_COUNT = 1000;
// Hourly matches the device-auth purge sweep — frequent enough for day/week-scale windows
// without pulling in a real scheduler dependency for a single-instance app.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class EffectRuntimeService implements OnModuleInit, OnModuleDestroy {
  private runtime!: ManagedRuntime.ManagedRuntime<AppServices, never>;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  async onModuleInit() {
    this.runtime = ManagedRuntime.make(AppLive);

    // Run once at startup (a long-idle deployment shouldn't wait a full sweep interval to
    // catch up), then keep sweeping periodically for as long as the process runs.
    this.sweepExpiredData().catch(() => {});
    this.sweepTimer = setInterval(() => {
      this.sweepExpiredData().catch(() => {});
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private async sweepExpiredData() {
    await this.runPromise(
      Effect.gen(function* () {
        const artifactStore = yield* ArtifactStore;
        const jobRegistry = yield* JobRegistry;

        yield* artifactStore.purgeExpiredArtifacts(ARTIFACT_RETENTION_MS);
        yield* jobRegistry.purgeOldJobs(JOB_RETENTION_MS, JOB_MAX_COUNT);
      })
    );
  }

  /** Starts an effect in the background and returns its fiber immediately, without waiting for completion. */
  runFork<A, E>(effect: Effect.Effect<A, E, AppServices>) {
    return this.runtime.runFork(effect);
  }

  async runPromise<A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> {
    const exit = await this.runtime.runPromiseExit(effect);

    if (exit._tag === "Success") {
      return exit.value;
    }

    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some") {
      const error = failure.value;
      throw this.mapErrorToHttpException(error);
    }

    // Die / Defect
    const prettyCause = Cause.pretty(exit.cause);
    throw new InternalServerErrorException(`Unexpected error: ${prettyCause}`);
  }

  private mapErrorToHttpException(error: unknown): HttpException {
    if (error instanceof NotFoundException) {
      return error;
    }

    if (error instanceof BadRequestException) {
      return error;
    }

    if (error instanceof ArtifactNotFoundError) {
      return new NotFoundException(error.message || `Artifact ${error.artifactId} not found`);
    }

    if (error instanceof ValidationError) {
      return new BadRequestException({
        message: error.message,
        issues: error.issues,
      });
    }

    if (error instanceof InvalidImageError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof UnsupportedImageFormatError) {
      return new BadRequestException(`Unsupported format: ${error.format}`);
    }

    if (error instanceof ImageProcessingError) {
      return new BadRequestException(`Image processing failed: ${error.message}`);
    }

    if (error instanceof InvalidPdfError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof PdfProcessingError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof InvalidMediaError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof MediaProcessingError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof WorkflowValidationError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof WorkflowStepError) {
      return new BadRequestException(
        `${error.message} (step ${error.stepIndex + 1}, operation "${error.operationId}")`
      );
    }

    if (error instanceof WorkflowNotFoundError) {
      return new NotFoundException(`Workflow ${error.workflowId} not found`);
    }

    if (error instanceof SecurityError) {
      return new ForbiddenException(error.message);
    }

    if (
      isPlatformError(error) ||
      error instanceof WorkspaceError ||
      error instanceof ProcessError ||
      error instanceof ArtifactError
    ) {
      return new InternalServerErrorException(error.message);
    }

    if (error instanceof Error) {
      return new BadRequestException(error.message);
    }

    return new InternalServerErrorException(String(error));
  }
}
