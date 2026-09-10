import { Data } from "effect";

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly operation: string;
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
  readonly message: string;
  readonly workspaceId?: string;
  readonly cause?: unknown;
}> {}

export class ProcessError extends Data.TaggedError("ProcessError")<{
  readonly executable: string;
  readonly message: string;
  readonly exitCode?: number;
  readonly stderr?: string;
  readonly cause?: unknown;
}> {}

export class ArtifactError extends Data.TaggedError("ArtifactError")<{
  readonly message: string;
  readonly artifactId?: string;
  readonly cause?: unknown;
}> {}

export class ArtifactNotFoundError extends Data.TaggedError("ArtifactNotFoundError")<{
  readonly artifactId: string;
  readonly message?: string;
}> {}
