import { Context, Effect, Layer } from "effect";
import { Process, ProcessError, WorkspaceInstance } from "@utility/runtime";
import { ProgressReporter } from "@utility/toolkit";
import { DownloadError, UnsupportedSourceError } from "./errors.js";

/**
 * Reads the one field this package's preflight cares about from yt-dlp's `--dump-json` output.
 * Malformed JSON here means yt-dlp exited 0 but printed something unreadable — a defect, not a
 * domain error — so this throws and is expected to be wrapped by the caller's `Effect.try`.
 */
export const parseExtractorKey = (dumpJsonStdout: string): string => {
  const parsed = JSON.parse(dumpJsonStdout) as { extractor_key?: string };
  return parsed.extractor_key ?? "Generic";
};

export interface VideoMetadata {
  readonly title: string;
  readonly thumbnailUrl?: string;
  readonly durationSeconds?: number;
  readonly uploader?: string;
}

/**
 * Reads the fields `video-download.info` reports from the same `--dump-json` payload
 * `parseExtractorKey` already reads the extractor from. A separate function, not a shared
 * parse, so each stays independently testable against its own single field set — the same
 * "one parser, one job" shape as `parseExtractorKey` and `parseFinalOutputPath`.
 */
export const parseVideoMetadata = (dumpJsonStdout: string): VideoMetadata => {
  const parsed = JSON.parse(dumpJsonStdout) as {
    title?: string;
    thumbnail?: string;
    duration?: number;
    uploader?: string;
  };

  return {
    title: parsed.title ?? "Untitled",
    thumbnailUrl: parsed.thumbnail,
    durationSeconds: parsed.duration,
    uploader: parsed.uploader,
  };
};

/** The one input-validation check this package performs: does yt-dlp recognize this URL as a real, named site, rather than falling through to its generic/direct-file extractor? */
export const assertSupportedExtractor = (extractorKey: string, url: string): Effect.Effect<void, UnsupportedSourceError> =>
  extractorKey === "Generic"
    ? Effect.fail(new UnsupportedSourceError({
        url,
        message: `No specific downloader recognizes this URL — only named sites are supported, not direct file links: ${url}`,
      }))
    : Effect.void;

/**
 * yt-dlp's `--print after_move:filepath` writes the real destination path to stdout as its own
 * line once its internal write/merge/rename is done. Reads the last non-empty line (rather than
 * assuming stdout is exactly one line) the same way `media`'s `parseLastFfmpegTime` reads
 * ffmpeg's own progress lines — trust the tail, not the shape. Returns the path as yt-dlp
 * reported it, untouched; stripping it down to a bare filename is the caller's job at the one
 * point that actually needs it (see `tool.ts`), not this function's.
 */
export const parseFinalOutputPath = (stdout: string): string => {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("["));
  const lastLine = lines[lines.length - 1];

  if (!lastLine) {
    throw new Error("yt-dlp reported no output path on stdout");
  }

  return lastLine;
};

/** Finds the last `NN.N%` yt-dlp prints to stdout as it downloads — same "read the last match in the accumulated buffer" approach `media`'s `parseLastFfmpegTime` uses for ffmpeg's progress. Returns null until the first progress line has arrived. */
export const parseDownloadPercent = (text: string): number | null => {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)%/g)];

  if (matches.length === 0) {
    return null;
  }

  return Number(matches[matches.length - 1][1]);
};

export interface VideoDownloadOptions {
  readonly format?: string;
}

export interface VideoDownloadService {
  readonly checkSourceSupported: (url: string) => Effect.Effect<void, UnsupportedSourceError | DownloadError>;
  readonly getInfo: (url: string) => Effect.Effect<VideoMetadata, UnsupportedSourceError | DownloadError>;
  readonly download: (
    url: string,
    workspace: WorkspaceInstance,
    options?: VideoDownloadOptions,
    onProgress?: ProgressReporter
  ) => Effect.Effect<string, UnsupportedSourceError | DownloadError>;
  readonly downloadAudio: (
    url: string,
    workspace: WorkspaceInstance,
    options?: VideoDownloadOptions,
    onProgress?: ProgressReporter
  ) => Effect.Effect<string, UnsupportedSourceError | DownloadError>;
}

export const VideoDownloadService = Context.GenericTag<VideoDownloadService>("@utility/video-download/VideoDownloadService");

