import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import sharp from "sharp";
import {
  WorkspaceManagerLive,
  ArtifactStoreLive,
  WorkspaceManager,
  ArtifactStore,
} from "@utility/runtime";
import { makeToolRegistry, ToolRegistry } from "@utility/toolkit";
import {
  imageTool,
  resizeOperation,
  SharpImageServiceLive,
  ImageService,
} from "@utility/image";

describe("Tool and Runtime Core", () => {
  const TestEnv = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    WorkspaceManagerLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    ArtifactStoreLive.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    SharpImageServiceLive,
    makeToolRegistry([imageTool])
  );

  it("registers and discovers tools via ToolRegistry", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      const info = yield* registry.getToolsInfo();
      return info;
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.tools.length).toBe(1);
    expect(result.tools[0].id).toBe("image");
    expect(result.tools[0].operations.some((op) => op.id === "image.resize")).toBe(true);
  });

  it("executes image.resize operation inside isolated workspace", async () => {
    const program = Effect.gen(function* () {
      const wsManager = yield* WorkspaceManager;
      const fs = yield* FileSystem.FileSystem;

      // Create a test image in memory
      const inputBuffer = yield* Effect.promise(() =>
        sharp({
          create: {
            width: 150,
            height: 150,
            channels: 4,
            background: { r: 0, g: 128, b: 255, alpha: 1 },
          },
        })
          .png()
          .toBuffer()
      );

      return yield* wsManager.withWorkspace((ws) =>
        Effect.gen(function* () {
          const filename = "input.png";
          yield* fs.writeFile(ws.resolveInputPath(filename), inputBuffer);

          const result = yield* resizeOperation.execute(
            {
              file: filename,
              width: 75,
              height: 75,
              fit: "inside",
              format: "webp",
            },
            { workspace: ws }
          );

          return result;
        })
      );
    }).pipe(Effect.provide(TestEnv));

    const result = await Effect.runPromise(program);
    expect(result.artifact).toBeDefined();
    expect(result.artifact.name).toBe("input_resized.webp");
    expect(result.artifact.mimeType).toBe("image/webp");
    expect(result.artifact.size).toBeGreaterThan(0);
    expect(result.artifact.checksum).toBeDefined();
  });
});
