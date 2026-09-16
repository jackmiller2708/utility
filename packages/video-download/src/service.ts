import { Effect } from "effect";
import { UnsupportedSourceError } from "./errors.js";

/**
 * Reads the one field this package's preflight cares about from yt-dlp's `--dump-json` output.
 * Malformed JSON here means yt-dlp exited 0 but printed something unreadable — a defect, not a
 * domain error — so this throws and is expected to be wrapped by the caller's `Effect.try`.
 */
export const parseExtractorKey = (dumpJsonStdout: string): string => {
  const parsed = JSON.parse(dumpJsonStdout) as { extractor_key?: string };
  return parsed.extractor_key ?? "Generic";
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
  const lines = stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
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
