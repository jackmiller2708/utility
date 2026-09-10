import { Data } from "effect";

export class InvalidImageError extends Data.TaggedError("InvalidImageError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export class UnsupportedImageFormatError extends Data.TaggedError("UnsupportedImageFormatError")<{
  readonly format: string;
  readonly message: string;
}> {}

export class ImageProcessingError extends Data.TaggedError("ImageProcessingError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
