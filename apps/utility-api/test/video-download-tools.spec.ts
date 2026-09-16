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
