# Video Downloader Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `video-download` Tool (backend only) that wraps `yt-dlp` to download a video or its audio track from a supported site URL, following the exact `Tool`/`Operation`/adapter-package pattern the `media` (FFmpeg) package already uses.

**Architecture:** A new `packages/video-download` package (service.ts wraps `yt-dlp` via the existing `Process` abstraction; tool.ts exposes two `Operation`s), a new `packages/protocol/src/video-download.ts` for wire schemas, then wiring into `apps/utility-api/src/effect/effect-runtime.service.ts`'s registry/layer/error-mapping, plus a Dockerfile change to install `yt-dlp`.

**Tech Stack:** TypeScript, Effect (`effect`), `@effect/platform` `Process`/`Command`, NestJS (`apps/utility-api`), Vitest, `yt-dlp` CLI.

**Spec:** `docs/superpowers/specs/2026-09-17-video-downloader-backend-design.md`

## Global Constraints

- The URL is always one element of a `Process.spawn` argv array — never interpolated into a shell string, at any call site.
- Every real download/audio call is gated by the extractor-allowlist preflight (`extractor_key !== "Generic"`) — this is the one piece of input validation the feature requires and it must run before any real fetch.
- `format` parameters on both operations are thin pass-throughs to yt-dlp's own flag values (`-f`, `--audio-format`) — no invented enums, no translation tables, no default value asserted on yt-dlp's behalf when omitted.
- No hand-written filename sanitizer. Filename safety is: yt-dlp's own output template does yt-dlp's job, `path.basename()` (Node stdlib) on whatever path yt-dlp reports is the one guarantee this codebase's own `ArtifactStore.saveArtifact` needs.
- No `--merge-output-format`, no resolution/container curation, no re-encoding — whatever yt-dlp naturally produces is what gets saved.
- `--no-playlist` on every yt-dlp invocation — a playlist URL only ever resolves the single video at that URL.
- Background-job execution: this comes for free once the operation is registered (see Task 4's e2e note on the existing generic `/api/v1/jobs/:operationId` route) — no bespoke job-wiring code needed.
- `yt-dlp` installed in the Docker image via `pip install --break-system-packages --no-cache-dir yt-dlp`, immediately followed by `yt-dlp -U` — not `apt`, not `flatpak`.
- `category: "Media"` on the tool definition, so it lands in the sidebar's existing Media group.
- Backend only. No frontend changes in this plan.

---

### Task 1: Protocol schemas + package scaffold + errors

**Files:**
- Create: `packages/protocol/src/video-download.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/video-download/package.json`
- Create: `packages/video-download/tsconfig.json`
- Create: `packages/video-download/src/errors.ts`
- Create: `packages/video-download/src/index.ts`

**Interfaces:**
- Produces: `VideoDownloadInputSchema`/`VideoDownloadInput`, `VideoDownloadOutputSchema`/`VideoDownloadOutput`, `VideoDownloadAudioInputSchema`/`VideoDownloadAudioInput`, `VideoDownloadAudioOutputSchema`/`VideoDownloadAudioOutput` (from `@utility/protocol`) — each `Input` is `{ url: string; format?: string }`, each `Output` is `{ artifact: Artifact }`.
- Produces: `UnsupportedSourceError` (fields: `url: string`, `message: string`), `DownloadError` (fields: `operation: string`, `message: string`, `cause?: unknown`) — from `@utility/video-download`.

- [ ] **Step 1: Add the wire schemas to the protocol package**

Create `packages/protocol/src/video-download.ts`:

```ts
import { Schema } from "effect";
import { ArtifactSchema } from "./artifact.js";

export const VideoDownloadInputSchema = Schema.Struct({
  url: Schema.String,
  format: Schema.optional(Schema.String),
});

export type VideoDownloadInput = typeof VideoDownloadInputSchema.Type;

export const VideoDownloadOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type VideoDownloadOutput = typeof VideoDownloadOutputSchema.Type;

export const VideoDownloadAudioInputSchema = Schema.Struct({
  url: Schema.String,
  format: Schema.optional(Schema.String),
});

export type VideoDownloadAudioInput = typeof VideoDownloadAudioInputSchema.Type;

export const VideoDownloadAudioOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
});

export type VideoDownloadAudioOutput = typeof VideoDownloadAudioOutputSchema.Type;
```

- [ ] **Step 2: Export it from the protocol barrel**

Modify `packages/protocol/src/index.ts` — add one line, keeping the existing alphabetical-ish grouping (append at the end, matching how `workflow.js` was appended last):

```ts
export * from "./video-download.js";
```

- [ ] **Step 3: Build the protocol package and verify it compiles**

Run: `npm run build --workspace=@utility/protocol`
Expected: exits 0, `packages/protocol/dist/video-download.js` and `.d.ts` now exist.

- [ ] **Step 4: Scaffold the new package's manifest and TS config**

Create `packages/video-download/package.json`:

```json
{
  "name": "@utility/video-download",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist tsconfig.tsbuildinfo"
  },
  "dependencies": {
    "@utility/domain": "*",
    "@utility/protocol": "*",
    "@utility/runtime": "*",
    "@utility/toolkit": "*",
    "effect": "^3.12.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.8.2"
  }
}
```

Create `packages/video-download/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "references": [
    { "path": "../domain" },
    { "path": "../protocol" },
    { "path": "../runtime" },
    { "path": "../toolkit" }
  ],
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Add the error types**

Create `packages/video-download/src/errors.ts`:

```ts
import { Data } from "effect";

/** The preflight resolved the URL to yt-dlp's generic/direct-file extractor rather than a real, named site. */
export class UnsupportedSourceError extends Data.TaggedError("UnsupportedSourceError")<{
  readonly url: string;
  readonly message: string;
}> {}

/** yt-dlp ran against a real extractor but the operation failed — a bad format selector, a removed video, a network failure, or any other runtime failure yt-dlp itself reports. */
export class DownloadError extends Data.TaggedError("DownloadError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
```

- [ ] **Step 6: Add the barrel (errors only for now — service.ts and tool.ts land in later tasks)**

Create `packages/video-download/src/index.ts`:

```ts
export * from "./errors.js";
```

- [ ] **Step 7: Install workspace deps and build the new package**

Run: `npm install` (picks up the new workspace package), then `npm run build --workspace=@utility/video-download`
Expected: both exit 0. `packages/video-download/dist/errors.js`, `.d.ts`, and `index.js` now exist.

- [ ] **Step 8: Commit**

```bash
git add packages/protocol/src/video-download.ts packages/protocol/src/index.ts \
  packages/video-download/package.json packages/video-download/tsconfig.json \
  packages/video-download/src/errors.ts packages/video-download/src/index.ts \
  package-lock.json
git commit -m "Scaffold video-download package and protocol schemas"
```

---

### Task 2: Pure helper functions (TDD)

**Files:**
- Modify: `packages/video-download/src/service.ts` (new file — create it)
- Modify: `packages/video-download/src/index.ts`
- Create: `apps/utility-api/test/video-download-tools.spec.ts`

**Interfaces:**
- Consumes: `UnsupportedSourceError` (Task 1, `@utility/video-download`).
- Produces: `parseExtractorKey(dumpJsonStdout: string): string`, `assertSupportedExtractor(extractorKey: string, url: string): Effect.Effect<void, UnsupportedSourceError>`, `parseFinalOutputPath(stdout: string): string` (returns the full last-reported path, untouched — no `basename()` inside it), `parseDownloadPercent(text: string): number | null` — all from `@utility/video-download`, all pure (no `Process`, no I/O).

- [ ] **Step 1: Write the failing tests**

Create `apps/utility-api/test/video-download-tools.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import {
  parseExtractorKey,
  assertSupportedExtractor,
  parseFinalOutputPath,
  parseDownloadPercent,
  UnsupportedSourceError,
} from "@utility/video-download";

describe("video-download pure helpers", () => {
  describe("parseExtractorKey", () => {
    it("reads extractor_key from a real site's yt-dlp --dump-json output", () => {
      const stdout = JSON.stringify({ extractor_key: "Youtube", title: "Some Video", id: "abc123" });
      expect(parseExtractorKey(stdout)).toBe("Youtube");
    });

    it("defaults to Generic when extractor_key is missing", () => {
      const stdout = JSON.stringify({ title: "Some Video" });
      expect(parseExtractorKey(stdout)).toBe("Generic");
    });
  });

  describe("assertSupportedExtractor", () => {
    it("succeeds for a real named extractor", async () => {
      const result = await Effect.runPromise(assertSupportedExtractor("Youtube", "https://youtube.com/watch?v=abc"));
      expect(result).toBeUndefined();
    });

    it("fails with UnsupportedSourceError for the generic extractor", async () => {
      const error = await Effect.runPromise(
        assertSupportedExtractor("Generic", "https://example.com/video.mp4").pipe(Effect.flip)
      );
      expect(error).toBeInstanceOf(UnsupportedSourceError);
      expect(error.url).toBe("https://example.com/video.mp4");
    });
  });

  describe("parseFinalOutputPath", () => {
    it("returns the last non-empty stdout line, trimmed", () => {
      const stdout = [
        "[download] Destination: /tmp/foo.f137.mp4",
        "[Merger] Merging formats into \"/tmp/foo.mp4\"",
        "/tmp/ws_1/output/My Video [abc123].mp4",
        "",
      ].join("\n");
      expect(parseFinalOutputPath(stdout)).toBe("/tmp/ws_1/output/My Video [abc123].mp4");
    });

    it("throws when there is no usable output line", () => {
      expect(() => parseFinalOutputPath("   \n  \n")).toThrow("yt-dlp reported no output path");
    });
  });

  describe("parseDownloadPercent", () => {
    it("reads the last percentage yt-dlp printed", () => {
      const text = "[download]  12.0% of 10.00MiB\n[download]  45.3% of 10.00MiB\n";
      expect(parseDownloadPercent(text)).toBe(45.3);
    });

    it("returns null before any progress line has arrived", () => {
      expect(parseDownloadPercent("[youtube] Extracting URL\n")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test --workspace=utility-api -- video-download-tools`
Expected: FAIL — `@utility/video-download` has no exported member `parseExtractorKey` (etc.); the module doesn't export any of these names yet.

- [ ] **Step 3: Implement the pure helpers**

Create `packages/video-download/src/service.ts`:

```ts
import { Effect } from "effect";
import { UnsupportedSourceError } from "./errors.js";

/**
 * Reads the one field this package's preflight cares about from yt-dlp's `--dump-json` output.
 * Malformed JSON here means yt-dlp exited 0 but printed something unreadable — a defect, not a
 * domain error — so this throws and is expected to be wrapped by the caller's `Effect.try`.
 */
export const parseExtractorKey = (dumpJsonStdout: string): string => {
  const parsed = JSON.parse(dumpJsonStdout) as { extractor_key?: string };
  return parsed.extractor_key ?? "Generic";
};

/** The one input-validation check this package performs: does yt-dlp recognize this URL as a real, named site, rather than falling through to its generic/direct-file extractor? */
export const assertSupportedExtractor = (extractorKey: string, url: string): Effect.Effect<void, UnsupportedSourceError> =>
  extractorKey === "Generic"
    ? Effect.fail(new UnsupportedSourceError({
        url,
        message: `No specific downloader recognizes this URL — only named sites are supported, not direct file links: ${url}`,
      }))
    : Effect.void;

/**
 * yt-dlp's `--print after_move:filepath` writes the real destination path to stdout as its own
 * line once its internal write/merge/rename is done. Reads the last non-empty line (rather than
 * assuming stdout is exactly one line) the same way `media`'s `parseLastFfmpegTime` reads
 * ffmpeg's own progress lines — trust the tail, not the shape. Returns the path as yt-dlp
 * reported it, untouched; stripping it down to a bare filename is the caller's job at the one
 * point that actually needs it (see `tool.ts`), not this function's.
 */
export const parseFinalOutputPath = (stdout: string): string => {
  const lines = stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const lastLine = lines[lines.length - 1];

  if (!lastLine) {
    throw new Error("yt-dlp reported no output path on stdout");
  }

  return lastLine;
};

/** Finds the last `NN.N%` yt-dlp prints to stdout as it downloads — same "read the last match in the accumulated buffer" approach `media`'s `parseLastFfmpegTime` uses for ffmpeg's progress. Returns null until the first progress line has arrived. */
export const parseDownloadPercent = (text: string): number | null => {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)%/g)];

  if (matches.length === 0) {
    return null;
  }

  return Number(matches[matches.length - 1][1]);
};
```

- [ ] **Step 4: Export service.ts from the barrel**

Modify `packages/video-download/src/index.ts`:

```ts
export * from "./errors.js";
export * from "./service.js";
```

- [ ] **Step 5: Rebuild the package**

Run: `npm run build --workspace=@utility/video-download`
Expected: exits 0.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npm run test --workspace=utility-api -- video-download-tools`
Expected: PASS — 8 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/video-download/src/service.ts packages/video-download/src/index.ts \
  apps/utility-api/test/video-download-tools.spec.ts
git commit -m "Add video-download pure helper functions (extractor check, output-path parsing, progress parsing)"
```

---

### Task 3: Full service (Process-backed) + Tool operations + registry test (TDD)

**Files:**
- Modify: `packages/video-download/src/service.ts`
- Create: `packages/video-download/src/tool.ts`
- Modify: `packages/video-download/src/index.ts`
- Modify: `apps/utility-api/test/video-download-tools.spec.ts`

**Interfaces:**
- Consumes (Task 1/2): `UnsupportedSourceError`, `DownloadError`, `parseExtractorKey`, `assertSupportedExtractor`, `parseFinalOutputPath`, `parseDownloadPercent` (all `@utility/video-download`); `VideoDownloadInput`/`Output`/`AudioInput`/`AudioOutput` schemas (`@utility/protocol`); `Process`, `WorkspaceInstance`, `ArtifactStore` (`@utility/runtime`); `Operation`, `createTool`, `ProgressReporter` (`@utility/toolkit`); `Artifact` (`@utility/domain`).
- Produces: `VideoDownloadOptions` (`{ format?: string }`), `VideoDownloadService` interface + `Context.GenericTag`, `VideoDownloadServiceLive: Layer.Layer<VideoDownloadService, never, Process>`, `downloadOperation`, `downloadAudioOperation`, `videoDownloadTool` — all from `@utility/video-download`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/utility-api/test/video-download-tools.spec.ts` (add these imports to the existing top-of-file import block, and this new `describe` block at the end of the file):

```ts
// Add to the existing top import block:
import { Layer } from "effect";
import { NodeCommandExecutor, NodeFileSystem, NodePath } from "@effect/platform-node";
import { Process, ProcessLive } from "@utility/runtime";
import { makeToolRegistry, ToolRegistry } from "@utility/toolkit";
import { videoDownloadTool, VideoDownloadServiceLive } from "@utility/video-download";
```

```ts
// New describe block, appended at the end of the file:
describe("video-download tool", () => {
  const ProcessServiceLive = ProcessLive.pipe(
    Layer.provide(NodeCommandExecutor.layer),
    Layer.provide(NodeFileSystem.layer)
  );

  const TestEnv = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    ProcessServiceLive,
    VideoDownloadServiceLive.pipe(Layer.provide(ProcessServiceLive)),
    makeToolRegistry([videoDownloadTool])
  );

  it("registers the video-download tool with both operations", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      return yield* registry.getToolsInfo();
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    const tool = result.tools.find((t) => t.id === "video-download");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("Video Downloader");
    expect(tool?.operations.map((op) => op.id).sort()).toEqual([
      "video-download.download",
      "video-download.download-audio",
    ]);
  });

  it("invokes the real yt-dlp binary (no network) to confirm it's installed and wired", async () => {
    const program = Effect.gen(function* () {
      const process = yield* Process;
      return yield* process.spawn({ executable: "yt-dlp", args: ["--version"] });
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test --workspace=utility-api -- video-download-tools`
Expected: FAIL — `@utility/video-download` has no exported member `videoDownloadTool`/`VideoDownloadServiceLive`.

- [ ] **Step 3: Implement the full service**

Modify `packages/video-download/src/service.ts` — add these imports and this content after the existing pure-function exports (don't remove anything from Task 2):

```ts
import { Context, Layer } from "effect";
import { Process, ProcessError, WorkspaceInstance } from "@utility/runtime";
import { ProgressReporter } from "@utility/toolkit";
import { DownloadError } from "./errors.js";
```

(Merge this with the existing `import { Effect } from "effect";` and `import { UnsupportedSourceError } from "./errors.js";` lines at the top rather than duplicating them — end state: `import { Context, Effect, Layer } from "effect";` and `import { DownloadError, UnsupportedSourceError } from "./errors.js";`.)

```ts
export interface VideoDownloadOptions {
  readonly format?: string;
}

export interface VideoDownloadService {
  readonly checkSourceSupported: (url: string) => Effect.Effect<void, UnsupportedSourceError | DownloadError>;
  readonly download: (
    url: string,
    workspace: WorkspaceInstance,
    options?: VideoDownloadOptions,
    onProgress?: ProgressReporter
  ) => Effect.Effect<string, UnsupportedSourceError | DownloadError>;
  readonly downloadAudio: (
    url: string,
    workspace: WorkspaceInstance,
    options?: VideoDownloadOptions,
    onProgress?: ProgressReporter
  ) => Effect.Effect<string, UnsupportedSourceError | DownloadError>;
}

export const VideoDownloadService = Context.GenericTag<VideoDownloadService>("@utility/video-download/VideoDownloadService");

export const VideoDownloadServiceLive = Layer.effect(
  VideoDownloadService,
  Effect.gen(function* () {
    const process = yield* Process;

    const checkSourceSupported = (url: string): Effect.Effect<void, UnsupportedSourceError | DownloadError> =>
      process
        .spawn({ executable: "yt-dlp", args: ["--dump-json", "--no-warnings", "--skip-download", "--no-playlist", url] })
        .pipe(
          Effect.mapError((err: ProcessError) => new DownloadError({
            operation: "video-download.check-source",
            message: `Could not resolve this URL: ${err.stderr?.trim() || err.message}`,
            cause: err,
          })),
          Effect.flatMap((res) =>
            Effect.try({
              try: () => parseExtractorKey(res.stdout),
              catch: (cause) => new DownloadError({
                operation: "video-download.check-source",
                message: `yt-dlp reported unreadable metadata for this URL: ${cause instanceof Error ? cause.message : String(cause)}`,
                cause,
              }),
            }).pipe(Effect.flatMap((extractorKey) => assertSupportedExtractor(extractorKey, url)))
          )
        );

    const run = (
      operation: string,
      args: readonly string[],
      onProgress?: ProgressReporter
    ): Effect.Effect<string, DownloadError> =>
      Effect.gen(function* () {
        let stdoutBuffer = "";

        const onStdout = onProgress
          ? (chunk: string) => {
              stdoutBuffer += chunk;
              const percent = parseDownloadPercent(stdoutBuffer);
              if (percent !== null) {
                onProgress({ completed: Math.round(percent), total: 100, message: `Downloaded ${percent.toFixed(1)}%` });
              }
              // Bound the buffer — only the tail ever matters for "last percentage seen so far".
              if (stdoutBuffer.length > 4096) {
                stdoutBuffer = stdoutBuffer.slice(-2048);
              }
            }
          : undefined;

        const res = yield* process
          .spawn({ executable: "yt-dlp", args, onStdout })
          .pipe(Effect.mapError((err: ProcessError) => new DownloadError({
            operation,
            message: `${operation} failed: ${err.stderr?.trim() || err.message}`,
            cause: err,
          })));

        return yield* Effect.try({
          try: () => parseFinalOutputPath(res.stdout),
          catch: (cause) => new DownloadError({
            operation,
            message: `${operation} succeeded but reported no output path: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
        });
      });

    const download = (
      url: string,
      workspace: WorkspaceInstance,
      options: VideoDownloadOptions = {},
      onProgress?: ProgressReporter
    ): Effect.Effect<string, UnsupportedSourceError | DownloadError> =>
      Effect.gen(function* () {
        yield* checkSourceSupported(url);

        const args = [
          ...(options.format ? ["-f", options.format] : []),
          "--no-playlist",
          "--newline",
          "-o", workspace.allocateOutputPath("%(title).200B [%(id)s].%(ext)s"),
          "--print", "after_move:filepath",
          url,
        ];

        return yield* run("video-download.download", args, onProgress);
      });

    const downloadAudio = (
      url: string,
      workspace: WorkspaceInstance,
      options: VideoDownloadOptions = {},
      onProgress?: ProgressReporter
    ): Effect.Effect<string, UnsupportedSourceError | DownloadError> =>
      Effect.gen(function* () {
        yield* checkSourceSupported(url);

        const args = [
          "-f", "bestaudio",
          "-x",
          ...(options.format ? ["--audio-format", options.format] : []),
          "--no-playlist",
          "--newline",
          "-o", workspace.allocateOutputPath("%(title).200B [%(id)s].%(ext)s"),
          "--print", "after_move:filepath",
          url,
        ];

        return yield* run("video-download.download-audio", args, onProgress);
      });

    return VideoDownloadService.of({ checkSourceSupported, download, downloadAudio });
  })
);
```

- [ ] **Step 4: Implement the tool operations**

Create `packages/video-download/src/tool.ts`:

```ts
import { basename } from "node:path";
import { Effect } from "effect";
import {
  VideoDownloadInput,
  VideoDownloadInputSchema,
  VideoDownloadOutput,
  VideoDownloadOutputSchema,
  VideoDownloadAudioInput,
  VideoDownloadAudioInputSchema,
  VideoDownloadAudioOutput,
  VideoDownloadAudioOutputSchema,
} from "@utility/protocol";
import { ArtifactStore } from "@utility/runtime";
import { createTool, Operation } from "@utility/toolkit";
import { Artifact } from "@utility/domain";
import { DownloadError, UnsupportedSourceError } from "./errors.js";
import { VideoDownloadService } from "./service.js";

