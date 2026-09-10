import { Context, Effect, Layer } from "effect";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { Artifact, ArtifactId } from "@utility/domain";
import { FileSystem } from "./filesystem.js";
import { ArtifactError, ArtifactNotFoundError } from "./errors.js";

export interface ArtifactStoreConfig {
  readonly storageDir?: string;
}

export interface ArtifactStore {
  readonly saveArtifact: (options: {
    readonly name: string;
    readonly sourcePath: string;
    readonly mimeType?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }) => Effect.Effect<Artifact, ArtifactError>;

  readonly getArtifact: (id: ArtifactId) => Effect.Effect<Artifact, ArtifactNotFoundError>;

  readonly getArtifactPath: (id: ArtifactId) => Effect.Effect<string, ArtifactNotFoundError>;

  readonly listArtifacts: () => Effect.Effect<readonly Artifact[]>;

  readonly deleteArtifact: (id: ArtifactId) => Effect.Effect<void, ArtifactNotFoundError | ArtifactError>;
}

export const ArtifactStore = Context.GenericTag<ArtifactStore>("@utility/runtime/ArtifactStore");

export const makeArtifactStore = (config: ArtifactStoreConfig = {}) =>
  Layer.effect(
    ArtifactStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const storageDir = config.storageDir || path.join(os.homedir(), ".utility", "artifacts");
      const metadataDir = path.join(storageDir, ".meta");

      yield* fs.createDirectory(storageDir);
      yield* fs.createDirectory(metadataDir);

      const artifactsMap = new Map<string, Artifact>();

      // Load existing metadata on startup
      yield* fs.listDirectory(metadataDir).pipe(
        Effect.flatMap((files) =>
          Effect.forEach(
            files.filter((f) => f.endsWith(".json")),
            (file) =>
              Effect.gen(function* () {
                const content = yield* fs.readString(path.join(metadataDir, file));
                try {
                  const artifact = JSON.parse(content) as Artifact;
                  artifactsMap.set(artifact.id, artifact);
                } catch {
                  // ignore corrupted metadata files
                }
              }),
            { concurrency: "unbounded" }
          )
        ),
        Effect.catchAll(() => Effect.void)
      );

      const getMimeTypeFromExt = (filename: string): string => {
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
          case ".jpg":
          case ".jpeg":
            return "image/jpeg";
          case ".png":
            return "image/png";
          case ".webp":
            return "image/webp";
          case ".avif":
            return "image/avif";
          case ".gif":
            return "image/gif";
          case ".svg":
            return "image/svg+xml";
          case ".pdf":
            return "application/pdf";
          case ".json":
            return "application/json";
          default:
            return "application/octet-stream";
        }
      };

      const saveArtifact = (options: {
        readonly name: string;
        readonly sourcePath: string;
        readonly mimeType?: string;
        readonly metadata?: Readonly<Record<string, unknown>>;
      }): Effect.Effect<Artifact, ArtifactError> =>
        Effect.gen(function* () {
          const rand = crypto.randomBytes(6).toString("hex");
          const id = ArtifactId(`art_${Date.now()}_${rand}`);
          const destPath = path.join(storageDir, `${id}_${options.name}`);
          const metaPath = path.join(metadataDir, `${id}.json`);

          yield* fs.copy(options.sourcePath, destPath).pipe(
            Effect.mapError(
              (err) =>
                new ArtifactError({
                  artifactId: id,
                  message: `Failed to copy artifact file from ${options.sourcePath}`,
                  cause: err,
                })
            )
          );

          const stat = yield* fs.stat(destPath).pipe(
            Effect.mapError(
              (err) =>
                new ArtifactError({
                  artifactId: id,
                  message: `Failed to stat artifact file at ${destPath}`,
                  cause: err,
                })
            )
          );

          // Calculate SHA256 checksum
          const data = yield* fs.read(destPath).pipe(
            Effect.mapError(
              (err) =>
                new ArtifactError({
                  artifactId: id,
                  message: `Failed to read artifact for checksum calculation`,
                  cause: err,
                })
            )
          );
          const checksum = crypto.createHash("sha256").update(data).digest("hex");

          const mimeType = options.mimeType || getMimeTypeFromExt(options.name);

          const artifact: Artifact = {
            id,
            name: options.name,
            kind: "file",
            mimeType,
            size: stat.size,
            createdAt: new Date().toISOString(),
            checksum,
            metadata: options.metadata,
          };

          yield* fs.write(metaPath, JSON.stringify(artifact, null, 2)).pipe(
            Effect.mapError(
              (err) =>
                new ArtifactError({
                  artifactId: id,
                  message: `Failed to save artifact metadata at ${metaPath}`,
                  cause: err,
                })
            )
          );

          artifactsMap.set(id, artifact);
          return artifact;
        });

      const getArtifact = (id: ArtifactId): Effect.Effect<Artifact, ArtifactNotFoundError> =>
        Effect.sync(() => artifactsMap.get(id)).pipe(
          Effect.flatMap((art) =>
            art
              ? Effect.succeed(art)
              : Effect.fail(
                  new ArtifactNotFoundError({
                    artifactId: id,
                    message: `Artifact with ID ${id} not found`,
                  })
                )
          )
        );

      const getArtifactPath = (id: ArtifactId): Effect.Effect<string, ArtifactNotFoundError> =>
        getArtifact(id).pipe(
          Effect.map((art) => path.join(storageDir, `${art.id}_${art.name}`))
        );

      const listArtifacts = (): Effect.Effect<readonly Artifact[]> =>
        Effect.sync(() => Array.from(artifactsMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      const deleteArtifact = (id: ArtifactId): Effect.Effect<void, ArtifactNotFoundError | ArtifactError> =>
        Effect.gen(function* () {
          const art = yield* getArtifact(id);
          const filePath = path.join(storageDir, `${art.id}_${art.name}`);
          const metaPath = path.join(metadataDir, `${id}.json`);

          yield* fs.remove(filePath).pipe(Effect.catchAll(() => Effect.void));
          yield* fs.remove(metaPath).pipe(Effect.catchAll(() => Effect.void));
          artifactsMap.delete(id);
        });

      return {
        saveArtifact,
        getArtifact,
        getArtifactPath,
        listArtifacts,
        deleteArtifact,
      };
    })
  );

export const ArtifactStoreLive = makeArtifactStore();
