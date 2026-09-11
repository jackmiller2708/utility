import { Schema } from "effect";
import { ArtifactSchema } from "./artifact.js";

export const MediaInspectInputSchema = Schema.Struct({
  file: Schema.String,
});

export type MediaInspectInput = typeof MediaInspectInputSchema.Type;

export const MediaVideoStreamSchema = Schema.Struct({
  codec: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  fps: Schema.Number,
});

export const MediaAudioStreamSchema = Schema.Struct({
  codec: Schema.String,
  sampleRate: Schema.Number,
  channels: Schema.Number,
});

export const MediaInspectOutputSchema = Schema.Struct({
  durationSeconds: Schema.Number,
  format: Schema.String,
  video: Schema.NullOr(MediaVideoStreamSchema),
  audio: Schema.NullOr(MediaAudioStreamSchema),
});

export type MediaInspectOutput = typeof MediaInspectOutputSchema.Type;

export const MediaThumbnailInputSchema = Schema.Struct({
  file: Schema.String,
  timestampSeconds: Schema.optional(Schema.Number),
  width: Schema.optional(Schema.Number),
  format: Schema.optional(Schema.Literal("jpeg", "png", "webp")),
});

export type MediaThumbnailInput = typeof MediaThumbnailInputSchema.Type;

export const MediaThumbnailOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type MediaThumbnailOutput = typeof MediaThumbnailOutputSchema.Type;

export const MediaExtractAudioInputSchema = Schema.Struct({
  file: Schema.String,
  format: Schema.optional(Schema.Literal("mp3", "aac", "wav", "flac", "ogg")),
  bitrate: Schema.optional(Schema.Number),
});

export type MediaExtractAudioInput = typeof MediaExtractAudioInputSchema.Type;

export const MediaExtractAudioOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type MediaExtractAudioOutput = typeof MediaExtractAudioOutputSchema.Type;

export const MediaTranscodeInputSchema = Schema.Struct({
  file: Schema.String,
  format: Schema.optional(Schema.Literal("mp4", "webm", "mov", "mkv")),
  resolution: Schema.optional(Schema.Literal("source", "2160p", "1080p", "720p", "480p", "360p")),
  quality: Schema.optional(Schema.Number),
  preserveAudio: Schema.optional(Schema.Boolean),
});

export type MediaTranscodeInput = typeof MediaTranscodeInputSchema.Type;

export const MediaTranscodeOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type MediaTranscodeOutput = typeof MediaTranscodeOutputSchema.Type;
