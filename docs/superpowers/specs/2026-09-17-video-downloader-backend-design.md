# Video Downloader — Backend Design

**Date:** 2026-09-17
**Status:** Approved (revised same day toward a thinner integration surface — see "Thin integration, not a system around yt-dlp" below), pending implementation plan

## Purpose

Add a `video-download` tool to the backend, following the exact `Tool`/`Operation`/adapter-package pattern every existing tool (`image`, `pdf`, `media`) already uses, wrapping the `yt-dlp` CLI the way `packages/media` already wraps `ffmpeg`. Backend only — no frontend work in this round.

## Scope decisions (from user Q&A)

- **Operations:** video download, and a separate audio-only download. No metadata-probe operation, publicly or internally — see the "Thin integration" decision below, which narrowed the preflight check down to source validation only, nothing metadata-shaped.
- **Security posture:** restrict to URLs `yt-dlp` resolves to a real, named site extractor. Reject anything that falls through to `yt-dlp`'s generic/direct-file extractor — the app is already gated to trusted LAN devices via `DeviceAuthGuard`, but the generic extractor turns "download a video" into "fetch arbitrary URLs from the server," which is a meaningfully larger blast radius than the feature needs.
- **Execution model:** background job, matching `media.transcode`'s pattern (progress reporting, not a blocking HTTP call).
- **Deployment:** `yt-dlp` ships in the API's Docker image, not just the dev host. Installed via `pip`, not `apt` (Debian's apt package lags upstream releases, and yt-dlp's whole value proposition is chasing sites' frequently-changing pages) and not `flatpak` (needs a desktop-oriented D-Bus/ostree/systemd stack the `node:24-bookworm-slim` base image doesn't have, and flatpak's sandboxing wouldn't expose the workspace directories the tool needs to write into). The Dockerfile runs `yt-dlp -U` right after install as a belt-and-suspenders freshness check, per explicit request — a no-op immediately after a fresh pip install, but cheap insurance if a cached image layer is ever reused.
- **Thin integration, not a system around yt-dlp** (follow-up decision, same day): the job here is to call yt-dlp, validate *our own* inputs, and relay what yt-dlp reports — not to build parallel machinery re-verifying or re-modeling what yt-dlp already does on its own. Confirmed the extractor-allowlist preflight stays (it *is* the input validation), but everything downstream of that got thinner: no invented resolution/container enums or translation layers onto yt-dlp's own flag vocabulary, and no hand-written filename sanitizer duplicating what yt-dlp's own output-template handling already does — see "Filename safety" and the per-operation sections below for what replaced each.

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

### Preflight: `checkSourceSupported(url)`

Every operation calls this first:

```
yt-dlp --dump-json --no-warnings --skip-download --no-playlist <url>
```

Parses the JSON stdout for `extractor_key`. If `extractor_key === "Generic"`, fails with `UnsupportedSourceError` before any real fetch happens. `--no-playlist` here (and on the real download call below) means a playlist URL only ever resolves/downloads the one video at that URL, never fans out into the whole playlist.

`title`/`duration` are **not** read from this call — see below. Keeping this preflight to exactly the one thing it validates (is this URL a real, named site) keeps it honestly an input-validation step rather than growing into a second metadata-fetching responsibility.

### Filename safety, without a custom sanitizer

Earlier drafts of this spec had the service read `title` from the preflight JSON and run it through a hand-written sanitizer (strip separators, strip control characters, truncate) before handing it to `ArtifactStore.saveArtifact`. That's exactly the kind of thing this round is trying to avoid: bespoke logic re-implementing something the actual authority already has to solve. yt-dlp already builds real on-disk filenames out of untrusted remote titles on every single run it's ever made, for every user — filename sanitization is core to what it does, not an edge case of it. So: let the output template do that job, and only add the one line of *our own* code needed to protect *our own* system, not yt-dlp's.

- `-o` uses yt-dlp's own template syntax: `"<workspace output dir>/%(title).200B [%(id)s].%(ext)s"` — `.200B` caps the title's contribution to 200 bytes so the whole filename can't run unbounded.
- `--print after_move:filepath` has yt-dlp report the real final path on stdout once its own internal write/merge/rename is done — read the last non-empty stdout line after the process exits (same "trust the last line" approach `parseLastFfmpegTime` already uses for ffmpeg's progress).
- The one line of defense that's actually ours: `path.basename()` (Node's own stdlib, not custom logic) on that reported path before it's passed as `ArtifactStore.saveArtifact`'s `name`. `saveArtifact` (`packages/runtime/src/artifact.ts`) joins `options.name` straight into a disk path with no sanitization of its own (`path.join(storageDir, \`${id}_${options.name}\`)`), so *something* has to guarantee that string carries no path separators before it reaches that join — `path.basename()` guarantees exactly that, unconditionally, regardless of what yt-dlp did or didn't do internally. That's the actual boundary of what this package is responsible for: not re-verifying yt-dlp's filename handling, just making sure nothing yt-dlp reports can walk the string it hands us out of our own storage directory.

Both operations below pass their `format` parameter close to verbatim into yt-dlp's own flags — yt-dlp, not this package, is the authority on what values are valid, and a bad value simply comes back as a `DownloadError` carrying yt-dlp's own message, the same as any other yt-dlp failure.

### `download(url, workspace, options, onProgress)`

```
yt-dlp [-f <options.format>] --no-playlist --newline \
  -o "<workspace output dir>/%(title).200B [%(id)s].%(ext)s" \
  --print after_move:filepath \
  <url>
```

- `format` (optional string) is passed straight through as yt-dlp's own `-f` selector value (e.g. `"bestvideo+bestaudio/best"`, `"best[height<=720]"`, `"18"` — whatever selector syntax yt-dlp itself documents). Omitted entirely when the caller doesn't supply one, which leaves the choice to yt-dlp's own default behavior rather than us asserting a default selector on its behalf.
- No `--merge-output-format`: whatever container yt-dlp naturally produces (driven by the selected streams and its own merge behavior) is what gets saved. This package does not promise a specific output container.
- The `%(title)s`/`%(id)s`/`%(ext)s` output template comes from yt-dlp itself, so we never have to predict the real extension ahead of time. `--print after_move:filepath` has yt-dlp report the true final path on stdout after any internal merge/rename step, which the service reads directly rather than re-deriving or scanning the output directory for it — yt-dlp already knows where the file ended up; asking it is simpler and more reliable than reconstructing that path ourselves.
- `--newline` forces one `[download]  NN.N% of ...` line per progress update instead of carriage-return overwrites, so the existing `onStdout` streaming hook on `Process.spawn` sees discrete lines to parse — same shape as `parseLastFfmpegTime` already regexes out of `ffmpeg`'s stderr, just matching `(\d+(?:\.\d+)?)%` here and reporting `completed = round(percent)`, `total = 100`.

### `downloadAudio(url, workspace, options, onProgress)`

```
yt-dlp -f bestaudio -x [--audio-format <options.format>] --no-playlist --newline \
  -o "<workspace output dir>/%(title).200B [%(id)s].%(ext)s" \
  --print after_move:filepath \
  <url>
```

- `format` (optional string) passes straight through as yt-dlp's own `--audio-format` value (its documented vocabulary — `best`, `aac`, `alac`, `flac`, `m4a`, `mp3`, `opus`, `vorbis`, `wav` — not translated or renamed to match `media`'s sibling `AudioFormat` type). Omitted when not supplied, leaving yt-dlp's own default (`best`) in effect.
- `-f bestaudio` means only the audio stream is ever fetched over the network — cheaper than the video operation's "download everything, discard the picture" for a user who only wants the audio, which is the whole reason this is a separate operation rather than always downloading video and reusing `media.extract-audio` afterward.
- Same output-template and `--print after_move:filepath` handling as `download`, above.

