import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Synthesizes a tiny, real MP4 (H.264 video + AAC audio, an FFmpeg test-pattern source and a
 * sine tone) via the real ffmpeg binary. There's no practical hand-built-byte-buffer equivalent
 * to `buildTestPdf` for a container format this structurally complex — but ffmpeg being present
 * is already this package's own system requirement, exactly like Poppler/Ghostscript are for the
 * PDF fixtures, so generating the fixture through it is no extra dependency on the suite.
 */
export function buildTestVideo(options: { durationSeconds?: number; withAudio?: boolean } = {}): Buffer {
  const { durationSeconds = 2, withAudio = true } = options;
  const tmpPath = path.join(os.tmpdir(), `utility-test-video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  const args = ["-y", "-f", "lavfi", "-i", `testsrc=duration=${durationSeconds}:size=64x64:rate=10`];

  if (withAudio) {
    args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${durationSeconds}`);
    args.push("-c:v", "libx264", "-c:a", "aac", "-shortest");
  } else {
    args.push("-c:v", "libx264");
  }

  args.push("-pix_fmt", "yuv420p", tmpPath);

  execFileSync("ffmpeg", args, { stdio: "pipe" });

  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  return buffer;
}
