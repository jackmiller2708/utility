import { Data } from "effect";

/** The preflight resolved the URL to yt-dlp's generic/direct-file extractor rather than a real, named site. */
export class UnsupportedSourceError extends Data.TaggedError("UnsupportedSourceError")<{
  readonly url: string;
  readonly message: string;
}> {}

/** yt-dlp ran against a real extractor but the operation failed — a bad format selector, a removed video, a network failure, or any other runtime failure yt-dlp itself reports. */
export class DownloadError extends Data.TaggedError("DownloadError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
