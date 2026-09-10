import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Effect } from "effect";
import * as fs from "node:fs";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { ArtifactStore } from "@utility/runtime";
import { ArtifactId } from "@utility/domain";

@UseGuards(DeviceAuthGuard)
@Controller("artifacts")
export class ArtifactsController {
  constructor(private readonly effectRuntime: EffectRuntimeService) {}

  @Get()
  async listArtifacts() {
    return this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const store = yield* ArtifactStore;
        return yield* store.listArtifacts();
      })
    );
  }

  @Get(":id")
  async getArtifact(
    @Param("id") id: string,
    @Query("download") download: string | undefined,
    @Res() res: Response
  ) {
    const { artifact, filePath } = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const store = yield* ArtifactStore;
        const artId = ArtifactId(id);
        const art = yield* store.getArtifact(artId);
        const path = yield* store.getArtifactPath(artId);
        return { artifact: art, filePath: path };
      })
    );

    if (download === "true") {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(artifact.name)}"`
      );
      res.setHeader("Content-Type", artifact.mimeType);
      const stream = fs.createReadStream(filePath);
      return stream.pipe(res);
    }

    return res.json(artifact);
  }

  @Get(":id/file")
  async getArtifactFile(@Param("id") id: string, @Res() res: Response) {
    const { artifact, filePath } = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const store = yield* ArtifactStore;
        const artId = ArtifactId(id);
        const art = yield* store.getArtifact(artId);
        const path = yield* store.getArtifactPath(artId);
        return { artifact: art, filePath: path };
      })
    );

    res.setHeader("Content-Type", artifact.mimeType);
    res.setHeader("Content-Length", String(artifact.size));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(artifact.name)}"`
    );
    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  }

  @Get(":id/download")
  async downloadArtifact(@Param("id") id: string, @Res() res: Response) {
    const { artifact, filePath } = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const store = yield* ArtifactStore;
        const artId = ArtifactId(id);
        const art = yield* store.getArtifact(artId);
        const path = yield* store.getArtifactPath(artId);
        return { artifact: art, filePath: path };
      })
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(artifact.name)}"`
    );
    res.setHeader("Content-Type", artifact.mimeType);
    res.setHeader("Content-Length", String(artifact.size));
    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  }
}