export const downloadOperation: Operation<
  VideoDownloadInput,
  VideoDownloadOutput,
  UnsupportedSourceError | DownloadError,
  VideoDownloadService | ArtifactStore
> = {
  id: "video-download.download",
  name: "Download Video",
  description: "Download a video from a supported site URL.",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true, description: "A URL from a site yt-dlp recognizes" },
    {
      name: "format",
      label: "Format selector",
      type: "string",
      required: false,
      description: "Passed through as yt-dlp's own -f value (e.g. \"best[height<=720]\"). Omit to use yt-dlp's default.",
    },
  ],
  inputSchema: VideoDownloadInputSchema,
  outputSchema: VideoDownloadOutputSchema,
  execute: (input, context) =>
    Effect.gen(function* () {
      const service = yield* VideoDownloadService;
      const artifactStore = yield* ArtifactStore;

      const outputPath = yield* service.download(
        input.url,
        context.workspace,
        { format: input.format },
        context.reportProgress
      );

      const artifact = yield* artifactStore.saveArtifact({
        name: basename(outputPath),
        sourcePath: outputPath,
        metadata: { operation: "video-download.download" },
      });

      return { artifact };
    }),
  producesArtifact: (output) => output.artifact as Artifact,
};

export const downloadAudioOperation: Operation<
  VideoDownloadAudioInput,
  VideoDownloadAudioOutput,
  UnsupportedSourceError | DownloadError,
  VideoDownloadService | ArtifactStore
