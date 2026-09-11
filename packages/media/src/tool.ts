import { Effect } from "effect";
import * as path from "node:path";
import {
  MediaInspectInput,
  MediaInspectOutput,
  MediaInspectOutputSchema,
  MediaInspectInputSchema,
  MediaThumbnailInput,
  MediaThumbnailInputSchema,
  MediaThumbnailOutput,
  MediaThumbnailOutputSchema,
  MediaExtractAudioInput,
  MediaExtractAudioInputSchema,
  MediaExtractAudioOutput,
  MediaExtractAudioOutputSchema,
  MediaTranscodeInput,
  MediaTranscodeInputSchema,
  MediaTranscodeOutput,
  MediaTranscodeOutputSchema,
} from "@utility/protocol";
import { ArtifactStore } from "@utility/runtime";
import { createTool, Operation } from "@utility/toolkit";
import { InvalidMediaError } from "./errors.js";
import { MediaService } from "./service.js";

export const inspectOperation: Operation<MediaInspectInput, MediaInspectOutput, InvalidMediaError, MediaService> = {
  id: "media.inspect",
  name: "Inspect Media",
  description: "Read duration, format, and video/audio stream details from a media file without modifying it.",
  parameters: [
    {
      name: "file",
      label: "Media File",
      type: "file",
      required: true,
      description: "The video or audio file to inspect",
    },
  ],
  inputSchema: MediaInspectInputSchema,
  outputSchema: MediaInspectOutputSchema,
  execute: (input: MediaInspectInput, context) =>
    Effect.gen(function* () {
      const mediaService = yield* MediaService;
      const inputFilePath = context.workspace.resolveInputPath(input.file);
      return yield* mediaService.inspect(inputFilePath);
    }),
};

export const thumbnailOperation: Operation<
  MediaThumbnailInput,
  MediaThumbnailOutput,
  unknown,
  MediaService | ArtifactStore
> = {
  id: "media.thumbnail",
  name: "Extract Thumbnail",
  description: "Capture a single frame from a video as a still image.",
  parameters: [
    {
      name: "file",
      label: "Media File",
      type: "file",
      required: true,
      description: "The video to capture a frame from",
    },
    {
      name: "timestampSeconds",
      label: "Timestamp (seconds)",
      type: "number",
      required: false,
      min: 0,
      description: "Seconds into the video to capture — omit to use a point 10% into the clip",
    },
    {
      name: "width",
      label: "Width (px)",
      type: "number",
      required: false,
      min: 16,
      max: 7680,
      description: "Output width in pixels — height scales to preserve aspect ratio; omit to keep the source size",
    },
    {
      name: "format",
      label: "Output Format",
      type: "select",
      required: false,
      defaultValue: "jpeg",
      options: ["jpeg", "png", "webp"],
      description: "Image format for the captured frame",
    },
  ],
  inputSchema: MediaThumbnailInputSchema,
  outputSchema: MediaThumbnailOutputSchema,
  execute: (input: MediaThumbnailInput, context) =>
    Effect.gen(function* () {
      const mediaService = yield* MediaService;
      const artifactStore = yield* ArtifactStore;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);
      const format = input.format ?? "jpeg";

      const outputPath = yield* mediaService.thumbnail(inputFilePath, context.workspace, {
        timestampSeconds: input.timestampSeconds,
        width: input.width,
        format,
      });

      const artifact = yield* artifactStore.saveArtifact({
        name: `${parsed.name}_thumbnail.${format === "jpeg" ? "jpg" : format}`,
        sourcePath: outputPath,
        metadata: {
          operation: "media.thumbnail",
          timestampSeconds: input.timestampSeconds,
        },
      });

      return { artifact };
    }),
};

export const extractAudioOperation: Operation<
  MediaExtractAudioInput,
  MediaExtractAudioOutput,
  unknown,
  MediaService | ArtifactStore
> = {
  id: "media.extract-audio",
  name: "Extract Audio",
  description: "Pull the audio track out of a video (or re-encode an audio file) as a standalone audio file.",
  parameters: [
    {
      name: "file",
      label: "Media File",
      type: "file",
      required: true,
      description: "The video or audio file to extract audio from",
    },
    {
      name: "format",
      label: "Output Format",
      type: "select",
      required: false,
      defaultValue: "mp3",
      options: ["mp3", "aac", "wav", "flac", "ogg"],
      description: "Audio container/codec for the extracted track",
    },
    {
      name: "bitrate",
      label: "Bitrate (kbps)",
      type: "number",
      required: false,
      min: 64,
      max: 320,
      description: "Compression bitrate for lossy formats — ignored for WAV/FLAC",
    },
  ],
  inputSchema: MediaExtractAudioInputSchema,
  outputSchema: MediaExtractAudioOutputSchema,
  execute: (input: MediaExtractAudioInput, context) =>
    Effect.gen(function* () {
      const mediaService = yield* MediaService;
      const artifactStore = yield* ArtifactStore;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);
      const format = input.format ?? "mp3";

      const outputPath = yield* mediaService.extractAudio(inputFilePath, context.workspace, {
        format,
        bitrate: input.bitrate,
      });

      const artifact = yield* artifactStore.saveArtifact({
        name: `${parsed.name}_audio.${format}`,
        sourcePath: outputPath,
        metadata: {
          operation: "media.extract-audio",
        },
      });

      return { artifact };
    }),
};

export const transcodeOperation: Operation<
  MediaTranscodeInput,
  MediaTranscodeOutput,
  unknown,
  MediaService | ArtifactStore
> = {
  id: "media.transcode",
  name: "Transcode Video",
  description: "Convert a video to a different format, resolution, or quality.",
  parameters: [
    {
      name: "file",
      label: "Media File",
      type: "file",
      required: true,
      description: "The video to transcode",
    },
    {
      name: "format",
      label: "Output Format",
      type: "select",
      required: false,
      defaultValue: "mp4",
      options: ["mp4", "webm", "mov", "mkv"],
      description: "Output container and codec",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "select",
      required: false,
      defaultValue: "source",
      options: ["source", "2160p", "1080p", "720p", "480p", "360p"],
      description: "Target height — width scales to preserve aspect ratio",
    },
    {
      name: "quality",
      label: "Quality",
      type: "number",
      required: false,
      defaultValue: 70,
      min: 1,
      max: 100,
      description: "Higher keeps more detail at a larger file size",
    },
    {
      name: "preserveAudio",
      label: "Keep audio track",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Carry the original audio track over into the output",
    },
  ],
  inputSchema: MediaTranscodeInputSchema,
  outputSchema: MediaTranscodeOutputSchema,
  execute: (input: MediaTranscodeInput, context) =>
    Effect.gen(function* () {
      const mediaService = yield* MediaService;
      const artifactStore = yield* ArtifactStore;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);
      const format = input.format ?? "mp4";

      const outputPath = yield* mediaService.transcode(
        inputFilePath,
        context.workspace,
        {
          format,
          resolution: input.resolution,
          quality: input.quality,
          preserveAudio: input.preserveAudio,
        },
        context.reportProgress
      );

      const artifact = yield* artifactStore.saveArtifact({
        name: `${parsed.name}_transcoded.${format}`,
        sourcePath: outputPath,
        metadata: {
          operation: "media.transcode",
          format,
          resolution: input.resolution ?? "source",
        },
      });

      return { artifact };
    }),
};

export const mediaTool = createTool({
  id: "media",
  name: "Video & Audio",
  description: "Inspect media files, capture thumbnails, extract audio, and transcode video.",
  category: "Media",
  operations: [inspectOperation, thumbnailOperation, extractAudioOperation, transcodeOperation],
});
