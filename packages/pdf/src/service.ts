import { Context, Effect, Layer } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { Process, ProcessError, WorkspaceInstance } from "@utility/runtime";
import { ProgressReporter } from "@utility/toolkit";
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

/** Pages rendered/scanned per `pdftoppm`/`pdfimages` invocation when progress reporting is active. Balances real incremental progress against per-process spawn overhead. */
const PROGRESS_CHUNK_SIZE = 10;

export interface PdfService {
  readonly inspect: (inputPath: string) => Effect.Effect<PdfMetadata, InvalidPdfError>;

  readonly renderPages: (
    inputPath: string,
    workspace: WorkspaceInstance,
    options?: RenderPagesOptions,
    onProgress?: ProgressReporter
  ) => Effect.Effect<readonly string[], InvalidPdfError | PdfProcessingError>;

  readonly extractImages: (
    inputPath: string,
    workspace: WorkspaceInstance,
    onProgress?: ProgressReporter,
    totalPages?: number
  ) => Effect.Effect<readonly string[], InvalidPdfError | PdfProcessingError>;

  readonly splitRanges: (
    inputPath: string,
    workspace: WorkspaceInstance,
    ranges: readonly PageRange[],
    onProgress?: ProgressReporter
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

/** Lists every PNG in the workspace's output dir whose name starts with any of the given prefixes, sorted for stable ordering. */
const listPngOutputs = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  workspace: WorkspaceInstance,
  matchesPrefix: (name: string) => boolean,
  operation: string
): Effect.Effect<readonly string[], PdfProcessingError> =>
  fs.readDirectory(workspace.outputDir).pipe(
    Effect.mapError(
      (err) =>
        new PdfProcessingError({
          operation,
          message: `Failed to list ${operation} output: ${err.message}`,
          cause: err,
        })
    ),
    Effect.map((entries) =>
      entries
        .filter((name) => name.endsWith(".png") && matchesPrefix(name))
        .sort()
        .map((name) => path.join(workspace.outputDir, name))
    )
  );

/** Splits an inclusive [first, last] page range into contiguous chunks of at most `size` pages. */
const chunkRange = (first: number, last: number, size: number): Array<{ start: number; end: number }> => {
  const chunks: Array<{ start: number; end: number }> = [];
  for (let start = first; start <= last; start += size) {
    chunks.push({ start, end: Math.min(start + size - 1, last) });
  }
  return chunks;
};

export const PopplerPdfServiceLive = Layer.effect(
  PdfService,
  Effect.gen(function* () {
    const process = yield* Process;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

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

      renderPages: (inputPath: string, workspace: WorkspaceInstance, options = {}, onProgress) =>
        Effect.gen(function* () {
          const dpi = options.dpi ?? 150;
          const outputPrefix = workspace.allocateOutputPath("page");
          const prefixName = path.basename(outputPrefix);

          // pdftoppm names each file by its real page number (page-<N>.png), so a shared
          // prefix across chunked invocations never collides — safe to call repeatedly.
          if (!onProgress || !options.firstPage || !options.lastPage) {
            const args = ["-png", "-r", String(dpi)];
            if (options.firstPage) {
              args.push("-f", String(options.firstPage));
            }
            if (options.lastPage) {
              args.push("-l", String(options.lastPage));
            }
            args.push(inputPath, outputPrefix);

            yield* process.spawn({ executable: "pdftoppm", args }).pipe(Effect.mapError(mapProcessFailure("pdf.render-pages")));

            return yield* listPngOutputs(fs, path, workspace, (name) => name.startsWith(`${prefixName}-`), "pdf.render-pages");
          }

          const total = options.lastPage - options.firstPage + 1;
          let completed = 0;

          for (const chunk of chunkRange(options.firstPage, options.lastPage, PROGRESS_CHUNK_SIZE)) {
            yield* process
              .spawn({
                executable: "pdftoppm",
                args: ["-png", "-r", String(dpi), "-f", String(chunk.start), "-l", String(chunk.end), inputPath, outputPrefix],
              })
              .pipe(Effect.mapError(mapProcessFailure("pdf.render-pages")));

            completed += chunk.end - chunk.start + 1;
            onProgress({ completed, total, message: `Rendered page ${chunk.end} of ${options.lastPage}` });
          }

          return yield* listPngOutputs(fs, path, workspace, (name) => name.startsWith(`${prefixName}-`), "pdf.render-pages");
        }),

      extractImages: (inputPath: string, workspace: WorkspaceInstance, onProgress, totalPages) =>
        Effect.gen(function* () {
          if (!onProgress || !totalPages) {
            const outputPrefix = workspace.allocateOutputPath("image");
            const prefixName = path.basename(outputPrefix);

            yield* process
              .spawn({ executable: "pdfimages", args: ["-png", inputPath, outputPrefix] })
              .pipe(Effect.mapError(mapProcessFailure("pdf.extract-images")));

            return yield* listPngOutputs(fs, path, workspace, (name) => name.startsWith(`${prefixName}-`), "pdf.extract-images");
          }

          // pdfimages restarts its own counter at -000 on every invocation, so each chunk
          // MUST get a distinct prefix or a later chunk silently overwrites an earlier one.
          // Zero-padded start page keeps prefixes in the right lexicographic order too.
          let completed = 0;

          for (const chunk of chunkRange(1, totalPages, PROGRESS_CHUNK_SIZE)) {
            const chunkPrefix = workspace.allocateOutputPath(`image_p${String(chunk.start).padStart(6, "0")}`);

            yield* process
              .spawn({
                executable: "pdfimages",
                args: ["-png", "-f", String(chunk.start), "-l", String(chunk.end), inputPath, chunkPrefix],
              })
              .pipe(Effect.mapError(mapProcessFailure("pdf.extract-images")));

            completed = chunk.end;
            onProgress({ completed, total: totalPages, message: `Scanned page ${chunk.end} of ${totalPages}` });
          }

          return yield* listPngOutputs(fs, path, workspace, (name) => name.startsWith("image_p"), "pdf.extract-images");
        }),

      splitRanges: (inputPath: string, workspace: WorkspaceInstance, ranges: readonly PageRange[], onProgress) =>
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

              onProgress?.({
                completed: index + 1,
                total: ranges.length,
                message: `Split range ${index + 1} of ${ranges.length} (pages ${range.firstPage}-${range.lastPage})`,
              });

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
