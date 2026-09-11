import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "./../src/app.module.js";

/** Minimal valid multi-page PDF, built by hand so the e2e suite needs no PDF-authoring dependency. */
function buildTestPdf(pages: number): Buffer {
  const pageObjNumStart = 3;
  const contentObjNum = pageObjNumStart + pages;
  const objs: Buffer[] = [];
  objs.push(Buffer.from(`<< /Type /Catalog /Pages 2 0 R >>`));
  const kids = Array.from({ length: pages }, (_, i) => `${pageObjNumStart + i} 0 R`).join(" ");
  objs.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`));
  for (let i = 0; i < pages; i++) {
    objs.push(
      Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents ${contentObjNum} 0 R >>`)
    );
  }
  const content = Buffer.from("1 0 0 RG 0 0 50 50 re S");
  objs.push(
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")])
  );

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

describe("Utility API (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/auth/status returns localhost authenticated status", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/status")
      .expect(200);

    expect(res.body).toHaveProperty("authenticated", true);
    expect(res.body).toHaveProperty("isLocal", true);
  });

  it("GET /api/v1/tools returns image tool and resize operation", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/tools")
      .expect(200);

    expect(res.body).toHaveProperty("tools");
    expect(Array.isArray(res.body.tools)).toBe(true);

    const imageTool = res.body.tools.find((t: { id: string }) => t.id === "image");
    expect(imageTool).toBeDefined();
    expect(imageTool.name).toBe("Image Processing");

    const resizeOp = imageTool.operations.find((op: { id: string }) => op.id === "image.resize");
    expect(resizeOp).toBeDefined();
    expect(resizeOp.parameters.length).toBeGreaterThan(0);
  });

  it("POST /api/v1/tools/image.resize resizes an uploaded image and creates artifact", async () => {
    // Generate a 200x200 PNG image in memory
    const testImageBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/image.resize")
      .attach("file", testImageBuffer, "test-square.png")
      .field("width", 80)
      .field("height", 80)
      .field("fit", "contain")
      .field("format", "webp")
      .expect(201);

    expect(res.body).toHaveProperty("artifact");
    const artifact = res.body.artifact;
    expect(artifact).toHaveProperty("id");
    expect(artifact).toHaveProperty("name", "test-square_resized.webp");
    expect(artifact).toHaveProperty("mimeType", "image/webp");
    expect(artifact.size).toBeGreaterThan(0);
    expect(artifact.checksum).toBeDefined();

    // Verify artifact retrieval
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${artifact.id}`)
      .expect(200);

    expect(getRes.body.id).toBe(artifact.id);

    // Verify artifact file download
    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${artifact.id}/download`)
      .expect(200);

    expect(downloadRes.headers["content-type"]).toBe("image/webp");
    expect(downloadRes.body.length).toBe(artifact.size);

    // Verify downloaded image dimensions with sharp
    const downloadedMeta = await sharp(downloadRes.body).metadata();
    expect(downloadedMeta.width).toBe(80);
    expect(downloadedMeta.height).toBe(80);
    expect(downloadedMeta.format).toBe("webp");
  });

  it("GET /api/v1/tools returns pdf tool and its operations", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/tools")
      .expect(200);

    const pdfTool = res.body.tools.find((t: { id: string }) => t.id === "pdf");
    expect(pdfTool).toBeDefined();
    expect(pdfTool.operations.map((op: { id: string }) => op.id).sort()).toEqual([
      "pdf.extract-images",
      "pdf.inspect",
      "pdf.render-pages",
    ]);
  });

  it("POST /api/v1/tools/pdf.inspect reports page count via the generic operation route", async () => {
    const testPdfBuffer = buildTestPdf(3);

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.inspect")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .expect(201);

    expect(res.body).toHaveProperty("pages", 3);
  });

  it("POST /api/v1/tools/pdf.render-pages renders each page as a downloadable artifact", async () => {
    const testPdfBuffer = buildTestPdf(2);

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.render-pages")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .field("dpi", 72)
      .expect(201);

    expect(res.body.pages).toHaveLength(2);
    for (const page of res.body.pages) {
      expect(page.mimeType).toBe("image/png");
    }

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${res.body.pages[0].id}/download`)
      .expect(200);
    expect(downloadRes.headers["content-type"]).toBe("image/png");
  });

  it("POST /api/v1/tools/pdf.extract-images returns an empty list for an image-free PDF", async () => {
    const testPdfBuffer = buildTestPdf(1);

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.extract-images")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .expect(201);

    expect(res.body.images).toEqual([]);
  });

  it("GET /api/v1/tools returns the pdf-merge-split tool", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/tools")
      .expect(200);

    const tool = res.body.tools.find((t: { id: string }) => t.id === "pdf-merge-split");
    expect(tool).toBeDefined();
    expect(tool.operations.map((op: { id: string }) => op.id).sort()).toEqual([
      "pdf.merge",
      "pdf.split",
    ]);
  });

  it("POST /api/v1/tools/pdf.split extracts a page range as a downloadable PDF", async () => {
    const testPdfBuffer = buildTestPdf(10);

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.split")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .field("ranges", JSON.stringify([{ firstPage: 3, lastPage: 5 }]))
      .expect(201);

    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].name).toBe("handoff_p3-5.pdf");

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${res.body.files[0].id}/download`)
      .expect(200);
    expect(downloadRes.headers["content-type"]).toBe("application/pdf");
  });

  it("POST /api/v1/tools/pdf.split rejects a request with no ranges", async () => {
    const testPdfBuffer = buildTestPdf(3);

    await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.split")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .field("ranges", JSON.stringify([]))
      .expect(400);
  });

  it("POST /api/v1/tools/pdf.merge combines multiple PDFs into one", async () => {
    const first = buildTestPdf(2);
    const second = buildTestPdf(3);

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.merge")
      .attach("files", first, "first.pdf")
      .attach("files", second, "second.pdf")
      .expect(201);

    expect(res.body.artifact.name).toBe("merged.pdf");
    expect(res.body.artifact.mimeType).toBe("application/pdf");

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${res.body.artifact.id}/download`)
      .expect(200);
    expect(downloadRes.headers["content-type"]).toBe("application/pdf");
  });

  it("POST /api/v1/tools/pdf.merge rejects fewer than two files", async () => {
    const only = buildTestPdf(2);

    await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.merge")
      .attach("files", only, "only.pdf")
      .expect(400);
  });
});
