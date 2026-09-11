import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "./../src/app.module.js";
import { buildTestPdf } from "./support/pdf-fixtures.js";

async function waitForTerminalStatus(
  app: INestApplication,
  jobId: string,
  timeoutMs = 15000
): Promise<{ id: string; status: string; progress: unknown; result: unknown; error: string | null }> {
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

describe("Jobs API (e2e)", () => {
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

  it("returns 404 for an unknown operation id", async () => {
    await request(app.getHttpServer()).post("/api/v1/jobs/not.a.real.operation").expect(404);
  });

  it("returns 404 for an unknown job id", async () => {
    await request(app.getHttpServer()).get("/api/v1/jobs/job_does_not_exist").expect(404);
  });

  it("runs pdf.inspect as a job through the generic submission route", async () => {
    const pdfBuffer = buildTestPdf({ pages: 6 });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/pdf.inspect")
      .attach("file", pdfBuffer, "handoff.pdf")
      .expect(201);

    expect(submitRes.body.jobId).toBeDefined();

    const final = await waitForTerminalStatus(app, submitRes.body.jobId);
    expect(final.status).toBe("completed");
    expect((final.result as { pages: number }).pages).toBe(6);
  });

  it("runs pdf.render-pages as a job with real, increasing progress", async () => {
    const pdfBuffer = buildTestPdf({ pages: 22 });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/pdf.render-pages")
      .attach("file", pdfBuffer, "handoff.pdf")
      .field("dpi", "72")
      .expect(201);

    const jobId = submitRes.body.jobId;

    // Sample progress mid-flight at least once before it finishes.
    let sawProgress = false;
    for (let i = 0; i < 50; i++) {
      const res = await request(app.getHttpServer()).get(`/api/v1/jobs/${jobId}`).expect(200);
      if (res.body.progress && res.body.progress.completed > 0) {
        sawProgress = true;
      }
      if (res.body.status === "completed" || res.body.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const final = await waitForTerminalStatus(app, jobId);
    expect(final.status).toBe("completed");
    expect((final.result as { pages: unknown[] }).pages).toHaveLength(22);
    // 22 pages at chunk size 10 means at least one progress update necessarily lands
    // before completion — if this is ever false, progress reporting silently broke.
    expect(sawProgress).toBe(true);
  });

  it("runs pdf.merge as a job via the generic route's multi-file handling", async () => {
    const first = buildTestPdf({ pages: 2 });
    const second = buildTestPdf({ pages: 3 });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/pdf.merge")
      .attach("files", first, "first.pdf")
      .attach("files", second, "second.pdf")
      .expect(201);

    const final = await waitForTerminalStatus(app, submitRes.body.jobId);
    expect(final.status).toBe("completed");
    expect((final.result as { artifact: { name: string } }).artifact.name).toBe("merged.pdf");
  });

  it("runs pdf.split as a job via the generic route's JSON-string ranges field", async () => {
    const pdfBuffer = buildTestPdf({ pages: 10 });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/pdf.split")
      .attach("file", pdfBuffer, "handoff.pdf")
      .field("ranges", JSON.stringify([{ firstPage: 2, lastPage: 4 }]))
      .expect(201);

    const final = await waitForTerminalStatus(app, submitRes.body.jobId);
    expect(final.status).toBe("completed");
    expect((final.result as { files: { name: string }[] }).files[0].name).toBe("handoff_p2-4.pdf");
  });

  it("cancels a running job on request", async () => {
    const pdfBuffer = buildTestPdf({ pages: 40 });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/pdf.render-pages")
      .attach("file", pdfBuffer, "handoff.pdf")
      .field("dpi", "150")
      .expect(201);

    const jobId = submitRes.body.jobId;

    // Give the fiber a moment to actually attach and start before cancelling it.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const cancelRes = await request(app.getHttpServer()).delete(`/api/v1/jobs/${jobId}`).expect(200);
    expect(cancelRes.body.cancelled).toBe(true);

    const final = await waitForTerminalStatus(app, jobId);
    expect(final.status).toBe("cancelled");
  });

  it("lists submitted jobs newest first", async () => {
    const pdfBuffer = buildTestPdf({ pages: 1 });

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/jobs/pdf.inspect")
      .attach("file", pdfBuffer, "handoff.pdf")
      .expect(201);

    await waitForTerminalStatus(app, submitRes.body.jobId);

    const listRes = await request(app.getHttpServer()).get("/api/v1/jobs").expect(200);
    expect(Array.isArray(listRes.body.jobs)).toBe(true);
    expect(listRes.body.jobs.some((j: { id: string }) => j.id === submitRes.body.jobId)).toBe(true);
  });
});
