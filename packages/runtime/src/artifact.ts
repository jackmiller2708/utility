import { Context, Effect, Layer } from "effect";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { Artifact, ArtifactId } from "@utility/domain";
import { FileSystem } from "./filesystem.js";
import { ArtifactError, ArtifactNotFoundError } from "./errors.js";

const DEFAULT_ARTIFACT_LIST_LIMIT = 30;
const MAX_ARTIFACT_LIST_LIMIT = 200;

/** Opaque to callers — just the sort key of the last artifact on the previous page. */
const encodeArtifactCursor = (art: Artifact): string => `${art.createdAt}|${art.id}`;

const decodeArtifactCursor = (cursor: string): { createdAt: string; id: string } | null => {
  const separatorIndex = cursor.indexOf("|");
  if (separatorIndex === -1) {
    return null;
  }
  return { createdAt: cursor.slice(0, separatorIndex), id: cursor.slice(separatorIndex + 1) };
};

export interface ArtifactStoreConfig {
  readonly storageDir?: string;
}

export interface ArtifactListQuery {
  /** Capped at `MAX_ARTIFACT_LIST_LIMIT`; defaults to `DEFAULT_ARTIFACT_LIST_LIMIT`. */
  readonly limit?: number;
  /** Opaque — pass back exactly what the previous page's `nextCursor` returned. */
  readonly cursor?: string;
  /** Case-insensitive substring match on the artifact's name. */
  readonly search?: string;
  /** Exact match on `metadata.operation` (e.g. "image.resize"). */
  readonly operation?: string;
}

export interface ArtifactListResult {
  readonly artifacts: readonly Artifact[];
  readonly nextCursor: string | null;
  /** Count of artifacts matching `search`/`operation` across the whole store, not just this page — already computed as a side effect of locating the page, so it costs nothing extra to return. */
  readonly total: number;
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

  readonly listArtifacts: (query?: ArtifactListQuery) => Effect.Effect<ArtifactListResult>;

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
          case ".mp3":
            return "audio/mpeg";
          case ".aac":
            return "audio/aac";
          case ".wav":
            return "audio/wav";
          case ".flac":
            return "audio/flac";
          case ".ogg":
            return "audio/ogg";
          case ".mp4":
            return "video/mp4";
          case ".webm":
            return "video/webm";
          case ".mov":
            return "video/quicktime";
          case ".mkv":
            return "video/x-matroska";
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

      const listArtifacts = (query: ArtifactListQuery = {}): Effect.Effect<ArtifactListResult> =>
        Effect.sync(() => {
          const limit = Math.min(Math.max(query.limit ?? DEFAULT_ARTIFACT_LIST_LIMIT, 1), MAX_ARTIFACT_LIST_LIMIT);
          const search = query.search?.trim().toLowerCase();

          let matches = Array.from(artifactsMap.values()).sort((a, b) => {
            // createdAt alone can collide (e.g. a batch's jobs completing in the same millisecond);
            // id is a monotonic Date.now()-prefixed string, so it breaks ties deterministically.
            const byDate = b.createdAt.localeCompare(a.createdAt);
            return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
          });

          if (search) {
            matches = matches.filter((art) => art.name.toLowerCase().includes(search));
          }
          if (query.operation) {
            matches = matches.filter((art) => art.metadata?.["operation"] === query.operation);
          }

          let startIndex = 0;
          if (query.cursor) {
            const decoded = decodeArtifactCursor(query.cursor);
            if (decoded) {
              const cursorIndex = matches.findIndex((art) => art.createdAt === decoded.createdAt && art.id === decoded.id);
              // An unknown/stale cursor (e.g. the artifact it pointed to was deleted) falls back
              // to the top of the (filtered) list rather than failing the request.
              startIndex = cursorIndex === -1 ? 0 : cursorIndex + 1;
            }
          }

          const page = matches.slice(startIndex, startIndex + limit);
          const nextCursor = startIndex + limit < matches.length ? encodeArtifactCursor(page[page.length - 1]) : null;

          return { artifacts: page, nextCursor, total: matches.length };
        });

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
