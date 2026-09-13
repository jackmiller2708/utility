import { Registry, collectDefaultMetrics, Gauge } from "@prometheus-io/client";
import { Effect } from "effect";
import { ArtifactStore } from "@utility/runtime";
import { JobRegistry, type JobStatus } from "@utility/toolkit";
import type { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import type { DeviceAuthService } from "../auth/device-auth.service.js";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: "utility_" });

const artifactsCount = new Gauge({
  name: "utility_artifacts_count",
  help: "Number of artifacts currently on disk",
  registers: [metricsRegistry],
});

const artifactsTotalBytes = new Gauge({
  name: "utility_artifacts_total_bytes",
  help: "Total size of all artifacts on disk, in bytes",
  registers: [metricsRegistry],
});

const jobsTotal = new Gauge({
  name: "utility_jobs_total",
  help: "Number of jobs currently tracked, by status",
  labelNames: ["status"],
  registers: [metricsRegistry],
});

const devicesTotal = new Gauge({
  name: "utility_devices_total",
  help: "Number of registered devices",
  registers: [metricsRegistry],
});

const JOB_STATUSES: readonly JobStatus[] = ["pending", "running", "completed", "failed", "cancelled"];

/**
 * Refreshes the app-specific gauges right before a scrape. These are cheap in-memory reads
 * (no disk I/O beyond what's already cached), so pulling fresh values per-scrape is simpler
 * than running a second background interval alongside the retention sweep in
 * `EffectRuntimeService`.
 */
export async function refreshAppMetrics(
  effectRuntime: EffectRuntimeService,
  deviceAuth: DeviceAuthService
): Promise<void> {
  const { artifacts, jobs } = await effectRuntime.runPromise(
    Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      const jobRegistry = yield* JobRegistry;

      return {
        artifacts: yield* artifactStore.getStorageStats(),
        jobs: yield* jobRegistry.getStats(),
      };
    })
  );

  artifactsCount.set(artifacts.count);
  artifactsTotalBytes.set(artifacts.totalSizeBytes);
  devicesTotal.set(deviceAuth.listDevices().length);

  for (const status of JOB_STATUSES) {
    jobsTotal.set({ status }, jobs.byStatus[status]);
  }
}
