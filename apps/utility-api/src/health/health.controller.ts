import { Controller, Get, UseGuards } from "@nestjs/common";
import { Effect } from "effect";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { DeviceAuthService } from "../auth/device-auth.service.js";
import { ArtifactStore } from "@utility/runtime";
import { JobRegistry } from "@utility/toolkit";

const bytesToMb = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 10) / 10;

@Controller("health")
export class HealthController {
  constructor(
    private readonly effectRuntime: EffectRuntimeService,
    private readonly deviceAuth: DeviceAuthService
  ) {}

  @Get()
  getHealth() {
    return { status: "ok" };
  }

  /**
   * Operational snapshot for manual monitoring (curl/browser) — process memory, and the
   * three stores that grow with usage: artifacts on disk, in-memory jobs, and registered
   * devices. Guarded like every other data-bearing endpoint; `/health` above stays open
   * and dependency-free for container liveness probes.
   */
  @UseGuards(DeviceAuthGuard)
  @Get("status")
  async getStatus() {
    const { artifacts, jobs } = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const artifactStore = yield* ArtifactStore;
        const jobRegistry = yield* JobRegistry;

        return {
          artifacts: yield* artifactStore.getStorageStats(),
          jobs: yield* jobRegistry.getStats(),
        };
      })
    );

    const mem = process.memoryUsage();

    return {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: {
        rss: bytesToMb(mem.rss),
        heapUsed: bytesToMb(mem.heapUsed),
        heapTotal: bytesToMb(mem.heapTotal),
        external: bytesToMb(mem.external),
      },
      artifacts: {
        count: artifacts.count,
        totalSizeMb: bytesToMb(artifacts.totalSizeBytes),
      },
      jobs,
      devices: this.deviceAuth.listDevices().length,
    };
  }
}
