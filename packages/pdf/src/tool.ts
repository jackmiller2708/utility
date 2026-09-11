import { Effect } from "effect";
import * as path from "node:path";
import {
  PdfInspectInput,
  PdfInspectOutput,
  PdfInspectOutputSchema,
  PdfInspectInputSchema,
  PdfRenderPagesInput,
  PdfRenderPagesInputSchema,
  PdfRenderPagesOutput,
  PdfRenderPagesOutputSchema,
  PdfExtractImagesInput,
  PdfExtractImagesInputSchema,
  PdfExtractImagesOutput,
  PdfExtractImagesOutputSchema,
  PdfSplitInput,
  PdfSplitInputSchema,
  PdfSplitOutput,
  PdfSplitOutputSchema,
  PdfMergeInput,
  PdfMergeInputSchema,
  PdfMergeOutput,
  PdfMergeOutputSchema,
} from "@utility/protocol";
import { ArtifactStore } from "@utility/runtime";
import { createTool, Operation } from "@utility/toolkit";
import { InvalidPdfError } from "./errors.js";
import { PdfService } from "./service.js";

export const inspectOperation: Operation<
  PdfInspectInput,
  PdfInspectOutput,
  InvalidPdfError,
  PdfService
> = {
  id: "pdf.inspect",
  name: "Inspect PDF",
  description: "Read page count, title, and author from a PDF without modifying it.",
  parameters: [
    {
      name: "file",
      label: "PDF File",
      type: "file",
      required: true,
      description: "The PDF file to inspect",
    },
  ],
  inputSchema: PdfInspectInputSchema,
  outputSchema: PdfInspectOutputSchema,
  execute: (input: PdfInspectInput, context) =>
    Effect.gen(function* () {
      const pdfService = yield* PdfService;
      const inputFilePath = context.workspace.resolveInputPath(input.file);
      return yield* pdfService.inspect(inputFilePath);
    }),
};

export const renderPagesOperation: Operation<
  PdfRenderPagesInput,
  PdfRenderPagesOutput,
  unknown,
  PdfService | ArtifactStore
> = {
  id: "pdf.render-pages",
  name: "Render Pages",
  description: "Render each page of a PDF to a PNG image.",
  parameters: [
    {
      name: "file",
      label: "PDF File",
      type: "file",
      required: true,
      description: "The PDF file to render",
    },
    {
      name: "dpi",
      label: "Resolution (DPI)",
      type: "number",
      required: false,
      defaultValue: 150,
      min: 36,
      max: 600,
      description: "Rendering resolution in dots per inch",
    },
    {
      name: "firstPage",
      label: "First Page",
      type: "number",
      required: false,
      min: 1,
      description: "First page to render (omit to start at page 1)",
    },
    {
      name: "lastPage",
      label: "Last Page",
      type: "number",
      required: false,
      min: 1,
      description: "Last page to render (omit to render through the last page)",
    },
  ],
  inputSchema: PdfRenderPagesInputSchema,
  outputSchema: PdfRenderPagesOutputSchema,
  execute: (input: PdfRenderPagesInput, context) =>
    Effect.gen(function* () {
      const pdfService = yield* PdfService;
      const artifactStore = yield* ArtifactStore;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);

      const pagePaths = yield* pdfService.renderPages(inputFilePath, context.workspace, {
        dpi: input.dpi,
        firstPage: input.firstPage,
        lastPage: input.lastPage,
      });

      const pages = yield* Effect.forEach(
        pagePaths,
        (pagePath, index) =>
          artifactStore.saveArtifact({
            name: `${parsed.name}_page_${String(index + 1).padStart(pagePaths.length >= 100 ? 3 : 2, "0")}.png`,
            sourcePath: pagePath,
            metadata: {
              operation: "pdf.render-pages",
              page: index + 1,
              dpi: input.dpi ?? 150,
            },
          }),
        { concurrency: "unbounded" }
      );

      return { pages };
    }),
};

export const extractImagesOperation: Operation<
  PdfExtractImagesInput,
  PdfExtractImagesOutput,
  unknown,
  PdfService | ArtifactStore
