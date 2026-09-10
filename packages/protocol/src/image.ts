import { Schema } from "effect";
import { ArtifactSchema } from "./artifact.js";

export const ImageFitSchema = Schema.Literal("cover", "contain", "fill", "inside", "outside");
export type ImageFit = typeof ImageFitSchema.Type;

export const ImageFormatSchema = Schema.Literal("jpeg", "png", "webp", "avif");
export type ImageFormat = typeof ImageFormatSchema.Type;

export const ImageResizeInputSchema = Schema.Struct({
  file: Schema.String,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  fit: Schema.optional(ImageFitSchema),
  position: Schema.optional(Schema.String),
  withoutEnlargement: Schema.optional(Schema.Boolean),
  format: Schema.optional(ImageFormatSchema),
});

export type ImageResizeInput = typeof ImageResizeInputSchema.Type;

export const ImageResizeOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type ImageResizeOutput = typeof ImageResizeOutputSchema.Type;