const PREFLIGHT_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export const VideoDownloadServiceLive = Layer.effect(
  VideoDownloadService,
  Effect.gen(function* () {
    const process = yield* Process;

    /** The one `--dump-json` preflight call, shared by `checkSourceSupported` (reads only the extractor key) and `getInfo` (reads the display fields too) — one yt-dlp invocation per URL, not two. */
    const fetchDumpJson = (url: string, operation: string): Effect.Effect<string, DownloadError> =>
      process
        .spawn({
          executable: "yt-dlp",
          args: ["--dump-json", "--no-warnings", "--skip-download", "--no-playlist", "--", url],
          timeoutMs: PREFLIGHT_TIMEOUT_MS,
        })
        .pipe(
          Effect.map((res) => res.stdout),
          Effect.mapError((err: ProcessError) => new DownloadError({
            operation,
            message: `Could not resolve this URL: ${err.stderr?.trim() || err.message}`,
            cause: err,
          }))
        );

    const checkSourceSupported = (url: string): Effect.Effect<void, UnsupportedSourceError | DownloadError> =>
      fetchDumpJson(url, "video-download.check-source").pipe(
        Effect.flatMap((stdout) =>
          Effect.try({
            try: () => parseExtractorKey(stdout),
            catch: (cause) => new DownloadError({
              operation: "video-download.check-source",
              message: `yt-dlp reported unreadable metadata for this URL: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            }),
          }).pipe(Effect.flatMap((extractorKey) => assertSupportedExtractor(extractorKey, url)))
        )
      );

    const getInfo = (url: string): Effect.Effect<VideoMetadata, UnsupportedSourceError | DownloadError> =>
      fetchDumpJson(url, "video-download.info").pipe(
        Effect.flatMap((stdout) =>
          Effect.try({
            try: () => ({ extractorKey: parseExtractorKey(stdout), metadata: parseVideoMetadata(stdout) }),
            catch: (cause) => new DownloadError({
              operation: "video-download.info",
              message: `yt-dlp reported unreadable metadata for this URL: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            }),
          }).pipe(
            Effect.flatMap(({ extractorKey, metadata }) =>
              assertSupportedExtractor(extractorKey, url).pipe(Effect.as(metadata))
            )
          )
        )
      );

    const run = (
      operation: string,
      args: readonly string[],
      onProgress?: ProgressReporter
    ): Effect.Effect<string, DownloadError> =>
      Effect.gen(function* () {
        let stdoutBuffer = "";

        // Note: a dual-stream (video+audio) download reports two independent 0→100%
        // `[download]` progress sequences back to back (one per stream), so the percentage
        // this reports can visibly reset partway through a single operation. Cosmetic only,
        // not fixed here.
        const onStdout = onProgress
          ? (chunk: string) => {
              stdoutBuffer += chunk;
              const percent = parseDownloadPercent(stdoutBuffer);
              if (percent !== null) {
                onProgress({ completed: Math.round(percent), total: 100, message: `Downloaded ${percent.toFixed(1)}%` });
              }
              // Bound the buffer — only the tail ever matters for "last percentage seen so far".
              // Trimmed at a newline boundary (rather than a raw byte offset) so we never cut a
              // percentage token in half.
              if (stdoutBuffer.length > 4096) {
                const newlineIndex = stdoutBuffer.indexOf("\n", stdoutBuffer.length - 2048);
                stdoutBuffer = newlineIndex === -1 ? stdoutBuffer.slice(-2048) : stdoutBuffer.slice(newlineIndex + 1);
              }
            }
          : undefined;

        const res = yield* process
          .spawn({ executable: "yt-dlp", args, onStdout, timeoutMs: DOWNLOAD_TIMEOUT_MS })
          .pipe(Effect.mapError((err: ProcessError) => new DownloadError({
            operation,
            message: `${operation} failed: ${err.stderr?.trim() || err.message}`,
            cause: err,
          })));

        return yield* Effect.try({
          try: () => parseFinalOutputPath(res.stdout),
          catch: (cause) => new DownloadError({
            operation,
            message: `${operation} succeeded but reported no output path: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
        });
      });

    const download = (
      url: string,
      workspace: WorkspaceInstance,
      options: VideoDownloadOptions = {},
      onProgress?: ProgressReporter
    ): Effect.Effect<string, UnsupportedSourceError | DownloadError> =>
      Effect.gen(function* () {
        yield* checkSourceSupported(url);

        const args = [
          ...(options.format ? ["-f", options.format] : []),
          "--no-playlist",
          "--newline",
          "--progress",
          "-o", workspace.allocateOutputPath("%(title).200B [%(id)s].%(ext)s"),
          "--print", "after_move:filepath",
          "--",
          url,
        ];

        return yield* run("video-download.download", args, onProgress);
      });

    const downloadAudio = (
      url: string,
      workspace: WorkspaceInstance,
      options: VideoDownloadOptions = {},
      onProgress?: ProgressReporter
    ): Effect.Effect<string, UnsupportedSourceError | DownloadError> =>
      Effect.gen(function* () {
        yield* checkSourceSupported(url);

        const args = [
          "-f", "bestaudio", // Source stream selector — always the best available audio track,
                              // distinct from `options.format` below (the user-suppliable
                              // `--audio-format` output re-encode target).
          "-x",
          ...(options.format ? ["--audio-format", options.format] : []),
          "--no-playlist",
          "--newline",
          "--progress",
          "-o", workspace.allocateOutputPath("%(title).200B [%(id)s].%(ext)s"),
          "--print", "after_move:filepath",
          "--",
          url,
        ];

        return yield* run("video-download.download-audio", args, onProgress);
      });

    return VideoDownloadService.of({ checkSourceSupported, getInfo, download, downloadAudio });
  })
);