> = {
  id: "pdf.extract-images",
  name: "Extract Images",
  description: "Extract every embedded raster image from a PDF.",
  parameters: [
    {
      name: "file",
      label: "PDF File",
      type: "file",
      required: true,
      description: "The PDF file to extract images from",
    },
  ],
  inputSchema: PdfExtractImagesInputSchema,
  outputSchema: PdfExtractImagesOutputSchema,
  execute: (input: PdfExtractImagesInput, context) =>
    Effect.gen(function* () {
      const pdfService = yield* PdfService;
      const artifactStore = yield* ArtifactStore;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);

      const imagePaths = yield* pdfService.extractImages(inputFilePath, context.workspace);

      const images = yield* Effect.forEach(
        imagePaths,
        (imagePath, index) =>
          artifactStore.saveArtifact({
            name: `${parsed.name}_image_${String(index + 1).padStart(imagePaths.length >= 100 ? 3 : 2, "0")}.png`,
            sourcePath: imagePath,
            metadata: {
              operation: "pdf.extract-images",
              index: index + 1,
            },
          }),
        { concurrency: "unbounded" }
      );

      return { images };
    }),
};

export const splitOperation: Operation<
  PdfSplitInput,
  PdfSplitOutput,
  unknown,
  PdfService | ArtifactStore
> = {
  id: "pdf.split",
  name: "Split PDF",
  description: "Extract one or more page ranges from a PDF as separate files.",
  parameters: [
    {
      name: "file",
      label: "PDF File",
      type: "file",
      required: true,
      description: "The PDF file to split",
    },
    {
      name: "ranges",
      label: "Page Ranges",
      type: "string",
      required: true,
      description: "JSON array of { firstPage, lastPage } ranges to extract, e.g. [{\"firstPage\":40,\"lastPage\":52}]",
    },
  ],
  inputSchema: PdfSplitInputSchema,
  outputSchema: PdfSplitOutputSchema,
  execute: (input: PdfSplitInput, context) =>
    Effect.gen(function* () {
      const pdfService = yield* PdfService;
      const artifactStore = yield* ArtifactStore;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);

      const outputPaths = yield* pdfService.splitRanges(inputFilePath, context.workspace, input.ranges);

      const files = yield* Effect.forEach(
        outputPaths,
        (outputPath, index) => {
          const range = input.ranges[index];

          return artifactStore.saveArtifact({
            name: `${parsed.name}_p${range.firstPage}-${range.lastPage}.pdf`,
            sourcePath: outputPath,
            metadata: {
              operation: "pdf.split",
              firstPage: range.firstPage,
              lastPage: range.lastPage,
            },
          });
        },
        { concurrency: "unbounded" }
      );

      return { files };
    }),
};

export const mergeOperation: Operation<
  PdfMergeInput,
  PdfMergeOutput,
  unknown,
  PdfService | ArtifactStore
> = {
  id: "pdf.merge",
  name: "Merge PDFs",
  description: "Combine multiple PDF files into one, in the given order.",
  parameters: [
    {
      name: "files",
      label: "PDF Files",
      type: "file",
      required: true,
      description: "Two or more PDF files to combine, in merge order",
    },
  ],
  inputSchema: PdfMergeInputSchema,
  outputSchema: PdfMergeOutputSchema,
  execute: (input: PdfMergeInput, context) =>
    Effect.gen(function* () {
      const pdfService = yield* PdfService;
      const artifactStore = yield* ArtifactStore;

      const inputPaths = input.files.map((file) => context.workspace.resolveInputPath(file));
      const outputPath = yield* pdfService.merge(inputPaths, context.workspace);

      const artifact = yield* artifactStore.saveArtifact({
        name: "merged.pdf",
        sourcePath: outputPath,
        metadata: {
          operation: "pdf.merge",
          sourceCount: input.files.length,
        },
      });

      return { artifact };
    }),
};

export const pdfTool = createTool({
  id: "pdf",
  name: "PDF Documents",
  description: "Inspect, render, and extract content from PDF documents.",
  category: "Document",
  operations: [inspectOperation, renderPagesOperation, extractImagesOperation],
});

export const pdfMergeSplitTool = createTool({
  id: "pdf-merge-split",
  name: "Merge & Split",
  description: "Combine multiple PDFs into one, or extract page ranges into separate files.",
  category: "Document",
  operations: [mergeOperation, splitOperation],
});
