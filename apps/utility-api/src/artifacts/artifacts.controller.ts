import type { Response } from "express";

import { Controller, Get, Param, Query, Res, UseGuards, BadRequestException } from "@nestjs/common";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { ArtifactStore, ArtifactError } from "@utility/runtime";
import { ArtifactId } from "@utility/domain";
import { ImageService } from "@utility/image";
import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeStream } from "@effect/platform-node";

@UseGuards(DeviceAuthGuard)
@Controller("artifacts")
export class ArtifactsController {
  constructor(private readonly effectRuntime: EffectRuntimeService) {}

  @Get()
  async listArtifacts(@Query("limit") limitParam?: string, @Query("cursor") cursor?: string, @Query("q") search?: string, @Query("operation") operation?: string) {
    let limit: number | undefined;

    if (limitParam !== undefined) {
      limit = parseInt(limitParam, 10);

      if (!Number.isFinite(limit)) {
        throw new BadRequestException("limit must be a number");
      }
    }

    return this.effectRuntime.runPromise(Effect.Do.pipe(
      Effect.andThen(() => ArtifactStore),
      Effect.andThen((store) => store.listArtifacts({ limit, cursor, search, operation }))
    ));
  }

  @Get(":id")
  async getArtifact(@Param("id") id: string, @Query("download") download: string | undefined, @Res() res: Response) {
    const { artifact, filePath } = await this.effectRuntime.runPromise(Effect.Do.pipe(
      Effect.bind('store', () => ArtifactStore),
      Effect.let('artId', () => ArtifactId(id)),
      Effect.andThen(({ store, artId }) => Effect.all({
        artifact: store.getArtifact(artId),
        filePath: store.getArtifactPath(artId)
      }, { concurrency: 'unbounded' })),
    ));

    if (download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(artifact.name)}"`);
      res.setHeader("Content-Type", artifact.mimeType);

      const stream = await this.effectRuntime.runPromise(Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* NodeStream.toReadable(fs.stream(filePath));
      }));

      return stream.pipe(res);
    }

    return res.json(artifact);
  }

  @Get(":id/file")
  async getArtifactFile(@Param("id") id: string, @Res() res: Response) {
    const { artifact, stream } = await this.effectRuntime.runPromise(Effect.gen(function* () {
      const store = yield* ArtifactStore;
      const fs = yield* FileSystem.FileSystem;
      const artId = ArtifactId(id);
      const art = yield* store.getArtifact(artId);
      const filePath = yield* store.getArtifactPath(artId);
      const readable = yield* NodeStream.toReadable(fs.stream(filePath));

      return { artifact: art, stream: readable };
    }));

    res.setHeader("Content-Type", artifact.mimeType);
    res.setHeader("Content-Length", String(artifact.size));
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(artifact.name)}"`);

    return stream.pipe(res);
  }

  /**
   * A compressed WebP re-encode of an image artifact, for on-screen inspection before the
   * user commits to a download — independent of whatever format they actually chose in
   * "Export As" (a lossless PNG export shouldn't cost its full weight just to look at it).
   * Converted on request, not cached: preview traffic is low-volume and short-lived (a user
   * inspects a result once, right after producing it), so the simplicity of computing fresh
   * beats the complexity of a derived-asset cache for a path this cold.
   */
  @Get(":id/preview")
  async getArtifactPreview(@Param("id") id: string, @Res() res: Response) {
    const { artifact, bytes } = await this.effectRuntime.runPromise(Effect.gen(function* () {
      const store = yield* ArtifactStore;
      const fs = yield* FileSystem.FileSystem;
      const imageService = yield* ImageService;
      const artId = ArtifactId(id);
      const art = yield* store.getArtifact(artId);
      const filePath = yield* store.getArtifactPath(artId);

      if (art.mimeType === "image/webp") {
        const data = yield* fs.readFile(filePath).pipe(
          Effect.mapError((cause) => new ArtifactError({ artifactId: id, message: `Failed to read artifact ${id}`, cause }))
        );
        return { artifact: art, bytes: data };
      }

      const tempPath = yield* fs.makeTempFile({ suffix: ".webp" }).pipe(
        Effect.mapError((cause) => new ArtifactError({ artifactId: id, message: `Failed to allocate a preview temp file for ${id}`, cause }))
      );

      yield* imageService.resize(filePath, tempPath, { format: "webp", quality: 82 }).pipe(
        Effect.mapError((cause) => new ArtifactError({ artifactId: id, message: `Failed to build a preview for ${id}`, cause }))
      );

      const data = yield* fs.readFile(tempPath).pipe(
        Effect.mapError((cause) => new ArtifactError({ artifactId: id, message: `Failed to read the generated preview for ${id}`, cause }))
      );

      yield* fs.remove(tempPath).pipe(Effect.catchAll(() => Effect.void));

      return { artifact: art, bytes: data };
    }));

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(artifact.name)}.webp"`);
    res.send(Buffer.from(bytes));
  }

  @Get(":id/download")
  async downloadArtifact(@Param("id") id: string, @Res() res: Response) {
    const { artifact, stream } = await this.effectRuntime.runPromise(Effect.gen(function* () {
      const store = yield* ArtifactStore;
      const fs = yield* FileSystem.FileSystem;
      const artId = ArtifactId(id);
      const art = yield* store.getArtifact(artId);
      const filePath = yield* store.getArtifactPath(artId);
      const readable = yield* NodeStream.toReadable(fs.stream(filePath));

      return { artifact: art, stream: readable };
    }));

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(artifact.name)}"`);
    res.setHeader("Content-Type", artifact.mimeType);
    res.setHeader("Content-Length", String(artifact.size));

    return stream.pipe(res);
  }
}
