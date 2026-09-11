import { Context, Effect, Layer } from "effect";
import * as path from "node:path";
import { FileSystem, Process, ProcessError, WorkspaceInstance } from "@utility/runtime";
import { InvalidPdfError, PdfProcessingError } from "./errors.js";

export interface PdfMetadata {
  readonly pages: number;
  readonly title?: string;
  readonly author?: string;
}

export interface RenderPagesOptions {
  readonly dpi?: number;
  readonly firstPage?: number;
  readonly lastPage?: number;
}

export interface PageRange {
  readonly firstPage: number;
  readonly lastPage: number;
}

export interface PdfService {
  readonly inspect: (inputPath: string) => Effect.Effect<PdfMetadata, InvalidPdfError>;

  readonly renderPages: (
    inputPath: string,
    workspace: WorkspaceInstance,
    options?: RenderPagesOptions
  ) => Effect.Effect<readonly string[], InvalidPdfError | PdfProcessingError>;

  readonly extractImages: (
    inputPath: string,
    workspace: WorkspaceInstance
  ) => Effect.Effect<readonly string[], InvalidPdfError | PdfProcessingError>;

  readonly splitRanges: (
    inputPath: string,
    workspace: WorkspaceInstance,
    ranges: readonly PageRange[]
  ) => Effect.Effect<readonly string[], InvalidPdfError | PdfProcessingError>;

  readonly merge: (
    inputPaths: readonly string[],
    workspace: WorkspaceInstance
  ) => Effect.Effect<string, InvalidPdfError | PdfProcessingError>;
}

export const PdfService = Context.GenericTag<PdfService>("@utility/pdf/PdfService");

const isMalformedPdfStderr = (stderr: string): boolean =>
  /may not be a pdf file|syntax (error|warning)|damaged|couldn't read xref|couldn't find trailer|unrecoverable error|stackunderflow|trailer dictionary/i.test(stderr);

const mapProcessFailure = (operation: string) => (err: ProcessError) =>
  isMalformedPdfStderr(err.stderr ?? "")
    ? new InvalidPdfError({
        message: `The input does not look like a valid PDF: ${err.stderr?.trim() || err.message}`,
        cause: err,
      })
    : new PdfProcessingError({
        operation,
        message: `${operation} failed: ${err.message}`,
        cause: err,
      });

export const PopplerPdfServiceLive = Layer.effect(
  PdfService,
  Effect.gen(function* () {
    const process = yield* Process;
    const fs = yield* FileSystem;

    return PdfService.of({
      inspect: (inputPath: string) =>
        process
          .spawn({ executable: "pdfinfo", args: [inputPath] })
          .pipe(
            Effect.map((res) => {
              const pagesMatch = res.stdout.match(/^Pages:\s+(\d+)/m);
              const titleMatch = res.stdout.match(/^Title:\s+(.+)$/m);
              const authorMatch = res.stdout.match(/^Author:\s+(.+)$/m);

              return {
                pages: pagesMatch ? parseInt(pagesMatch[1], 10) : 1,
                title: titleMatch ? titleMatch[1].trim() : undefined,
                author: authorMatch ? authorMatch[1].trim() : undefined,
              };
            }),
            Effect.mapError(
              (err) =>
                new InvalidPdfError({
                  path: inputPath,
                  message: `Failed to read PDF info: ${isMalformedPdfStderr(err.stderr ?? "") ? "the input does not look like a valid PDF" : err.message}`,
                  cause: err,
                })
            )
          ),

      renderPages: (inputPath: string, workspace: WorkspaceInstance, options = {}) =>
        Effect.gen(function* () {
          const dpi = options.dpi ?? 150;
          const outputPrefix = workspace.allocateOutputPath("page");
          const args = ["-png", "-r", String(dpi)];

          if (options.firstPage) {
            args.push("-f", String(options.firstPage));
          }
          if (options.lastPage) {
            args.push("-l", String(options.lastPage));
          }

          args.push(inputPath, outputPrefix);

          yield* process
            .spawn({ executable: "pdftoppm", args })
            .pipe(Effect.mapError(mapProcessFailure("pdf.render-pages")));

          const prefixName = path.basename(outputPrefix);
          const entries = yield* fs.listDirectory(workspace.outputDir).pipe(
            Effect.mapError(
              (err) =>
                new PdfProcessingError({
                  operation: "pdf.render-pages",
                  message: `Failed to list rendered pages: ${err.message}`,
                  cause: err,
                })
            )
          );

          return entries
            .filter((name) => name.startsWith(`${prefixName}-`) && name.endsWith(".png"))
            .sort()
            .map((name) => path.join(workspace.outputDir, name));
        }),

      extractImages: (inputPath: string, workspace: WorkspaceInstance) =>
        Effect.gen(function* () {
          const outputPrefix = workspace.allocateOutputPath("image");

          yield* process
            .spawn({ executable: "pdfimages", args: ["-png", inputPath, outputPrefix] })
            .pipe(Effect.mapError(mapProcessFailure("pdf.extract-images")));

          const prefixName = path.basename(outputPrefix);
          const entries = yield* fs.listDirectory(workspace.outputDir).pipe(
            Effect.mapError(
              (err) =>
                new PdfProcessingError({
                  operation: "pdf.extract-images",
                  message: `Failed to list extracted images: ${err.message}`,
                  cause: err,
                })
            )
          );

          return entries
            .filter((name) => name.startsWith(`${prefixName}-`) && name.endsWith(".png"))
            .sort()
            .map((name) => path.join(workspace.outputDir, name));
        }),

      splitRanges: (inputPath: string, workspace: WorkspaceInstance, ranges: readonly PageRange[]) =>
        Effect.forEach(
          ranges,
          (range, index) =>
            Effect.gen(function* () {
              const outputPath = workspace.allocateOutputPath(`split_${index + 1}.pdf`);

              yield* process
                .spawn({
                  executable: "gs",
                  args: [
                    "-sDEVICE=pdfwrite",
                    "-dNOPAUSE",
                    "-dBATCH",
                    "-dQUIET",
                    `-dFirstPage=${range.firstPage}`,
                    `-dLastPage=${range.lastPage}`,
                    "-o",
                    outputPath,
                    inputPath,
                  ],
                })
                .pipe(Effect.mapError(mapProcessFailure("pdf.split")));

              return outputPath;
            }),
          { concurrency: 1 }
        ),

      merge: (inputPaths: readonly string[], workspace: WorkspaceInstance) =>
        Effect.gen(function* () {
          const outputPath = workspace.allocateOutputPath("merged.pdf");

          yield* process
            .spawn({ executable: "pdfunite", args: [...inputPaths, outputPath] })
            .pipe(Effect.mapError(mapProcessFailure("pdf.merge")));

          return outputPath;
        }),
    });
  })
);