> = {
  id: "video-download.download-audio",
  name: "Download Audio",
  description: "Download just the audio track from a supported site URL.",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true, description: "A URL from a site yt-dlp recognizes" },
    {
      name: "format",
      label: "Audio format",
      type: "string",
      required: false,
      description: "Passed through as yt-dlp's own --audio-format value (mp3, m4a, opus, flac, wav, ...). Omit for yt-dlp's default (best).",
    },
  ],
  inputSchema: VideoDownloadAudioInputSchema,
  outputSchema: VideoDownloadAudioOutputSchema,
  execute: (input, context) =>
    Effect.gen(function* () {
      const service = yield* VideoDownloadService;
      const artifactStore = yield* ArtifactStore;

      const outputPath = yield* service.downloadAudio(
        input.url,
        context.workspace,
        { format: input.format },
        context.reportProgress
      );

      const artifact = yield* artifactStore.saveArtifact({
        name: basename(outputPath),
        sourcePath: outputPath,
        metadata: { operation: "video-download.download-audio" },
      });

      return { artifact };
    }),
  producesArtifact: (output) => output.artifact as Artifact,
};

export const videoDownloadTool = createTool({
  id: "video-download",
  name: "Video Downloader",
  description: "Download a video (or just its audio) from a supported site URL.",
  category: "Media",
  operations: [downloadOperation, downloadAudioOperation],
});
```

- [ ] **Step 5: Export tool.ts from the barrel**

Modify `packages/video-download/src/index.ts`:

```ts
export * from "./errors.js";
export * from "./service.js";
export * from "./tool.js";
```

- [ ] **Step 6: Rebuild the package**

Run: `npm run build --workspace=@utility/video-download`
Expected: exits 0. (If TypeScript complains about the merged imports from Step 3, fix `service.ts`'s import lines to the single-line merged form shown in that step before re-running.)

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npm run test --workspace=utility-api -- video-download-tools`
Expected: PASS — all 10 tests (8 from Task 2, 2 new). The `--version` test requires `yt-dlp` to actually be on `PATH` in this environment — it already is, per the user's own setup.