## Operations (`tool.ts`)

```ts
export const downloadOperation: Operation<VideoDownloadInput, VideoDownloadOutput, UnsupportedSourceError | DownloadError, VideoDownloadService | ArtifactStore> = {
  id: "video-download.download",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true },
    { name: "format", label: "Format selector", type: "string", required: false,
      description: "Passed through as yt-dlp's own -f value (e.g. \"best[height<=720]\"). Omit to use yt-dlp's default." },
  ],
  ...
  producesArtifact: (output) => output.artifact as Artifact,
};

export const downloadAudioOperation: Operation<VideoDownloadAudioInput, VideoDownloadAudioOutput, UnsupportedSourceError | DownloadError, VideoDownloadService | ArtifactStore> = {
  id: "video-download.download-audio",
  parameters: [
    { name: "url", label: "Video URL", type: "string", required: true },
    { name: "format", label: "Audio format", type: "string", required: false,
      description: "Passed through as yt-dlp's own --audio-format value (mp3, m4a, opus, flac, wav, ...). Omit for yt-dlp's default (best)." },
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

Both operations' `execute` follows the same three-step shape every existing artifact-producing operation uses (see `media.thumbnail`/`media.extract-audio`): call the service, `artifactStore.saveArtifact` with `path.basename()` of the service's reported output path as `name` plus `metadata: { operation: ... }`, return `{ artifact }`. `context.reportProgress` is threaded straight into the service call, exactly like `media.transcode`.

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

- **Unit tests, no subprocess, no network** — the actual new logic, tested directly as pure functions against captured/fixture data: the extractor-allowlist check (`extractor_key === "Generic"` → `UnsupportedSourceError`) against a fixture JSON blob rather than a real `yt-dlp --dump-json` call, and the `--print after_move:filepath` stdout parsing (last non-empty line) feeding into `path.basename()` — proving a crafted multi-line or path-separator-laden reported path still yields a bare, separator-free filename.
- **Registry/wiring test, real subprocess, no network** — one test matching `media-tools.spec.ts`'s first case: register `videoDownloadTool` and assert both operation IDs are present. This exercises the real `yt-dlp` binary only for `--version`-shaped no-network calls if at all, confirming the binary is actually installed and the Effect wiring is correct, without depending on any external site.
- **No live-network end-to-end test** against a real video site, and no test attempts to fake one through the generic extractor — flagged here explicitly as a gap this feature's own external dependency makes unavoidable, not an oversight.

## Out of scope for this round

- Frontend (sidebar entry, form, preview) — explicitly backend-only per the request.
- A public metadata-probe operation, and metadata (title/duration/thumbnail) generally — the preflight only ever checks `extractor_key`, nothing else. Exposing a real metadata fetch (for a "preview before downloading" UI) is a natural frontend-driven follow-up, not needed to ship the backend.
- Playlist download (`--no-playlist` is always set).
- Any format/container/resolution curation, guarantee, or re-encoding on our side — `format` is a thin pass-through to yt-dlp's own selector syntax, full stop. Wanting a guaranteed container or resolution is what `media.transcode` is for; chaining `video-download.download` → `media.transcode` covers that without this tool needing an opinion about codecs at all.
