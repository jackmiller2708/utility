import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "./../src/app.module.js";

async function waitForTerminalStatus(
  app: INestApplication,
  jobId: string,
  timeoutMs = 15000
): Promise<{ id: string; status: string; result: unknown; error: string | null }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer()).get(`/api/v1/jobs/${jobId}`).expect(200);
    if (res.body.status === "completed" || res.body.status === "failed" || res.body.status === "cancelled") {
      return res.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Job ${jobId} did not reach a terminal status within ${timeoutMs}ms`);
}

async function buildTestImage(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe("Workflows API (e2e)", () => {
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

  it("rejects a recipe step whose operation fans out instead of producing a single artifact", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/workflows")
      .send({ name: "Bad recipe", steps: [{ operationId: "pdf.split", params: {} }] })
      .expect(400);

    expect(res.body.message).toMatch(/single artifact/i);
  });

  it("rejects a recipe step whose operation takes multiple files instead of one", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/workflows")
      .send({ name: "Bad recipe", steps: [{ operationId: "pdf.merge", params: {} }] })
      .expect(400);

    expect(res.body.message).toMatch(/single file/i);
  });

  it("rejects a recipe referencing an unknown operation", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/workflows")
      .send({ name: "Bad recipe", steps: [{ operationId: "not.a.real.operation", params: {} }] })
      .expect(400);

    expect(res.body.message).toMatch(/not registered/i);
  });

  it("returns 404 for an unknown workflow id", async () => {
    await request(app.getHttpServer()).get("/api/v1/workflows/wf_does_not_exist").expect(404);
  });

  it("creates a chained resize recipe, registers it as a runnable operation, and runs it end to end", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/workflows")
      .send({
        name: "Double resize",
        description: "Resizes twice in a row",
        steps: [
          { operationId: "image.resize", params: { width: 100, height: 100, fit: "fill" } },
          { operationId: "image.resize", params: { width: 40, height: 40, fit: "fill" } },
        ],
      })
      .expect(201);

    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.operationId).toBe(`recipe.${createRes.body.id}`);
    const operationId = createRes.body.operationId;

    // Discoverable via the same tool listing every other operation shows up in.
    const toolsRes = await request(app.getHttpServer()).get("/api/v1/tools").expect(200);
    const recipeTool = toolsRes.body.tools.find((t: { id: string }) => t.id === operationId);
    expect(recipeTool).toBeDefined();
    expect(recipeTool.category).toBe("Recipes");

    const imageBuffer = await buildTestImage();

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${operationId}`)
      .attach("file", imageBuffer, "photo.png")
      .expect(201);

    const final = await waitForTerminalStatus(app, submitRes.body.jobId);
    expect(final.status).toBe("completed");

    const result = final.result as {
      artifact: { metadata: { width: number; height: number } };
      steps: { operationId: string; artifact: { metadata: { width: number; height: number } } }[];
    };

    // The final artifact must reflect step 2's target size, not step 1's — proof the
    // second step actually ran against the first step's *output*, not the original upload.
    expect(result.artifact.metadata.width).toBe(40);
    expect(result.artifact.metadata.height).toBe(40);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].artifact.metadata.width).toBe(100);
    expect(result.steps[1].artifact.metadata.width).toBe(40);

    // Deleting the recipe unregisters its operation.
    await request(app.getHttpServer()).delete(`/api/v1/workflows/${createRes.body.id}`).expect(200);

    const toolsAfterDelete = await request(app.getHttpServer()).get("/api/v1/tools").expect(200);
    expect(toolsAfterDelete.body.tools.some((t: { id: string }) => t.id === operationId)).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${operationId}`)
      .attach("file", imageBuffer, "photo.png")
      .expect(404);
  });
});