- [ ] **Step 8: Commit**

```bash
git add packages/video-download/src/service.ts packages/video-download/src/tool.ts \
  packages/video-download/src/index.ts apps/utility-api/test/video-download-tools.spec.ts
git commit -m "Add VideoDownloadService (yt-dlp-backed) and video-download tool operations"
```

---

### Task 4: Wire into the app registry

**Files:**
- Modify: `apps/utility-api/src/effect/effect-runtime.service.ts`
- Modify: `apps/utility-api/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `videoDownloadTool`, `VideoDownloadServiceLive`, `UnsupportedSourceError`, `DownloadError` (Task 3, `@utility/video-download`).

- [ ] **Step 1: Write the failing e2e test**

Modify `apps/utility-api/test/app.e2e-spec.ts` — add one `it` block, placed after the existing `"POST /api/v1/jobs/media.transcode runs the transcode asynchronously..."` test at the end of the file (immediately before the closing `});` of the outer `describe`):

```ts
  it("GET /api/v1/tools returns the video-download tool and its operations", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/tools")
      .expect(200);

    const tool = res.body.tools.find((t: { id: string }) => t.id === "video-download");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("Video Downloader");
    expect(tool.operations.map((op: { id: string }) => op.id).sort()).toEqual([
      "video-download.download",
      "video-download.download-audio",
    ]);
  });
