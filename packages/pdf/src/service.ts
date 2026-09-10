import { Context, Effect, Layer } from "effect";
import { Process, WorkspaceInstance } from "@utility/runtime";

export interface PdfMetadata {
  readonly pages: number;
  readonly title?: string;
  readonly author?: string;
}

export interface PdfService {
  readonly inspect: (inputPath: string) => Effect.Effect<PdfMetadata, unknown>;
  readonly renderPages: (
    inputPath: string,
    workspace: WorkspaceInstance,
    options?: { dpi?: number }
  ) => Effect.Effect<readonly string[], unknown>;
}

export const PdfService = Context.GenericTag<PdfService>("@utility/pdf/PdfService");

export const PopplerPdfServiceLive = Layer.effect(
  PdfService,
  Effect.gen(function* () {
    const process = yield* Process;

    return PdfService.of({
      inspect: (inputPath: string) =>
        Effect.gen(function* () {
          const res = yield* process.spawn({
            executable: "pdfinfo",
            args: [inputPath],
          });
          const pagesMatch = res.stdout.match(/Pages:\s+(\d+)/);
          const pages = pagesMatch ? parseInt(pagesMatch[1], 10) : 1;
          return { pages };
        }),

      renderPages: (inputPath: string, workspace: WorkspaceInstance, options = {}) =>
        Effect.gen(function* () {
          const dpi = options.dpi || 150;
          const outputPrefix = workspace.allocateOutputPath("page");
          yield* process.spawn({
            executable: "pdftoppm",
            args: ["-png", "-r", String(dpi), inputPath, outputPrefix],
          });
          return [];
        }),
    });
  })
);
