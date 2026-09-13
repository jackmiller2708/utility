import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem, NodeCommandExecutor, NodePath } from "@effect/platform-node";
import {
  ProcessLive,
  WorkspaceManagerLive,
  ArtifactStoreLive,
  WorkspaceManager,
} from "@utility/runtime";
import { makeToolRegistry, ToolRegistry } from "@utility/toolkit";
import {
  mediaTool,
  inspectOperation,
  thumbnailOperation,
  extractAudioOperation,
  transcodeOperation,
  FfmpegMediaServiceLive,
} from "@utility/media";
import { buildTestVideo } from "./support/media-fixtures.js";

describe("Media tools", () => {
  const ProcessServiceLive = ProcessLive.pipe(
    Layer.provide(NodeCommandExecutor.layer),
    Layer.provide(NodeFileSystem.layer)
  );

  const TestEnv = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    ProcessServiceLive,
    WorkspaceManagerLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    ArtifactStoreLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    FfmpegMediaServiceLive.pipe(Layer.provide(ProcessServiceLive)),
    makeToolRegistry([mediaTool])
  );

  it("registers the media tool with its four operations", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      return yield* registry.getToolsInfo();
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    const media = result.tools.find((t) => t.id === "media");
    expect(media).toBeDefined();
    expect(media?.operations.map((op) => op.id).sort()).toEqual([
      "media.extract-audio",
      "media.inspect",
      "media.thumbnail",
      "media.transcode",
    ]);
  });

  it("inspects duration, format, and video/audio streams for a real video", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* inspectOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.video).not.toBeNull();
    expect(result.video?.width).toBeGreaterThan(0);
    expect(result.video?.height).toBeGreaterThan(0);
    expect(result.audio).not.toBeNull();
    expect(result.audio?.channels).toBeGreaterThan(0);
  });

  it("inspects a video with no audio track", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 1, withAudio: false });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* inspectOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.video).not.toBeNull();
    expect(result.audio).toBeNull();
  });

  it("rejects a non-media file with a descriptive error", async () => {
    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "not-a-video.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), Buffer.from("this is not a video"));

          return yield* inspectOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    await expect(Effect.runPromise(program)).rejects.toThrow();
  });

  it("captures a thumbnail frame as an image artifact", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 2 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* thumbnailOperation.execute(
            { file: filename, width: 32, format: "png" },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.mimeType).toBe("image/png");
    expect(result.artifact.size).toBeGreaterThan(0);
    expect(result.artifact.name).toBe("input_thumbnail.png");
  });

  it("defaults the thumbnail timestamp to 10% into the clip", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 2 });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* thumbnailOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.mimeType).toBe("image/jpeg");
    expect(result.artifact.size).toBeGreaterThan(0);
  });

  it("extracts the audio track as a standalone audio artifact", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* extractAudioOperation.execute(
            { file: filename, format: "mp3" },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.mimeType).toBe("audio/mpeg");
    expect(result.artifact.size).toBeGreaterThan(0);
    expect(result.artifact.name).toBe("input_audio.mp3");
  });

  it("extracts audio in a different format", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 1, withAudio: true });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* extractAudioOperation.execute(
            { file: filename, format: "wav" },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.mimeType).toBe("audio/wav");
    expect(result.artifact.size).toBeGreaterThan(0);
  });

  it("transcodes a video to a different resolution and reports progress", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 2, withAudio: true });
    const progressUpdates: Array<{ completed: number; total: number }> = [];

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* transcodeOperation.execute(
            { file: filename, format: "mp4", resolution: "360p", quality: 50 },
            {
              workspace: ws,
              reportProgress: (progress) =>
                progressUpdates.push({ completed: progress.completed, total: progress.total }),
            }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.mimeType).toBe("video/mp4");
    expect(result.artifact.size).toBeGreaterThan(0);
    expect(result.artifact.name).toBe("input_transcoded.mp4");
  });

  it("transcodes without audio when preserveAudio is false", async () => {
    const videoBuffer = buildTestVideo({ durationSeconds: 1, withAudio: true });

    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), videoBuffer);

          return yield* transcodeOperation.execute(
            { file: filename, format: "mp4", preserveAudio: false },
            { workspace: ws }
          );
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact.size).toBeGreaterThan(0);
  });

  it("rejects an invalid media file passed to transcode", async () => {
    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "not-a-video.mp4";
          yield* fs.writeFile(ws.resolveInputPath(filename), Buffer.from("this is not a video"));

          return yield* transcodeOperation.execute({ file: filename }, { workspace: ws });
        })
      );
    }).pipe(Effect.provide(TestEnv));

    await expect(Effect.runPromise(program)).rejects.toThrow();
  });
});
