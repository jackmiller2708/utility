import { Data } from "effect";

export class InvalidMediaError extends Data.TaggedError("InvalidMediaError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export class MediaProcessingError extends Data.TaggedError("MediaProcessingError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
