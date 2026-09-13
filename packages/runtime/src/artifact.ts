import { Context, Effect, Either, Layer, Option } from "effect";
import { ArtifactError, ArtifactNotFoundError } from "./errors.js";
import { Artifact, ArtifactId } from "@utility/domain";
import { Map as ImmutableMap } from "immutable";
import { FileSystem, Path } from "@effect/platform";
import { Array as Arr } from "effect";

import * as os from "node:os";
import * as crypto from "node:crypto";

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

export interface ArtifactSaveOptions {
  readonly name: string;
  readonly sourcePath: string;
  readonly mimeType?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ArtifactStore {
  readonly saveArtifact: (options: ArtifactSaveOptions) => Effect.Effect<Artifact, ArtifactError>;
  readonly getArtifact: (id: ArtifactId) => Effect.Effect<Artifact, ArtifactNotFoundError>;
  readonly getArtifactPath: (id: ArtifactId) => Effect.Effect<string, ArtifactNotFoundError>;
  readonly listArtifacts: (query?: ArtifactListQuery) => Effect.Effect<ArtifactListResult>;
  readonly deleteArtifact: (id: ArtifactId) => Effect.Effect<void, ArtifactNotFoundError | ArtifactError>;
}

export const ArtifactStore = Context.GenericTag<ArtifactStore>("@utility/runtime/ArtifactStore");

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

const readArtifactFromFilePath = (fs: FileSystem.FileSystem, path: Path.Path, metadataDir: string, filePath: string) => Effect.Do.pipe(
  Effect.andThen(() => fs.readFileString(path.join(metadataDir, filePath))),
  Effect.map((jsonContent)=> Either.try({
    try: () => JSON.parse(jsonContent) as Artifact,
    catch: (errer) => new ArtifactError({
      artifactId: ArtifactId("unknown"),
      message: `Failed to parse artifact metadata from ${filePath}`,
      cause: errer
    }),
  })),
);

const getMimeTypeFromExt = (path: Path.Path, filename: string): string => {
  switch (path.extname(filename).toLowerCase()) {
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

const ArtifactFromOptions = {
  from: (options: ArtifactSaveOptions, id: ArtifactId, path: Path.Path, stat: FileSystem.File.Info, data: Uint8Array): Artifact => ({
    id,
    name: options.name,
    kind: "file",
    mimeType: options.mimeType || getMimeTypeFromExt(path, options.name),
    size: Number(stat.size),
    createdAt: new Date().toISOString(),
    checksum: crypto.createHash("sha256").update(data).digest("hex"),
    metadata: options.metadata
  }),
};

export const makeArtifactStore = (config: ArtifactStoreConfig = {}) => Layer.effect(
  ArtifactStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const storageDir = config.storageDir || path.join(os.homedir(), ".utility", "artifacts");
    const metadataDir = path.join(storageDir, ".meta");

    yield* fs.makeDirectory(storageDir, { recursive: true });
    yield* fs.makeDirectory(metadataDir, { recursive: true });

    // Loads existing metadata on startup
    let artifactsMap = yield* fs.readDirectory(metadataDir).pipe(
      Effect.andThen((filePaths) => Effect.all(
        Arr.filterMap(filePaths, (filePath) => !filePath.endsWith(".json")
          ? Option.none()
          : Option.some(readArtifactFromFilePath(fs, path, metadataDir, filePath))
        ),
        { concurrency: "unbounded" }
      )),
      Effect.map(Arr.filterMap(Either.getRight)),
      Effect.map(Arr.reduce(ImmutableMap<string, Artifact>(), (map, artifact) => map.set(artifact.id, artifact))),
    );

    const saveArtifact = (options: ArtifactSaveOptions): Effect.Effect<Artifact, ArtifactError> => Effect.gen(function* () {
      const rand = crypto.randomBytes(6).toString("hex");
      const id = ArtifactId(`art_${Date.now()}_${rand}`);
      const destPath = path.join(storageDir, `${id}_${options.name}`);
      const metaPath = path.join(metadataDir, `${id}.json`);

      return yield* Effect.Do.pipe(
        Effect.andThen(() => fs.copyFile(options.sourcePath, destPath).pipe(Effect.mapError((err) => 
          new ArtifactError({ artifactId: id, message: `Failed to copy artifact file from ${options.sourcePath}`, cause: err })
        ))),
        Effect.andThen(() => Effect.all({
          stat: fs.stat(destPath).pipe(Effect.mapError((err) => 
            new ArtifactError({ artifactId: id, message: `Failed to stat artifact file at ${destPath}`, cause: err })
          )),
          data: fs.readFile(destPath).pipe(Effect.mapError((err) => 
            new ArtifactError({ artifactId: id, message: `Failed to read artifact for checksum calculation`, cause: err })
          ))
        }, { concurrency: "unbounded" })),
        Effect.map(({ stat, data }) => ArtifactFromOptions.from(options, id, path, stat, data)),
        Effect.andThen((artifact) => fs.writeFileString(metaPath, JSON.stringify(artifact, null, 2)).pipe(
          Effect.mapError((err) => new ArtifactError({ artifactId: id, message: `Failed to save artifact metadata at ${metaPath}`, cause: err })),
          Effect.map(() => artifact)
        )),
        Effect.tap((artifact) => Effect.sync(() => { artifactsMap = artifactsMap.set(id, artifact); })
      ));
    });

    const getArtifact = (id: ArtifactId): Effect.Effect<Artifact, ArtifactNotFoundError> =>
      Effect.sync(() => artifactsMap.get(id)).pipe(Effect.flatMap((art) => art
        ? Effect.succeed(art)
        : Effect.fail(new ArtifactNotFoundError({
            artifactId: id,
            message: `Artifact with ID ${id} not found`,
          })))
      );

    const getArtifactPath = (id: ArtifactId): Effect.Effect<string, ArtifactNotFoundError> => getArtifact(id).pipe(
      Effect.map((art) => path.join(storageDir, `${art.id}_${art.name}`))
    );

    const listArtifacts = (query: ArtifactListQuery = {}): Effect.Effect<ArtifactListResult> => Effect.sync(() => {
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

    const deleteArtifact = (id: ArtifactId): Effect.Effect<void, ArtifactNotFoundError | ArtifactError> => Effect.gen(function* () {
      const art = yield* getArtifact(id);
      const filePath = path.join(storageDir, `${art.id}_${art.name}`);
      const metaPath = path.join(metadataDir, `${id}.json`);

      yield* fs.remove(filePath).pipe(Effect.catchAll(() => Effect.void));
      yield* fs.remove(metaPath).pipe(Effect.catchAll(() => Effect.void));

      artifactsMap = artifactsMap.delete(id);
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
