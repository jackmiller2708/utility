import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import {
  FileSystemLive,
  ProcessLive,
  WorkspaceManagerLive,
  ArtifactStoreLive,
  FileSystem,
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

/**
 * Hand-builds a minimal, valid PDF byte buffer with a plain xref table.
 * Poppler's CLIs (pdfinfo/pdftoppm/pdfimages) accept this without a
 * higher-level PDF library dependency in the test suite.
 */
function buildTestPdf(options: { pages: number; embedImage?: boolean }): Buffer {
  const { pages, embedImage = false } = options;
  const pageObjNumStart = 3;
  const contentObjNum = pageObjNumStart + pages;
  const imageObjNum = contentObjNum + 1;

  const objs: Buffer[] = [];
  objs.push(Buffer.from(`<< /Type /Catalog /Pages 2 0 R >>`));

  const kids = Array.from({ length: pages }, (_, i) => `${pageObjNumStart + i} 0 R`).join(" ");
  objs.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`));

  for (let i = 0; i < pages; i++) {
    objs.push(
      Buffer.from(
        embedImage
          ? `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 ${imageObjNum} 0 R >> >> /MediaBox [0 0 100 100] /Contents ${contentObjNum} 0 R >>`
          : `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents ${contentObjNum} 0 R >>`
      )
    );
  }

  const content = Buffer.from(embedImage ? "q 50 0 0 50 10 10 cm /Im0 Do Q" : "1 0 0 RG 0 0 50 50 re S");
  objs.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("\nendstream"),
    ])
  );

  if (embedImage) {
    const imgData = Buffer.from([255]);
    objs.push(
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imgData.length} >>\nstream\n`
        ),
        imgData,
        Buffer.from("\nendstream"),
      ])
    );
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let pos = chunks[0].length;

  objs.forEach((body, idx) => {
    offsets.push(pos);
    const header = Buffer.from(`${idx + 1} 0 obj\n`);
    const footer = Buffer.from("\nendobj\n");
    chunks.push(header, body, footer);
    pos += header.length + body.length + footer.length;
  });

  const xrefOffset = pos;
  const n = objs.length + 1;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(xref), Buffer.from(trailer));

  return Buffer.concat(chunks);
}

describe("PDF tools", () => {
  const TestEnv = Layer.mergeAll(
    FileSystemLive,
    ProcessLive,
    WorkspaceManagerLive.pipe(Layer.provide(FileSystemLive)),
    ArtifactStoreLive.pipe(Layer.provide(FileSystemLive)),
    PopplerPdfServiceLive.pipe(Layer.provide(Layer.mergeAll(ProcessLive, FileSystemLive))),
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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "not-a-pdf.pdf";
          yield* fs.write(ws.resolveInputPath(filename), Buffer.from("this is not a pdf"));

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.pdf";
          yield* fs.write(ws.resolveInputPath(filename), pdfBuffer);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          yield* fs.write(ws.resolveInputPath("first.pdf"), first);
          yield* fs.write(ws.resolveInputPath("second.pdf"), second);

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
      const fs = yield* FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "not-a-pdf.pdf";
          yield* fs.write(ws.resolveInputPath(filename), Buffer.from("this is not a pdf"));

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
