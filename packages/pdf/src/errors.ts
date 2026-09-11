import { Data } from "effect";

export class InvalidPdfError extends Data.TaggedError("InvalidPdfError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export class PdfProcessingError extends Data.TaggedError("PdfProcessingError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
