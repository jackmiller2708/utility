import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem, NodeCommandExecutor, NodePath } from "@effect/platform-node";
import {
  ProcessLive,
  WorkspaceManagerLive,
  ArtifactStoreLive,
  WorkspaceManager,
} from "@utility/runtime";
import { makeToolRegistry, ToolRegistry } from "@utility/toolkit";
import {
  pdfTool,
  pdfMergeSplitTool,
  inspectOperation,
  renderPagesOperation,
  extractImagesOperation,
  splitOperation,
  mergeOperation,
  PopplerPdfServiceLive,
} from "@utility/pdf";
import { buildTestPdf } from "./support/pdf-fixtures.js";

describe("PDF tools", () => {
  const ProcessServiceLive = ProcessLive.pipe(
    Layer.provide(NodeCommandExecutor.layer),
    Layer.provide(NodeFileSystem.layer)
  );

  const TestEnv = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    ProcessServiceLive,
    WorkspaceManagerLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    ArtifactStoreLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    PopplerPdfServiceLive.pipe(Layer.provide(Layer.mergeAll(ProcessServiceLive, NodeFileSystem.layer, NodePath.layer))),
    makeToolRegistry([pdfTool, pdfMergeSplitTool])
  );

  it("registers the pdf tool with its three operations", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      return yield* registry.getToolsInfo();
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    const pdf = result.tools.find((t) => t.id === "pdf");
    expect(pdf).toBeDefined();
    expect(pdf?.operations.map((op) => op.id).sort()).toEqual([
      "pdf.extract-images",
      "pdf.inspect",
      "pdf.render-pages",
    ]);
  });

  it("inspects page count for a multi-page PDF", async () => {
    const pdfBuffer = buildTestPdf({ pages: 4 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* inspectOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.pages).toBe(4);
  });

  it("rejects a non-PDF file with a descriptive error", async () => {
    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "not-a-pdf.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), Buffer.from("this is not a pdf"));

          return yield* inspectOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    await expect(Effect.runPromise(program)).rejects.toThrow();
  });

  it("renders every page to a PNG artifact", async () => {
    const pdfBuffer = buildTestPdf({ pages: 3 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* renderPagesOperation.execute(
            { file: filename, dpi: 72 },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.pages).toHaveLength(3);
    for (const page of result.pages) {
      expect(page.mimeType).toBe("image/png");
      expect(page.size).toBeGreaterThan(0);
    }
  });

  it("renders only the requested page range", async () => {
    const pdfBuffer = buildTestPdf({ pages: 5 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* renderPagesOperation.execute(
            { file: filename, dpi: 72, firstPage: 2, lastPage: 3 },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.pages).toHaveLength(2);
  });

  it("extracts embedded images as artifacts", async () => {
    const pdfBuffer = buildTestPdf({ pages: 1, embedImage: true });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* extractImagesOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("returns an empty list when a PDF has no embedded images", async () => {
    const pdfBuffer = buildTestPdf({ pages: 1, embedImage: false });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* extractImagesOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.images).toHaveLength(0);
  });

  it("registers the pdf-merge-split tool with its two operations", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      return yield* registry.getToolsInfo();
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    const tool = result.tools.find((t) => t.id === "pdf-merge-split");
    expect(tool).toBeDefined();
    expect(tool?.operations.map((op) => op.id).sort()).toEqual(["pdf.merge", "pdf.split"]);
  });

  it("splits a page range out of a PDF into its own file", async () => {
    const pdfBuffer = buildTestPdf({ pages: 5 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* splitOperation.execute(
            { file: filename, ranges: [{ firstPage: 2, lastPage: 3 }] },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].mimeType).toBe("application/pdf");
    expect(result.files[0].name).toBe("input_p2-3.pdf");
    expect(result.files[0].size).toBeGreaterThan(0);
  });

  it("splits multiple ranges into separate files in one call", async () => {
    const pdfBuffer = buildTestPdf({ pages: 10 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), pdfBuffer);

          return yield* splitOperation.execute(
            {
              file: filename,
              ranges: [
                { firstPage: 1, lastPage: 2 },
                { firstPage: 5, lastPage: 7 },
              ],
            },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe("input_p1-2.pdf");
    expect(result.files[1].name).toBe("input_p5-7.pdf");
  });

  it("merges multiple PDFs into one, in order", async () => {
    const first = buildTestPdf({ pages: 2 });
    const second = buildTestPdf({ pages: 3 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          yield* fs.writeFile(ws.resolveInputPath("first.pdf"), first);
          yield* fs.writeFile(ws.resolveInputPath("second.pdf"), second);

          return yield* mergeOperation.execute(
            { files: ["first.pdf", "second.pdf"] },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.mimeType).toBe("application/pdf");
    expect(result.artifact.size).toBeGreaterThan(0);
  });

  it("rejects an invalid PDF passed to split", async () => {
    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "not-a-pdf.pdf";
          yield* fs.writeFile(ws.resolveInputPath(filename), Buffer.from("this is not a pdf"));

          return yield* splitOperation.execute(
            { file: filename, ranges: [{ firstPage: 1, lastPage: 1 }] },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    await expect(Effect.runPromise(program)).rejects.toThrow();
  });
});
