import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { NodeCommandExecutor, NodeFileSystem, NodePath } from "@effect/platform-node";
import { Process, ProcessLive } from "@utility/runtime";
import { makeToolRegistry, ToolRegistry } from "@utility/toolkit";
import { videoDownloadTool, VideoDownloadServiceLive } from "@utility/video-download";
import {
  parseExtractorKey,
  parseVideoMetadata,
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

  describe("parseVideoMetadata", () => {
    it("reads title, thumbnail, duration, and uploader from a real site's yt-dlp --dump-json output", () => {
      const stdout = JSON.stringify({
        title: "Me at the zoo",
        thumbnail: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
        duration: 19,
        uploader: "jawed",
        extractor_key: "Youtube",
      });
      expect(parseVideoMetadata(stdout)).toEqual({
        title: "Me at the zoo",
        thumbnailUrl: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
        durationSeconds: 19,
        uploader: "jawed",
      });
    });

    it("defaults title to Untitled and leaves the rest undefined when the fields are missing", () => {
      const stdout = JSON.stringify({ extractor_key: "Youtube" });
      expect(parseVideoMetadata(stdout)).toEqual({
        title: "Untitled",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        uploader: undefined,
      });
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

    it("skips real yt-dlp progress lines and returns the final printed path", () => {
      const stdout = [
        "[download]   0.4% of  246.27KiB at  491.83KiB/s ETA 00:00",
        "[download]   1.2% of  246.27KiB at    1.19MiB/s ETA 00:00",
        "[download] 100.0% of  246.27KiB at   10.64MiB/s ETA 00:00",
        "[download] 100% of  246.27KiB in 00:00:00 at 4.10MiB/s",
        "/tmp/ws_1/output/My Video [abc123].mp3",
      ].join("\n");
      expect(parseFinalOutputPath(stdout)).toBe("/tmp/ws_1/output/My Video [abc123].mp3");
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

  it("registers the video-download tool with all three operations", async () => {
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
      "video-download.info",
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
