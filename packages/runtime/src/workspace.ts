import { Context, Effect, Exit, Layer } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { WorkspaceError } from "./errors.js";
import { WorkspaceId } from "@utility/domain";

import * as os from "node:os";

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
  readonly withWorkspace: <A, E, R>(effectFn: (ws: WorkspaceInstance) => Effect.Effect<A, E, R>, options?: { namePrefix?: string }) => Effect.Effect<A, E | WorkspaceError, R>;
}

export const WorkspaceManager = Context.GenericTag<WorkspaceManager>("@utility/runtime/WorkspaceManager");

const ensureSafeSubpath = (path: Path.Path, baseDir: string, subPath: string): string => {
  const resolved = path.resolve(baseDir, subPath);

  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error(`Path traversal attempt detected: ${subPath}`);
  }

  return resolved;
};

export const makeWorkspaceManager = (config: WorkspaceConfig = {}) => Layer.effect(
  WorkspaceManager,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = config.baseDir || path.join(os.homedir(), ".utility", "workspaces");

    yield* fs.makeDirectory(baseDir, { recursive: true }).pipe(Effect.mapError((err) => new WorkspaceError({
      message: `Failed to initialize workspaces root directory at ${baseDir}`,
      cause: err,
    })));

    const createWorkspace = (options?: { namePrefix?: string }): Effect.Effect<WorkspaceInstance, WorkspaceError> =>
      Effect.gen(function* () {
        const rand = Math.random().toString(36).substring(2, 8);
        const prefix = options?.namePrefix ? `${options.namePrefix}_` : "";
        const id = WorkspaceId(`${prefix}ws_${Date.now()}_${rand}`);
        const rootDir = path.join(baseDir, id);
        const inputDir = path.join(rootDir, "input");
        const tempDir = path.join(rootDir, "temp");
        const outputDir = path.join(rootDir, "output");

        yield* fs.makeDirectory(rootDir, { recursive: true });
        yield* fs.makeDirectory(inputDir, { recursive: true });
        yield* fs.makeDirectory(tempDir, { recursive: true });
        yield* fs.makeDirectory(outputDir, { recursive: true });

        return {
          id,
          rootDir,
          inputDir,
          tempDir,
          outputDir,
          resolveInputPath: (filename: string) => ensureSafeSubpath(path, inputDir, filename),
          allocateOutputPath: (filename: string) => ensureSafeSubpath(path, outputDir, filename),
          allocateTempPath: (filename: string) => ensureSafeSubpath(path, tempDir, filename),
          writeManifest: (manifest: Record<string, unknown>) => fs.writeFileString(path.join(rootDir, "manifest.json"), JSON.stringify(manifest, null, 2)).pipe(
            Effect.mapError((err) => new WorkspaceError({
              workspaceId: id,
              message: `Failed to write manifest in workspace ${id}`,
              cause: err,
            }))
          ),
          cleanup: () => fs.remove(rootDir, { recursive: true, force: true }).pipe(
            Effect.catchAll(() => Effect.void)
          ),
        };
      }).pipe(Effect.mapError((err) => err instanceof WorkspaceError
        ? err
        : new WorkspaceError({ message: `Failed to create workspace`, cause: err })
      ));

    const withWorkspace = <A, E, R>(effectFn: (ws: WorkspaceInstance) => Effect.Effect<A, E, R>, options?: { namePrefix?: string }): Effect.Effect<A, E | WorkspaceError, R> => 
      createWorkspace(options).pipe(Effect.acquireUseRelease(
        (ws) => effectFn(ws),
        (ws, exit) => Exit.isFailure(exit) && config.retainOnError ? Effect.void : ws.cleanup()
      ));

    return {
      createWorkspace,
      withWorkspace,
    };
  })
);

export const WorkspaceManagerLive = makeWorkspaceManager();
