import { Context, Effect, Layer } from "effect";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceId } from "@utility/domain";
import { FileSystem } from "./filesystem.js";
import { WorkspaceError } from "./errors.js";

export interface WorkspaceInstance {
  readonly id: WorkspaceId;
  readonly rootDir: string;
  readonly inputDir: string;
  readonly tempDir: string;
  readonly outputDir: string;
  readonly resolveInputPath: (filename: string) => string;
  readonly allocateOutputPath: (filename: string) => string;
  readonly allocateTempPath: (filename: string) => string;
  readonly writeManifest: (manifest: Record<string, unknown>) => Effect.Effect<void, WorkspaceError>;
  readonly cleanup: () => Effect.Effect<void, never>;
}

export interface WorkspaceConfig {
  readonly baseDir?: string;
  readonly retainOnError?: boolean;
}

export interface WorkspaceManager {
  readonly createWorkspace: (options?: { namePrefix?: string }) => Effect.Effect<WorkspaceInstance, WorkspaceError>;
  readonly withWorkspace: <A, E, R>(
    effectFn: (ws: WorkspaceInstance) => Effect.Effect<A, E, R>,
    options?: { namePrefix?: string }
  ) => Effect.Effect<A, E | WorkspaceError, R>;
}

export const WorkspaceManager = Context.GenericTag<WorkspaceManager>("@utility/runtime/WorkspaceManager");

const ensureSafeSubpath = (baseDir: string, subPath: string): string => {
  const resolved = path.resolve(baseDir, subPath);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error(`Path traversal attempt detected: ${subPath}`);
  }
  return resolved;
};

export const makeWorkspaceManager = (config: WorkspaceConfig = {}) =>
  Layer.effect(
    WorkspaceManager,
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const baseDir = config.baseDir || path.join(os.homedir(), ".utility", "workspaces");

      yield* fs.createDirectory(baseDir).pipe(
        Effect.mapError(
          (err) =>
            new WorkspaceError({
              message: `Failed to initialize workspaces root directory at ${baseDir}`,
              cause: err,
            })
        )
      );

      const createWorkspace = (options?: { namePrefix?: string }): Effect.Effect<WorkspaceInstance, WorkspaceError> =>
        Effect.gen(function* () {
          const rand = Math.random().toString(36).substring(2, 8);
          const prefix = options?.namePrefix ? `${options.namePrefix}_` : "";
          const id = WorkspaceId(`${prefix}ws_${Date.now()}_${rand}`);
          const rootDir = path.join(baseDir, id);
          const inputDir = path.join(rootDir, "input");
          const tempDir = path.join(rootDir, "temp");
          const outputDir = path.join(rootDir, "output");

          yield* fs.createDirectory(rootDir);
          yield* fs.createDirectory(inputDir);
          yield* fs.createDirectory(tempDir);
          yield* fs.createDirectory(outputDir);

          const instance: WorkspaceInstance = {
            id,
            rootDir,
            inputDir,
            tempDir,
            outputDir,
            resolveInputPath: (filename: string) => ensureSafeSubpath(inputDir, filename),
            allocateOutputPath: (filename: string) => ensureSafeSubpath(outputDir, filename),
            allocateTempPath: (filename: string) => ensureSafeSubpath(tempDir, filename),
            writeManifest: (manifest: Record<string, unknown>) =>
              fs.write(path.join(rootDir, "manifest.json"), JSON.stringify(manifest, null, 2)).pipe(
                Effect.mapError(
                  (err) =>
                    new WorkspaceError({
                      workspaceId: id,
                      message: `Failed to write manifest in workspace ${id}`,
                      cause: err,
                    })
                )
              ),
            cleanup: () =>
              fs.remove(rootDir).pipe(
                Effect.catchAll(() => Effect.void)
              ),
          };

          return instance;
        }).pipe(
          Effect.mapError(
            (err) =>
              err instanceof WorkspaceError
                ? err
                : new WorkspaceError({
                    message: `Failed to create workspace`,
                    cause: err,
                  })
          )
        );

      const withWorkspace = <A, E, R>(
        effectFn: (ws: WorkspaceInstance) => Effect.Effect<A, E, R>,
        options?: { namePrefix?: string }
      ): Effect.Effect<A, E | WorkspaceError, R> =>
        Effect.acquireUseRelease(
          createWorkspace(options),
          (ws) => effectFn(ws),
          (ws, exit) => {
            if (exit._tag === "Failure" && config.retainOnError) {
              return Effect.void;
            }
            return ws.cleanup();
          }
        );

      return {
        createWorkspace,
        withWorkspace,
      };
    })
  );

export const WorkspaceManagerLive = makeWorkspaceManager();
