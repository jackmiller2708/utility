import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "./../src/app.module.js";

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
});
