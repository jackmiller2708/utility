import { basename } from "node:path";
import { Effect } from "effect";
import {
  VideoDownloadInput,
  VideoDownloadInputSchema,
  VideoDownloadOutput,
  VideoDownloadOutputSchema,
  VideoDownloadAudioInput,
  VideoDownloadAudioInputSchema,
  VideoDownloadAudioOutput,
  VideoDownloadAudioOutputSchema,
  VideoDownloadInfoInput,
  VideoDownloadInfoInputSchema,
  VideoDownloadInfoOutput,
  VideoDownloadInfoOutputSchema,
} from "@utility/protocol";
import { ArtifactStore } from "@utility/runtime";
import { createTool, Operation } from "@utility/toolkit";
import { Artifact } from "@utility/domain";
import { UnsupportedSourceError, DownloadError } from "./errors.js";
import { VideoDownloadService } from "./service.js";

export const infoOperation: Operation<
  VideoDownloadInfoInput,
  VideoDownloadInfoOutput,
  UnsupportedSourceError | DownloadError,
  VideoDownloadService
> = {
  id: "video-download.info",
  name: "Video Info",
  description: "Fetch title, thumbnail, duration, and uploader for a supported site URL without downloading anything.",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true, description: "A URL from a site yt-dlp recognizes" },
  ],
  inputSchema: VideoDownloadInfoInputSchema,
  outputSchema: VideoDownloadInfoOutputSchema,
  execute: (input) =>
    Effect.gen(function* () {
      const service = yield* VideoDownloadService;
      return yield* service.getInfo(input.url);
    }),
};

export const downloadOperation: Operation<
  VideoDownloadInput,
  VideoDownloadOutput,
  unknown,
  VideoDownloadService | ArtifactStore
> = {
  id: "video-download.download",
  name: "Download Video",
  description: "Download a video from a supported site URL.",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true, description: "A URL from a site yt-dlp recognizes" },
    {
      name: "format",
      label: "Format selector",
      type: "string",
      required: false,
      description: "Passed through as yt-dlp's own -f value (e.g. \"best[height<=720]\"). Omit to use yt-dlp's default.",
    },
  ],
  inputSchema: VideoDownloadInputSchema,
  outputSchema: VideoDownloadOutputSchema,
  execute: (input, context) =>
    Effect.gen(function* () {
      const service = yield* VideoDownloadService;
      const artifactStore = yield* ArtifactStore;

      const outputPath = yield* service.download(
        input.url,
        context.workspace,
        { format: input.format },
        context.reportProgress
      );

      const artifact = yield* artifactStore.saveArtifact({
        name: basename(outputPath),
        sourcePath: outputPath,
        metadata: { operation: "video-download.download" },
      });

      return { artifact };
    }),
  // `output.artifact` is always the real domain `Artifact` from `ArtifactStore.saveArtifact`
  // above; the output schema only widens its `id` to `string` for the wire.
  producesArtifact: (output) => output.artifact as Artifact,
};

export const downloadAudioOperation: Operation<
  VideoDownloadAudioInput,
  VideoDownloadAudioOutput,
  unknown,
  VideoDownloadService | ArtifactStore
> = {
  id: "video-download.download-audio",
  name: "Download Audio",
  description: "Download just the audio track from a supported site URL.",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true, description: "A URL from a site yt-dlp recognizes" },
    {
      name: "format",
      label: "Audio format",
      type: "string",
      required: false,
      description: "Passed through as yt-dlp's own --audio-format value (mp3, m4a, opus, flac, wav, ...). Omit for yt-dlp's default (best).",
    },
  ],
  inputSchema: VideoDownloadAudioInputSchema,
  outputSchema: VideoDownloadAudioOutputSchema,
  execute: (input, context) =>
    Effect.gen(function* () {
      const service = yield* VideoDownloadService;
      const artifactStore = yield* ArtifactStore;

      const outputPath = yield* service.downloadAudio(
        input.url,
        context.workspace,
        { format: input.format },
        context.reportProgress
      );

      const artifact = yield* artifactStore.saveArtifact({
        name: basename(outputPath),
        sourcePath: outputPath,
        metadata: { operation: "video-download.download-audio" },
      });

      return { artifact };
    }),
  // `output.artifact` is always the real domain `Artifact` from `ArtifactStore.saveArtifact`
  // above; the output schema only widens its `id` to `string` for the wire.
  producesArtifact: (output) => output.artifact as Artifact,
};

export const videoDownloadTool = createTool({
  id: "video-download",
  name: "Video Downloader",
  description: "Download a video (or just its audio) from a supported site URL.",
  category: "Media",
  operations: [infoOperation, downloadOperation, downloadAudioOperation],
});
