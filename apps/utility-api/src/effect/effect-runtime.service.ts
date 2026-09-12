import {
  Injectable,
  OnModuleInit,
  HttpException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { Effect, Layer, ManagedRuntime, Cause } from "effect";
import {
  FileSystemLive,
  ProcessLive,
  WorkspaceManagerLive,
  ArtifactStoreLive,
  ArtifactNotFoundError,
  FileSystemError,
  WorkspaceError,
  ProcessError,
  ArtifactError,
} from "@utility/runtime";
import {
  ToolRegistry,
  makeToolRegistry,
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

// Compose the full Live layer
export const AppLive = Layer.mergeAll(
  FileSystemLive,
  ProcessLive,
  WorkspaceManagerLive.pipe(Layer.provide(FileSystemLive)),
  ArtifactStoreLive.pipe(Layer.provide(FileSystemLive)),
  SharpImageServiceLive,
  PopplerPdfServiceLive.pipe(Layer.provide(Layer.mergeAll(ProcessLive, FileSystemLive))),
  FfmpegMediaServiceLive.pipe(Layer.provide(ProcessLive)),
  toolRegistryLayer,
  JobRegistryLive,
  WorkflowRegistryLive.pipe(
    Layer.provide(Layer.mergeAll(toolRegistryLayer, FileSystemLive, ArtifactStoreLive.pipe(Layer.provide(FileSystemLive))))
  )
).pipe(Layer.orDie);

export type AppServices = Layer.Layer.Success<typeof AppLive>;

@Injectable()
export class EffectRuntimeService implements OnModuleInit {
  private runtime!: ManagedRuntime.ManagedRuntime<AppServices, never>;

  async onModuleInit() {
    this.runtime = ManagedRuntime.make(AppLive);
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
      error instanceof FileSystemError ||
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
