import { Context, Effect, Layer } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileSystemError } from "./errors.js";

export interface FileStat {
  readonly size: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly mtime: Date;
}

export interface FileSystem {
  readonly read: (filePath: string) => Effect.Effect<Uint8Array, FileSystemError>;
  readonly readString: (filePath: string, encoding?: BufferEncoding) => Effect.Effect<string, FileSystemError>;
  readonly write: (filePath: string, data: Uint8Array | string) => Effect.Effect<void, FileSystemError>;
  readonly copy: (src: string, dest: string) => Effect.Effect<void, FileSystemError>;
  readonly move: (src: string, dest: string) => Effect.Effect<void, FileSystemError>;
  readonly remove: (filePath: string, options?: { recursive?: boolean; force?: boolean }) => Effect.Effect<void, FileSystemError>;
  readonly exists: (filePath: string) => Effect.Effect<boolean>;
  readonly stat: (filePath: string) => Effect.Effect<FileStat, FileSystemError>;
  readonly createDirectory: (dirPath: string, options?: { recursive?: boolean }) => Effect.Effect<void, FileSystemError>;
  readonly listDirectory: (dirPath: string) => Effect.Effect<readonly string[], FileSystemError>;
  readonly tempPath: (prefix?: string, suffix?: string) => Effect.Effect<string, FileSystemError>;
}

export const FileSystem = Context.GenericTag<FileSystem>("@utility/runtime/FileSystem");

export const FileSystemLive = Layer.succeed(
  FileSystem,
  FileSystem.of({
    read: (filePath: string) =>
      Effect.tryPromise({
        try: async () => {
          const buffer = await fs.readFile(filePath);
          return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        },
        catch: (cause) =>
          new FileSystemError({
            operation: "read",
            path: filePath,
            message: `Failed to read file at ${filePath}`,
            cause,
          }),
      }),

    readString: (filePath: string, encoding: BufferEncoding = "utf-8") =>
      Effect.tryPromise({
        try: () => fs.readFile(filePath, { encoding }),
        catch: (cause) =>
          new FileSystemError({
            operation: "readString",
            path: filePath,
            message: `Failed to read file as string at ${filePath}`,
            cause,
          }),
      }),

    write: (filePath: string, data: Uint8Array | string) =>
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, data);
        },
        catch: (cause) =>
          new FileSystemError({
            operation: "write",
            path: filePath,
            message: `Failed to write file at ${filePath}`,
            cause,
          }),
      }),

    copy: (src: string, dest: string) =>
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.copyFile(src, dest);
        },
        catch: (cause) =>
          new FileSystemError({
            operation: "copy",
            path: `${src} -> ${dest}`,
            message: `Failed to copy ${src} to ${dest}`,
            cause,
          }),
      }),

    move: (src: string, dest: string) =>
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.rename(src, dest);
        },
        catch: (cause) =>
          new FileSystemError({
            operation: "move",
            path: `${src} -> ${dest}`,
            message: `Failed to move ${src} to ${dest}`,
            cause,
          }),
      }),

    remove: (filePath: string, options = { recursive: true, force: true }) =>
      Effect.tryPromise({
        try: () => fs.rm(filePath, options),
        catch: (cause) =>
          new FileSystemError({
            operation: "remove",
            path: filePath,
            message: `Failed to remove ${filePath}`,
            cause,
          }),
      }),

    exists: (filePath: string) =>
      Effect.promise(async () => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      }),

    stat: (filePath: string) =>
      Effect.tryPromise({
        try: async () => {
          const stats = await fs.stat(filePath);
          return {
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            mtime: stats.mtime,
          };
        },
        catch: (cause) =>
          new FileSystemError({
            operation: "stat",
            path: filePath,
            message: `Failed to stat ${filePath}`,
            cause,
          }),
      }),

    createDirectory: (dirPath: string, options = { recursive: true }) =>
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(dirPath, options);
        },
        catch: (cause) =>
          new FileSystemError({
            operation: "createDirectory",
            path: dirPath,
            message: `Failed to create directory at ${dirPath}`,
            cause,
          }),
      }),

    listDirectory: (dirPath: string) =>
      Effect.tryPromise({
        try: () => fs.readdir(dirPath),
        catch: (cause) =>
          new FileSystemError({
            operation: "listDirectory",
            path: dirPath,
            message: `Failed to list directory at ${dirPath}`,
            cause,
          }),
      }),

    tempPath: (prefix = "util_", suffix = "") =>
      Effect.sync(() => {
        const rand = Math.random().toString(36).substring(2, 10);
        const name = `${prefix}${Date.now()}_${rand}${suffix}`;
        return path.join(os.tmpdir(), name);
      }),
  })
);
