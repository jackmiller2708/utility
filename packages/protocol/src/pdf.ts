import { Schema } from "effect";
import { ArtifactSchema } from "./artifact.js";

export const PdfInspectInputSchema = Schema.Struct({
  file: Schema.String,
});

export type PdfInspectInput = typeof PdfInspectInputSchema.Type;

export const PdfInspectOutputSchema = Schema.Struct({
  pages: Schema.Number,
  title: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
});

export type PdfInspectOutput = typeof PdfInspectOutputSchema.Type;

export const PdfRenderPagesInputSchema = Schema.Struct({
  file: Schema.String,
  dpi: Schema.optional(Schema.Number),
  firstPage: Schema.optional(Schema.Number),
  lastPage: Schema.optional(Schema.Number),
});

export type PdfRenderPagesInput = typeof PdfRenderPagesInputSchema.Type;

export const PdfRenderPagesOutputSchema = Schema.Struct({
  pages: Schema.Array(ArtifactSchema),
});

export type PdfRenderPagesOutput = typeof PdfRenderPagesOutputSchema.Type;

export const PdfExtractImagesInputSchema = Schema.Struct({
  file: Schema.String,
});

export type PdfExtractImagesInput = typeof PdfExtractImagesInputSchema.Type;

export const PdfExtractImagesOutputSchema = Schema.Struct({
  images: Schema.Array(ArtifactSchema),
});

export type PdfExtractImagesOutput = typeof PdfExtractImagesOutputSchema.Type;

export const PdfPageRangeSchema = Schema.Struct({
  firstPage: Schema.Number,
  lastPage: Schema.Number,
});

export type PdfPageRange = typeof PdfPageRangeSchema.Type;

export const PdfSplitInputSchema = Schema.Struct({
  file: Schema.String,
  ranges: Schema.Array(PdfPageRangeSchema),
});

export type PdfSplitInput = typeof PdfSplitInputSchema.Type;

export const PdfSplitOutputSchema = Schema.Struct({
  files: Schema.Array(ArtifactSchema),
});

export type PdfSplitOutput = typeof PdfSplitOutputSchema.Type;

export const PdfMergeInputSchema = Schema.Struct({
  files: Schema.Array(Schema.String),
});

export type PdfMergeInput = typeof PdfMergeInputSchema.Type;

export const PdfMergeOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type PdfMergeOutput = typeof PdfMergeOutputSchema.Type;