```

- [ ] **Step 2: Run the e2e test and verify it fails**

Run: `npm run test:e2e --workspace=utility-api`
Expected: the new test FAILs (`tool` is `undefined`) — `video-download` isn't registered in the real app yet. Every other e2e test should still pass.

- [ ] **Step 3: Wire the tool and service into `AppLive`**

Modify `apps/utility-api/src/effect/effect-runtime.service.ts`:

Add to the existing `@utility/media` import block — change:

```ts
import {
  mediaTool,
  FfmpegMediaServiceLive,
  InvalidMediaError,
  MediaProcessingError,
} from "@utility/media";
```

to add a new import right after it:

```ts
import {
  mediaTool,
  FfmpegMediaServiceLive,
  InvalidMediaError,
  MediaProcessingError,
} from "@utility/media";
import {
  videoDownloadTool,
  VideoDownloadServiceLive,
  UnsupportedSourceError,
  DownloadError,
} from "@utility/video-download";
```

Change the registry array:

```ts
const toolRegistryLayer = makeToolRegistry([imageTool, pdfTool, pdfMergeSplitTool, mediaTool]);
```

to:

```ts
const toolRegistryLayer = makeToolRegistry([imageTool, pdfTool, pdfMergeSplitTool, mediaTool, videoDownloadTool]);
```

Add the service layer to `AppLive`'s `Layer.mergeAll(...)` — change:

```ts
  FfmpegMediaServiceLive.pipe(Layer.provide(ProcessServiceLive)),
  toolRegistryLayer,
