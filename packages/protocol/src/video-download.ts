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
