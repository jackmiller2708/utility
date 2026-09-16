# Video Downloader — Backend Design

**Date:** 2026-09-17
**Status:** Approved, pending implementation plan

## Purpose

Add a `video-download` tool to the backend, following the exact `Tool`/`Operation`/adapter-package pattern every existing tool (`image`, `pdf`, `media`) already uses, wrapping the `yt-dlp` CLI the way `packages/media` already wraps `ffmpeg`. Backend only — no frontend work in this round.

## Scope decisions (from user Q&A)

- **Operations:** video download, and a separate audio-only download. No metadata-probe operation exposed publicly (a metadata fetch still happens internally, see below, just not as its own callable operation).
- **Security posture:** restrict to URLs `yt-dlp` resolves to a real, named site extractor. Reject anything that falls through to `yt-dlp`'s generic/direct-file extractor — the app is already gated to trusted LAN devices via `DeviceAuthGuard`, but the generic extractor turns "download a video" into "fetch arbitrary URLs from the server," which is a meaningfully larger blast radius than the feature needs.
- **Execution model:** background job, matching `media.transcode`'s pattern (progress reporting, not a blocking HTTP call).
- **Deployment:** `yt-dlp` ships in the API's Docker image, not just the dev host. Installed via `pip`, not `apt` (Debian's apt package lags upstream releases, and yt-dlp's whole value proposition is chasing sites' frequently-changing pages) and not `flatpak` (needs a desktop-oriented D-Bus/ostree/systemd stack the `node:24-bookworm-slim` base image doesn't have, and flatpak's sandboxing wouldn't expose the workspace directories the tool needs to write into). The Dockerfile runs `yt-dlp -U` right after install as a belt-and-suspenders freshness check, per explicit request — a no-op immediately after a fresh pip install, but cheap insurance if a cached image layer is ever reused.

## Package layout

New `packages/video-download`, mirroring `packages/media` file-for-file:

```
packages/video-download/
  package.json       — mirrors packages/media/package.json (name @utility/video-download)
  tsconfig.json       — mirrors packages/media/tsconfig.json (references domain, protocol, runtime, toolkit)
  src/
    errors.ts
    service.ts
    tool.ts
    index.ts
```

`@utility/video-download` does **not** need an entry in `tsconfig.base.json`'s `paths` — confirmed by precedent: `@utility/media` isn't there either. That map only exists for packages referenced at the TypeScript-source level by *other* packages under `packages/*` (e.g. `@utility/image`/`@utility/pdf` are, because something else imports their source directly); `apps/utility-api` consumes every tool package as a normal npm dependency through its built `dist/` output via the workspace symlink, which needs no path mapping. `packages/*` is already an npm workspaces glob, so the new package is auto-discovered once it has a `package.json`.

New `packages/protocol/src/video-download.ts` for the wire schemas, exported from `packages/protocol/src/index.ts`, mirroring `media.ts`'s `Schema.Struct` style exactly (plain `Input`/`Output` schema + inferred type per operation, `ArtifactSchema` for outputs).

## Errors (`errors.ts`)

Mirrors `media/errors.ts`'s two-tier shape:

```ts
export class UnsupportedSourceError extends Data.TaggedError("UnsupportedSourceError")<{
  readonly url: string;
  readonly message: string;
}> {}

export class DownloadError extends Data.TaggedError("DownloadError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
```

`UnsupportedSourceError` → the preflight resolved the URL to `yt-dlp`'s generic extractor (not a real site) — maps to `BadRequestException` in `effect-runtime.service.ts`, same tier as `InvalidMediaError`.
`DownloadError` → `yt-dlp` ran against a real extractor but failed (removed video, geo-block, network failure, unsupported format request) — maps to `BadRequestException`, same tier as `MediaProcessingError`.

## Service (`service.ts`)

`VideoDownloadService` Effect service, `Context.GenericTag`, backed by the existing `Process` abstraction — no shell involved anywhere; the URL is always one element of an argv array passed straight to `execve`, never interpolated into a shell string, so it carries no command-injection surface regardless of its content.

### Preflight: `resolveMetadata(url)`

Every operation calls this first:

```
yt-dlp --dump-json --no-warnings --skip-download --no-playlist <url>
```

Parses the JSON stdout for `extractor_key`, `title`, `duration`. If `extractor_key === "Generic"`, fails with `UnsupportedSourceError` before any real fetch happens. This single call serves double duty: the security check, and the title/duration used to name the resulting artifact — no second `yt-dlp` invocation needed. `--no-playlist` here (and on the real download call below) means a playlist URL only ever resolves/downloads the one video at that URL, never fans out into the whole playlist.

The resolved `title` is untrusted third-party data. Before it's used to build an artifact name, it's sanitized: strip path separators (`/`, `\`), control characters, and collapse to a safe filename character set, then truncate to a sane length. This is a real requirement, not defensive boilerplate — `ArtifactStore.saveArtifact` (`packages/runtime/src/artifact.ts`) joins `options.name` directly into a disk path with no sanitization of its own (`path.join(storageDir, \`${id}_${options.name}\`)`), so an attacker-crafted video title containing `../` segments is a genuine path-safety concern for this feature specifically, since it's the first tool in the app that names an artifact from data the *user didn't type themselves* rather than from their own uploaded filename.

### `download(url, workspace, options, onProgress)`

```
yt-dlp -f "bestvideo[height<=N]+bestaudio/best[height<=N]" \
  --merge-output-format <container> \
  --no-playlist --newline \
  -o <workspace output path> \
  <url>
```

- `resolution` (`source | 2160p | 1080p | 720p | 480p | 360p`, same enum `media.transcode` already exposes) maps to the `height<=N` selector; `source` omits the height clause entirely (`bestvideo+bestaudio/best`).
- `format` (`mp4 | webm | mkv`) maps to `--merge-output-format`. This is a remux, not a re-encode — muxes whatever streams `yt-dlp` fetched into the target container using the `ffmpeg` already installed in the image. No transcoding is attempted; if the source codecs genuinely can't be remuxed into the requested container, the operation fails with a clear `DownloadError` rather than silently re-encoding (matches this feature's scope — `media.transcode` already exists for actual re-encodes).
- `--newline` forces one `[download]  NN.N% of ...` line per progress update instead of carriage-return overwrites, so the existing `onStdout` streaming hook on `Process.spawn` sees discrete lines to parse — same shape as `parseLastFfmpegTime` already regexes out of `ffmpeg`'s stderr, just matching `(\d+(?:\.\d+)?)%` here and reporting `completed = round(percent)`, `total = 100`.

### `downloadAudio(url, workspace, options, onProgress)`

```
yt-dlp -f bestaudio -x --audio-format <fmt> --no-playlist --newline -o <path> <url>
```

- `format` (`mp3 | aac | wav | flac | ogg`, matching `media`'s existing `AudioFormat` values for UI/API consistency) maps to `yt-dlp`'s `--audio-format` flag, which accepts `vorbis` rather than `ogg` — translated internally the same way `service.ts` already translates its own public `quality: number` into FFmpeg's CRF, so the public enum stays consistent with the sibling `media.extract-audio` operation without leaking `yt-dlp`'s own vocabulary.
- `-f bestaudio` means only the audio stream is ever fetched over the network — cheaper than the video operation's "download everything, discard the picture" for a user who only wants the audio, which is the whole reason this is a separate operation rather than always downloading video and reusing `media.extract-audio` afterward.

## Operations (`tool.ts`)

```ts
export const downloadOperation: Operation<VideoDownloadInput, VideoDownloadOutput, UnsupportedSourceError | DownloadError, VideoDownloadService | ArtifactStore> = {
  id: "video-download.download",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true },
    { name: "resolution", label: "Resolution", type: "select", required: false, defaultValue: "source",
      options: ["source", "2160p", "1080p", "720p", "480p", "360p"] },
    { name: "format", label: "Output Format", type: "select", required: false, defaultValue: "mp4",
      options: ["mp4", "webm", "mkv"] },
  ],
  ...
  producesArtifact: (output) => output.artifact as Artifact,
};

export const downloadAudioOperation: Operation<VideoDownloadAudioInput, VideoDownloadAudioOutput, UnsupportedSourceError | DownloadError, VideoDownloadService | ArtifactStore> = {
  id: "video-download.download-audio",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true },
    { name: "format", label: "Output Format", type: "select", required: false, defaultValue: "mp3",
      options: ["mp3", "aac", "wav", "flac", "ogg"] },
  ],
  ...
};

export const videoDownloadTool = createTool({
  id: "video-download",
  name: "Video Downloader",
  description: "Download a video (or just its audio) from a supported site URL.",
  category: "Media",
  operations: [downloadOperation, downloadAudioOperation],
});
```

`category: "Media"` places it in the sidebar's existing Media group next to "Video & Audio," consistent with how `pdf-merge-split` shares the `"Document"` category with `pdf` rather than inventing a new one.

Both operations' `execute` follows the same three-step shape every existing artifact-producing operation uses (see `media.thumbnail`/`media.extract-audio`): call the service, `artifactStore.saveArtifact` with the sanitized title-derived name plus `metadata: { operation: ... }`, return `{ artifact }`. `context.reportProgress` is threaded straight into the service call, exactly like `media.transcode`.

## Wiring (`effect-runtime.service.ts`)

- Import `videoDownloadTool, VideoDownloadServiceLive, UnsupportedSourceError, DownloadError` from `@utility/video-download`.
- Add `videoDownloadTool` to the `makeToolRegistry([...])` array.
- Add `VideoDownloadServiceLive.pipe(Layer.provide(ProcessServiceLive))` to `AppLive`'s `Layer.mergeAll(...)`, same shape as `FfmpegMediaServiceLive.pipe(Layer.provide(ProcessServiceLive))`.
- Add two branches to `mapErrorToHttpException`: `UnsupportedSourceError` → `BadRequestException(error.message)`, `DownloadError` → `BadRequestException(error.message)`.

## Dockerfile

```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils ffmpeg python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --break-system-packages --no-cache-dir yt-dlp \
    && yt-dlp -U
```

`--break-system-packages` is required on Debian 12 (bookworm)'s Python, which marks the system interpreter externally-managed (PEP 668) and refuses a bare `pip install` otherwise; there's no virtualenv to isolate into here since `yt-dlp` is the only Python thing this image ever runs. `yt-dlp -U` runs once at image-build time as the explicitly-requested freshness check.

## Testing

Confirmed: no package under `packages/*` has its own test files — every tool's tests live at `apps/utility-api/test/<tool>-tools.spec.ts` (e.g. `media-tools.spec.ts`, `pdf-tools.spec.ts`), run through `vitest`. `video-download-tools.spec.ts` follows that same location and shape.

One deliberate deviation from `media-tools.spec.ts`'s convention, worth calling out rather than quietly picking a side: `media-tools.spec.ts` runs the *real* `ffmpeg` binary end-to-end against a locally-generated test video fixture (`buildTestVideo`) — no mocking, because `ffmpeg` only ever touches files already on disk. `video-download` can't fully match that shape, because its one genuinely external dependency is a live third-party website: a true end-to-end test would mean either (a) hitting a real YouTube-class URL in CI — flaky against rate-limits/geo-blocks/ToS and liable to break the moment that site changes its page, which is the exact instability `yt-dlp` itself exists to chase — or (b) pointing at a plain direct-file HTTP fixture, which `yt-dlp` would only reach through the generic extractor this feature explicitly rejects, so it can't stand in for the real path either. So:

- **Unit tests, no subprocess, no network** — the actual new logic, tested directly as pure functions against captured/fixture data: the `title` sanitizer (path separators, control characters, truncation past a fixed length cap — e.g. 150 chars), the `resolution → -f "bestvideo[height<=N]+bestaudio/best[height<=N]"` selector builder (reusing `media`'s existing `RESOLUTION_HEIGHTS` numbers: 2160/1080/720/480/360), the audio-format → `yt-dlp` value mapping (`ogg` → `vorbis`, others pass through), and the extractor-allowlist check (`extractor_key === "Generic"` → `UnsupportedSourceError`) against a fixture JSON blob rather than a real `yt-dlp --dump-json` call.
- **Registry/wiring test, real subprocess, no network** — one test matching `media-tools.spec.ts`'s first case: register `videoDownloadTool` and assert both operation IDs are present. This exercises the real `yt-dlp` binary only for `--version`-shaped no-network calls if at all, confirming the binary is actually installed and the Effect wiring is correct, without depending on any external site.
- **No live-network end-to-end test** against a real video site, and no test attempts to fake one through the generic extractor — flagged here explicitly as a gap this feature's own external dependency makes unavoidable, not an oversight.

## Out of scope for this round

- Frontend (sidebar entry, form, preview) — explicitly backend-only per the request.
- A public metadata-probe operation — the preflight metadata fetch is internal plumbing only for now; exposing it as its own operation (for a "preview before downloading" UI) is a natural frontend-driven follow-up, not needed to ship the backend.
- Playlist download (`--no-playlist` is always set).
- Re-encoding to a container the source codecs can't remux into — `media.transcode` already covers real re-encodes; chaining `video-download.download` → `media.transcode` covers that case without this tool needing to duplicate FFmpeg encode logic.
