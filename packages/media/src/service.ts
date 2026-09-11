import { Context, Effect, Layer } from "effect";
import * as path from "node:path";
import { Process, ProcessError, WorkspaceInstance } from "@utility/runtime";
import { ProgressReporter } from "@utility/toolkit";
import { InvalidMediaError, MediaProcessingError } from "./errors.js";

export interface MediaVideoStream {
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export interface MediaAudioStream {
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface MediaMetadata {
  readonly durationSeconds: number;
  readonly format: string;
  readonly video: MediaVideoStream | null;
  readonly audio: MediaAudioStream | null;
}

export type ThumbnailFormat = "jpeg" | "png" | "webp";
export type AudioFormat = "mp3" | "aac" | "wav" | "flac" | "ogg";
export type VideoFormat = "mp4" | "webm" | "mov" | "mkv";
export type Resolution = "source" | "2160p" | "1080p" | "720p" | "480p" | "360p";

export interface ThumbnailOptions {
  readonly timestampSeconds?: number;
  readonly width?: number;
  readonly format?: ThumbnailFormat;
}

export interface ExtractAudioOptions {
  readonly format?: AudioFormat;
  readonly bitrate?: number;
}

export interface TranscodeOptions {
  readonly format?: VideoFormat;
  readonly resolution?: Resolution;
  /** 1-100, higher is better — the same convention `image.resize`'s quality uses, inverted internally to FFmpeg's CRF (0-51, lower is better) so this package's own callers never have to know CRF exists. */
  readonly quality?: number;
  readonly preserveAudio?: boolean;
}

export interface MediaService {
  readonly inspect: (inputPath: string) => Effect.Effect<MediaMetadata, InvalidMediaError>;

  readonly thumbnail: (
    inputPath: string,
    workspace: WorkspaceInstance,
    options?: ThumbnailOptions
  ) => Effect.Effect<string, InvalidMediaError | MediaProcessingError>;

  readonly extractAudio: (
    inputPath: string,
    workspace: WorkspaceInstance,
    options?: ExtractAudioOptions
  ) => Effect.Effect<string, InvalidMediaError | MediaProcessingError>;

  readonly transcode: (
    inputPath: string,
    workspace: WorkspaceInstance,
    options?: TranscodeOptions,
    onProgress?: ProgressReporter
  ) => Effect.Effect<string, InvalidMediaError | MediaProcessingError>;
}

export const MediaService = Context.GenericTag<MediaService>("@utility/media/MediaService");

const isMalformedMediaStderr = (stderr: string): boolean =>
  /invalid data found when processing input|moov atom not found|could not find codec parameters|does not contain any stream|invalid argument|unable to find a suitable output format/i.test(
    stderr
  );

const mapProcessFailure = (operation: string) => (err: ProcessError) =>
  isMalformedMediaStderr(err.stderr ?? "")
    ? new InvalidMediaError({
        message: `The input does not look like a valid media file: ${err.stderr?.trim() || err.message}`,
        cause: err,
      })
    : new MediaProcessingError({
        operation,
        message: `${operation} failed: ${err.message}`,
        cause: err,
      });

const RESOLUTION_HEIGHTS: Record<Exclude<Resolution, "source">, number> = {
  "2160p": 2160,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
};

/** 1 (smallest/worst) → CRF 34, 100 (largest/best) → CRF 18. Clamped to FFmpeg's practically useful range rather than its full 0-51 scale. */
const qualityToCrf = (quality: number): number => {
  const clamped = Math.max(1, Math.min(100, quality));
  return Math.round(34 - (clamped - 1) * (16 / 99));
};

const codecsForVideoFormat = (format: VideoFormat): { video: string; audio: string } => {
  switch (format) {
    case "webm":
      return { video: "libvpx-vp9", audio: "libopus" };
    case "mp4":
    case "mov":
    case "mkv":
    default:
      return { video: "libx264", audio: "aac" };
  }
};

const codecForAudioFormat = (format: AudioFormat): string => {
  switch (format) {
    case "mp3":
      return "libmp3lame";
    case "aac":
      return "aac";
    case "wav":
      return "pcm_s16le";
    case "flac":
      return "flac";
    case "ogg":
      return "libvorbis";
  }
};

const formatClockTime = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/** Finds the last `time=HH:MM:SS.ms` FFmpeg prints to stderr as it encodes — the standard, flag-free way to read live progress, since FFmpeg emits one of these lines every ~0.5s by default while a transcode runs. */
const parseLastFfmpegTime = (text: string): number | null => {
  const matches = [...text.matchAll(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
  if (matches.length === 0) {
    return null;
  }
  const last = matches[matches.length - 1];
  return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
};

export const FfmpegMediaServiceLive = Layer.effect(
  MediaService,
  Effect.gen(function* () {
    const process = yield* Process;

    const inspect = (inputPath: string): Effect.Effect<MediaMetadata, InvalidMediaError> =>
      process
        .spawn({
          executable: "ffprobe",
          args: ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath],
        })
        .pipe(
          Effect.flatMap((res) =>
            Effect.try({
              try: (): MediaMetadata => {
                const parsed = JSON.parse(res.stdout) as {
                  format?: { duration?: string; format_name?: string };
                  streams?: Array<{
                    codec_type?: string;
                    codec_name?: string;
                    width?: number;
                    height?: number;
                    r_frame_rate?: string;
                    sample_rate?: string;
                    channels?: number;
                  }>;
                };

                const durationSeconds = parsed.format?.duration ? parseFloat(parsed.format.duration) : NaN;
                if (!Number.isFinite(durationSeconds)) {
                  throw new Error("ffprobe reported no readable duration");
                }

                const videoStream = parsed.streams?.find((s) => s.codec_type === "video");
                const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");

                const video: MediaVideoStream | null = videoStream
                  ? {
                      codec: videoStream.codec_name ?? "unknown",
                      width: videoStream.width ?? 0,
                      height: videoStream.height ?? 0,
                      fps: videoStream.r_frame_rate ? evalFrameRate(videoStream.r_frame_rate) : 0,
                    }
                  : null;

                const audio: MediaAudioStream | null = audioStream
                  ? {
                      codec: audioStream.codec_name ?? "unknown",
                      sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate, 10) : 0,
                      channels: audioStream.channels ?? 0,
                    }
                  : null;

                return {
                  durationSeconds,
                  format: parsed.format?.format_name ?? "unknown",
                  video,
                  audio,
                };
              },
              catch: (cause) =>
                new InvalidMediaError({
                  path: inputPath,
                  message: `Failed to read media info: ${cause instanceof Error ? cause.message : String(cause)}`,
                  cause,
                }),
            })
          ),
          Effect.mapError((err) =>
            err instanceof InvalidMediaError
              ? err
              : new InvalidMediaError({
                  path: inputPath,
                  message: `Failed to read media info: ${isMalformedMediaStderr((err as ProcessError).stderr ?? "") ? "the input does not look like a valid media file" : (err as ProcessError).message}`,
                  cause: err,
                })
          )
        );

    return MediaService.of({
      inspect,

      thumbnail: (inputPath, workspace, options = {}) =>
        Effect.gen(function* () {
          const format = options.format ?? "jpeg";
          const outputPath = workspace.allocateOutputPath(`thumbnail.${format === "jpeg" ? "jpg" : format}`);

          const metadata = yield* inspect(inputPath);
          // Default to 10% into the clip rather than frame 0 — the opening frame of a video
          // is disproportionately likely to be a fade-in, a black slate, or a title card.
          const rawTimestamp = options.timestampSeconds ?? metadata.durationSeconds * 0.1;
          const timestamp = Math.max(0, Math.min(rawTimestamp, Math.max(0, metadata.durationSeconds - 0.05)));

          const args = ["-y", "-ss", timestamp.toFixed(3), "-i", inputPath, "-frames:v", "1"];
          if (options.width) {
            args.push("-vf", `scale=${options.width}:-2`);
          }
          args.push(outputPath);

          yield* process.spawn({ executable: "ffmpeg", args }).pipe(Effect.mapError(mapProcessFailure("media.thumbnail")));

          return outputPath;
        }),

      extractAudio: (inputPath, workspace, options = {}) =>
        Effect.gen(function* () {
          const format = options.format ?? "mp3";
          const outputPath = workspace.allocateOutputPath(`audio.${format}`);
          const codec = codecForAudioFormat(format);

          const args = ["-y", "-i", inputPath, "-vn", "-c:a", codec];
          if (options.bitrate && format !== "wav" && format !== "flac") {
            args.push("-b:a", `${options.bitrate}k`);
          }
          args.push(outputPath);

          yield* process.spawn({ executable: "ffmpeg", args }).pipe(Effect.mapError(mapProcessFailure("media.extract-audio")));

          return outputPath;
        }),

      transcode: (inputPath, workspace, options = {}, onProgress) =>
        Effect.gen(function* () {
          const format = options.format ?? "mp4";
          const outputPath = workspace.allocateOutputPath(`transcoded.${format}`);
          const { video: videoCodec, audio: audioCodec } = codecsForVideoFormat(format);

          const metadata = yield* inspect(inputPath);

          const args = ["-y", "-i", inputPath];

          if (options.resolution && options.resolution !== "source") {
            args.push("-vf", `scale=-2:${RESOLUTION_HEIGHTS[options.resolution]}`);
          }

          args.push("-c:v", videoCodec, "-crf", String(qualityToCrf(options.quality ?? 70)));

          if (options.preserveAudio === false || !metadata.audio) {
            args.push("-an");
          } else {
            args.push("-c:a", audioCodec);
          }

          args.push(outputPath);

          let stderrBuffer = "";
          const onStderr = onProgress
            ? (chunk: string) => {
                stderrBuffer += chunk;
                const seconds = parseLastFfmpegTime(stderrBuffer);
                if (seconds !== null) {
                  const completed = Math.min(Math.round(seconds), Math.round(metadata.durationSeconds));
                  onProgress({
                    completed,
                    total: Math.max(1, Math.round(metadata.durationSeconds)),
                    message: `Encoded ${formatClockTime(seconds)} of ${formatClockTime(metadata.durationSeconds)}`,
                  });
                }
                // Bound the buffer — only the tail ever matters for "last time= seen so far".
                if (stderrBuffer.length > 4096) {
                  stderrBuffer = stderrBuffer.slice(-2048);
                }
              }
            : undefined;

          yield* process
            .spawn({ executable: "ffmpeg", args, onStderr })
            .pipe(Effect.mapError(mapProcessFailure("media.transcode")));

          return outputPath;
        }),
    });
  })
);

/** FFmpeg/ffprobe report frame rate as a fraction string like "30000/1001" or "25/1". */
function evalFrameRate(fraction: string): number {
  const [num, den] = fraction.split("/").map(Number);
  if (!den) {
    return num || 0;
  }
  return Math.round((num / den) * 100) / 100;
}
