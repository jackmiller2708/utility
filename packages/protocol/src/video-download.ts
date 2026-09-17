import { Schema } from "effect";
import { ArtifactSchema } from "./artifact.js";

export const VideoDownloadInputSchema = Schema.Struct({
  url: Schema.String,
  format: Schema.optional(Schema.String),
});

export type VideoDownloadInput = typeof VideoDownloadInputSchema.Type;

export const VideoDownloadOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type VideoDownloadOutput = typeof VideoDownloadOutputSchema.Type;

export const VideoDownloadAudioInputSchema = Schema.Struct({
  url: Schema.String,
  format: Schema.optional(Schema.String),
});

export type VideoDownloadAudioInput = typeof VideoDownloadAudioInputSchema.Type;

export const VideoDownloadAudioOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type VideoDownloadAudioOutput = typeof VideoDownloadAudioOutputSchema.Type;

export const VideoDownloadInfoInputSchema = Schema.Struct({
  url: Schema.String,
});

export type VideoDownloadInfoInput = typeof VideoDownloadInfoInputSchema.Type;

export const VideoDownloadInfoOutputSchema = Schema.Struct({
  title: Schema.String,
  thumbnailUrl: Schema.optional(Schema.String),
  durationSeconds: Schema.optional(Schema.Number),
  uploader: Schema.optional(Schema.String),
});

export type VideoDownloadInfoOutput = typeof VideoDownloadInfoOutputSchema.Type;
