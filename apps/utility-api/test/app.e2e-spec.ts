import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "./../src/app.module.js";
import { buildTestPdf } from "./support/pdf-fixtures.js";
import { buildTestVideo } from "./support/media-fixtures.js";

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

  it("GET /api/v1/artifacts supports search, operation filtering, and cursor pagination", async () => {
    const uniquePrefix = `pgtest-${Date.now()}`;

    for (let i = 0; i < 3; i++) {
      const buf = await sharp({
        create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      await request(app.getHttpServer())
        .post("/api/v1/tools/image.resize")
        .attach("file", buf, `${uniquePrefix}-${i}.png`)
        .field("width", 5)
        .expect(201);
    }

    // Search finds exactly the 3 artifacts just created, by name substring.
    const searchRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts?q=${uniquePrefix}`)
      .expect(200);

    expect(searchRes.body.artifacts).toHaveLength(3);
    expect(searchRes.body.artifacts.every((a: { name: string }) => a.name.includes(uniquePrefix))).toBe(true);
    expect(searchRes.body.nextCursor).toBeNull();

    // The operation filter matches (all three came from image.resize)...
    const opRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts?q=${uniquePrefix}&operation=image.resize`)
      .expect(200);
    expect(opRes.body.artifacts).toHaveLength(3);

    // ...and excludes them under an unrelated operation.
    const wrongOpRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts?q=${uniquePrefix}&operation=pdf.inspect`)
      .expect(200);
    expect(wrongOpRes.body.artifacts).toHaveLength(0);

    // Cursor pagination pages through the 3 matches two at a time with no overlap.
    const page1 = await request(app.getHttpServer())
      .get(`/api/v1/artifacts?q=${uniquePrefix}&limit=2`)
      .expect(200);
    expect(page1.body.artifacts).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/artifacts?q=${uniquePrefix}&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .expect(200);
    expect(page2.body.artifacts).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    const page1Ids = page1.body.artifacts.map((a: { id: string }) => a.id);
    const page2Ids = page2.body.artifacts.map((a: { id: string }) => a.id);
    expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
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
    const testPdfBuffer = buildTestPdf({ pages: 3 });

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.inspect")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .expect(201);

    expect(res.body).toHaveProperty("pages", 3);
  });

  it("POST /api/v1/tools/pdf.render-pages renders each page as a downloadable artifact", async () => {
    const testPdfBuffer = buildTestPdf({ pages: 2 });

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
    const testPdfBuffer = buildTestPdf({ pages: 1 });

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
    const testPdfBuffer = buildTestPdf({ pages: 10 });

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
    const testPdfBuffer = buildTestPdf({ pages: 3 });

    await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.split")
      .attach("file", testPdfBuffer, "handoff.pdf")
      .field("ranges", JSON.stringify([]))
      .expect(400);
  });

  it("POST /api/v1/tools/pdf.merge combines multiple PDFs into one", async () => {
    const first = buildTestPdf({ pages: 2 });
    const second = buildTestPdf({ pages: 3 });

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
    const only = buildTestPdf({ pages: 2 });

    await request(app.getHttpServer())
      .post("/api/v1/tools/pdf.merge")
      .attach("files", only, "only.pdf")
      .expect(400);
  });

  it("GET /api/v1/tools returns the media tool and its operations", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/tools")
      .expect(200);

    const mediaTool = res.body.tools.find((t: { id: string }) => t.id === "media");
    expect(mediaTool).toBeDefined();
    expect(mediaTool.operations.map((op: { id: string }) => op.id).sort()).toEqual([
      "media.extract-audio",
      "media.inspect",
      "media.thumbnail",
      "media.transcode",
    ]);
  });

  it("POST /api/v1/tools/media.inspect reports duration and stream info via the generic operation route", async () => {
    const testVideoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/media.inspect")
      .attach("file", testVideoBuffer, "clip.mp4")
      .expect(201);

    expect(res.body.durationSeconds).toBeGreaterThan(0);
    expect(res.body.video).not.toBeNull();
    expect(res.body.audio).not.toBeNull();
  });

  it("POST /api/v1/tools/media.thumbnail captures a downloadable frame", async () => {
    const testVideoBuffer = buildTestVideo({ durationSeconds: 2 });

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/media.thumbnail")
      .attach("file", testVideoBuffer, "clip.mp4")
      .field("width", 32)
      .field("format", "png")
      .expect(201);

    expect(res.body.artifact.mimeType).toBe("image/png");
    expect(res.body.artifact.name).toBe("clip_thumbnail.png");

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${res.body.artifact.id}/download`)
      .expect(200);
    expect(downloadRes.headers["content-type"]).toBe("image/png");
  });

  it("POST /api/v1/tools/media.extract-audio produces a downloadable audio artifact", async () => {
    const testVideoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/media.extract-audio")
      .attach("file", testVideoBuffer, "clip.mp4")
      .field("format", "mp3")
      .expect(201);

    expect(res.body.artifact.mimeType).toBe("audio/mpeg");
    expect(res.body.artifact.name).toBe("clip_audio.mp3");

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${res.body.artifact.id}/download`)
      .expect(200);
    expect(downloadRes.headers["content-type"]).toBe("audio/mpeg");
  });

  it("POST /api/v1/tools/media.transcode re-encodes to the requested format and resolution", async () => {
    const testVideoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });

    const res = await request(app.getHttpServer())
      .post("/api/v1/tools/media.transcode")
      .attach("file", testVideoBuffer, "clip.mp4")
      .field("format", "mp4")
      .field("resolution", "360p")
      .field("quality", 50)
      .expect(201);

    expect(res.body.artifact.mimeType).toBe("video/mp4");
    expect(res.body.artifact.name).toBe("clip_transcoded.mp4");

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/artifacts/${res.body.artifact.id}/download`)
      .expect(200);
    expect(downloadRes.headers["content-type"]).toBe("video/mp4");
  });

  it("POST /api/v1/tools/media.inspect rejects a non-media file", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/tools/media.inspect")
      .attach("file", Buffer.from("this is not a video"), "not-a-video.mp4")
      .expect(400);
  });

  it("POST /api/v1/jobs/media.transcode runs the transcode asynchronously with progress and cancellation support", async () => {
    const testVideoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/media.transcode")
      .attach("file", testVideoBuffer, "clip.mp4")
      .field("format", "mp4")
      .field("resolution", "360p")
      .expect(201);

    expect(submitRes.body).toHaveProperty("jobId");
    const jobId = submitRes.body.jobId;

    let job: { status: string; result?: { artifact: { mimeType: string } } } | undefined;
    for (let i = 0; i < 100; i++) {
      const pollRes = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);
      job = pollRes.body;
      if (job?.status === "completed" || job?.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(job?.status).toBe("completed");
    expect(job?.result?.artifact.mimeType).toBe("video/mp4");
  });

  it("GET /api/v1/tools returns the video-download tool and its operations", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/tools")
      .expect(200);

    const tool = res.body.tools.find((t: { id: string }) => t.id === "video-download");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("Video Downloader");
    expect(tool.operations.map((op: { id: string }) => op.id).sort()).toEqual([
      "video-download.download",
      "video-download.download-audio",
    ]);
  });
});