```

to:

```ts
  FfmpegMediaServiceLive.pipe(Layer.provide(ProcessServiceLive)),
  VideoDownloadServiceLive.pipe(Layer.provide(ProcessServiceLive)),
  toolRegistryLayer,
```

Add two branches to `mapErrorToHttpException` — change:

```ts
    if (error instanceof MediaProcessingError) {
      return new BadRequestException(`Media processing failed: ${error.message}`);
    }
```

to:

```ts
    if (error instanceof MediaProcessingError) {
      return new BadRequestException(`Media processing failed: ${error.message}`);
    }

    if (error instanceof UnsupportedSourceError) {
      return new BadRequestException(error.message);
    }

    if (error instanceof DownloadError) {
      return new BadRequestException(error.message);
    }
```

- [ ] **Step 4: Rebuild the api app**

Run: `npm run build --workspace=utility-api`
Expected: exits 0, no type errors.

- [ ] **Step 5: Run the e2e suite and verify it passes**

Run: `npm run test:e2e --workspace=utility-api`
Expected: PASS — every existing e2e test still passes, plus the new one.

- [ ] **Step 6: Commit**

```bash
git add apps/utility-api/src/effect/effect-runtime.service.ts apps/utility-api/test/app.e2e-spec.ts
git commit -m "Wire video-download tool into the app registry and error mapping"
```

---

### Task 5: Dockerfile

**Files:**
- Modify: `apps/utility-api/Dockerfile`

**Interfaces:** None — this task doesn't touch application code.

- [ ] **Step 1: Add yt-dlp to the runtime image**

Modify `apps/utility-api/Dockerfile` — change:

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

to:

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils ffmpeg python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --break-system-packages --no-cache-dir yt-dlp \
    && yt-dlp -U
```

- [ ] **Step 2: Build the image**

Run (from the repo root, matching `docker-compose.yml`'s `context: .`): `docker build -f apps/utility-api/Dockerfile -t utility-api-video-download-test .`
Expected: exits 0. This rebuilds the full multi-stage image (build stage + runtime stage) and will take a few minutes — that's expected, not a hang.

- [ ] **Step 3: Verify yt-dlp and the pre-existing tools are all present and runnable in the built image**

Run: `docker run --rm utility-api-video-download-test sh -c "yt-dlp --version && ffmpeg -version | head -1 && pdftoppm -v"`
Expected: exits 0. Prints a yt-dlp version string (e.g. `2026.xx.xx`), an ffmpeg version line, and pdftoppm's version banner — confirming the new install didn't break the existing `apt-get install` chain.

- [ ] **Step 4: Remove the test image**

Run: `docker rmi utility-api-video-download-test`

- [ ] **Step 5: Commit**

```bash
git add apps/utility-api/Dockerfile
git commit -m "Install yt-dlp in the API Docker image"
```
