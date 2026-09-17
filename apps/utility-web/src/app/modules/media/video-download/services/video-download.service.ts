import type { ArtifactModel, JobModel } from '@app/domain';
import type { VideoDownloadInfoOutput, VideoDownloadOutput, VideoDownloadAudioOutput } from '@utility/protocol';

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ApiClientService } from '@app/core/services/api-client.service';
import { ArtifactObjectUrlService } from '@app/core/services/artifact-object-url.service';
import { JobTrackerService } from '@app/core';
import { ArtifactModelFromVideoDownloadOutput, ArtifactModelFromVideoDownloadAudioOutput } from '@app/domain';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

export type VideoDownloadKind = 'video' | 'audio';
type VideoDownloadOperation = 'video-download.download' | 'video-download.download-audio';

export interface ErrorDiagnostic {
  title: string;
  message: string;
  suggestion: string;
}

/**
 * Curated stops on yt-dlp's own `-f`/`--audio-format` values — the "tiles + advanced fallback"
 * shape: a real value a designer recognizes, or CUSTOM to type yt-dlp's own selector syntax
 * directly. `format: undefined` for BEST means "omit -f entirely", yt-dlp's own default.
 */
export const VIDEO_FORMAT_TILES: ReadonlyArray<{ id: string; label: string; format?: string }> = [
  { id: 'best', label: 'BEST' },
  { id: '1080p', label: '1080P', format: 'best[height<=1080]' },
  { id: '720p', label: '720P', format: 'best[height<=720]' },
  { id: 'custom-video', label: 'CUSTOM' },
];

export const AUDIO_FORMAT_TILES: ReadonlyArray<{ id: string; label: string; format?: string }> = [
  { id: 'mp3', label: 'MP3', format: 'mp3' },
  { id: 'm4a', label: 'M4A', format: 'm4a' },
  { id: 'wav', label: 'WAV', format: 'wav' },
  { id: 'custom-audio', label: 'CUSTOM' },
];

const CUSTOM_TILE_IDS = new Set(['custom-video', 'custom-audio']);

@Injectable()
export class VideoDownloadService {
  private readonly _apiClient = inject(ApiClientService);
  private readonly _artifactObjectUrl = inject(ArtifactObjectUrlService);
  private readonly _jobTracker = inject(JobTrackerService);

  readonly videoFormatTiles = VIDEO_FORMAT_TILES;
  readonly audioFormatTiles = AUDIO_FORMAT_TILES;

  // ---- URL + metadata ----
  private readonly _url = signal<string>('');
  private readonly _loadedUrl = signal<string | null>(null);
  private readonly _isLoadingInfo = signal<boolean>(false);
  private readonly _info = signal<Option.Option<VideoDownloadInfoOutput>>(Option.none());
  private readonly _infoError = signal<Option.Option<string>>(Option.none());

  readonly url = this._url.asReadonly();
  readonly isLoadingInfo = this._isLoadingInfo.asReadonly();
  readonly info = computed(() => Option.getOrNull(this._info()));
  readonly infoError = computed(() => Option.getOrNull(this._infoError()));
  /** The metadata card and format tiles only make sense once info was loaded for the URL as it reads right now — editing the URL after a successful load hides stale info rather than showing it as if it still applied. */
  readonly canLoadInfo = computed(() => this._url().trim().length > 0 && this._url() !== this._loadedUrl());
  readonly hasLoadedInfo = computed(() => this.info() !== null && this._url() === this._loadedUrl());

  // ---- Format selection ----
  private readonly _selectedKind = signal<VideoDownloadKind | null>(null);
  private readonly _selectedTileId = signal<string | null>(null);
  private readonly _customVideoFormat = signal<string>('');
  private readonly _customAudioFormat = signal<string>('');

  readonly selectedKind = this._selectedKind.asReadonly();
  readonly selectedTileId = this._selectedTileId.asReadonly();
  readonly customVideoFormat = this._customVideoFormat.asReadonly();
  readonly customAudioFormat = this._customAudioFormat.asReadonly();

  readonly activeVideoTileId = computed(() => (this._selectedKind() === 'video' ? this._selectedTileId() : null));
  readonly activeAudioTileId = computed(() => (this._selectedKind() === 'audio' ? this._selectedTileId() : null));

  readonly isCustomTileSelected = computed(() => !!this._selectedTileId() && CUSTOM_TILE_IDS.has(this._selectedTileId()!));

  private readonly _resolvedFormat = computed<string | undefined>(() => {
    const kind = this._selectedKind();
    const tileId = this._selectedTileId();
    if (!kind || !tileId) {
      return undefined;
    }
    if (tileId === 'custom-video') {
      return this._customVideoFormat().trim() || undefined;
    }
    if (tileId === 'custom-audio') {
      return this._customAudioFormat().trim() || undefined;
    }
    const tiles = kind === 'video' ? VIDEO_FORMAT_TILES : AUDIO_FORMAT_TILES;
    return tiles.find((t) => t.id === tileId)?.format;
  });

  readonly canPull = computed(() => {
    if (!this.hasLoadedInfo() || this.isProcessing()) {
      return false;
    }
    const kind = this._selectedKind();
    const tileId = this._selectedTileId();
    if (!kind || !tileId) {
      return false;
    }
    if (tileId === 'custom-video') {
      return this._customVideoFormat().trim().length > 0;
    }
    if (tileId === 'custom-audio') {
      return this._customAudioFormat().trim().length > 0;
    }
    return true;
  });

  // ---- Job + result ----
  private readonly _isSubmitting = signal<boolean>(false);
  private readonly _activeJobId = signal<Option.Option<string>>(Option.none());
  private readonly _activeOperation = signal<VideoDownloadOperation | null>(null);
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());
  private readonly _lastResult = signal<{ operation: VideoDownloadOperation; artifact: ArtifactModel } | null>(null);
  /** The metadata the finished artifact was pulled from — kept alongside the result so the ledger can show real duration/uploader even after the URL field moves on. */
  private readonly _lastResultInfo = signal<VideoDownloadInfoOutput | null>(null);

  readonly activeJob = computed<JobModel | null>(() => {
    const id = this._activeJobId();
    return Option.isNone(id) ? null : this._jobTracker.jobs().find((job) => job.id === id.value) ?? null;
  });
  readonly isProcessing = computed(() => this._isSubmitting() || this.activeJob() !== null);
  readonly errorMessage = computed(() => Option.getOrNull(this._errorMessage()));
  readonly lastResult = this._lastResult.asReadonly();
  readonly lastResultInfo = this._lastResultInfo.asReadonly();

  readonly errorDiagnostic = computed<Option.Option<ErrorDiagnostic>>(() => this._errorMessage().pipe(Option.map((err) => ({
    title: 'Download Failed',
    message: err,
    suggestion: 'Check the URL and format, then retry.',
  }))));

  constructor() {
    effect(() => {
      const job = this.activeJob();

      if (!job || !job.isTerminal) {
        return;
      }

      const operation = this._activeOperation() ?? 'video-download.download';
      this._activeJobId.set(Option.none());

      if (job.status === 'completed') {
        const artifact = operation === 'video-download.download-audio'
          ? ArtifactModelFromVideoDownloadAudioOutput.from(job.result as VideoDownloadAudioOutput)
          : ArtifactModelFromVideoDownloadOutput.from(job.result as VideoDownloadOutput);
        this._lastResult.set({ operation, artifact });
        this._lastResultInfo.set(this.info());
      } else if (job.status === 'failed') {
        this._errorMessage.set(Option.some(job.error ?? 'Download failed'));
      }
    });
  }

  setUrl(value: string): void {
    this._url.set(value);
    this._errorMessage.set(Option.none());
    // The previous fetch's failure was about the URL as it read then — editing the field
    // invalidates that verdict even before a new Load click resolves it one way or the other.
    this._infoError.set(Option.none());
  }

  loadInfo(): void {
    const url = this._url().trim();
    if (!url || this.isLoadingInfo()) {
      return;
    }

    this._isLoadingInfo.set(true);
    this._info.set(Option.none());
    this._infoError.set(Option.none());
    this._selectedKind.set(null);
    this._selectedTileId.set(null);
    this._customVideoFormat.set('');
    this._customAudioFormat.set('');
    this._lastResult.set(null);
    this._errorMessage.set(Option.none());

    this._apiClient.getVideoInfo$(url)
      .pipe(finalize(() => this._isLoadingInfo.set(false)))
      .subscribe(Either.match({
        onRight: (res) => {
          this._info.set(Option.some(res));
          this._loadedUrl.set(url);
        },
        onLeft: (err) => {
          this._infoError.set(Option.some(err.message || 'Could not resolve this URL'));
        },
      }));
  }

  selectFormat(kind: VideoDownloadKind, tileId: string): void {
    this._selectedKind.set(kind);
    this._selectedTileId.set(tileId);
  }

  setCustomVideoFormat(value: string): void {
    this._customVideoFormat.set(value);
  }

  setCustomAudioFormat(value: string): void {
    this._customAudioFormat.set(value);
  }

  executeDownload(): void {
    if (!this.canPull()) {
      return;
    }

    const url = this._loadedUrl();
    const kind = this._selectedKind();
    if (!url || !kind) {
      return;
    }

    const operation: VideoDownloadOperation = kind === 'audio' ? 'video-download.download-audio' : 'video-download.download';
    const format = this._resolvedFormat();
    const label = this.info()?.title ?? url;

    this._activeOperation.set(operation);
    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this._jobTracker.submit$(
      operation,
      label,
      this._apiClient.submitVideoDownloadJob$(operation, url, format)
    )
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start job')),
      }));
  }

  cancelActiveJob(): void {
    const id = this._activeJobId();
    if (Option.isSome(id)) {
      this._jobTracker.cancel(id.value);
    }
  }

  retryLastOperation(): void {
    this.executeDownload();
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  getArtifactFileUrl(id: string): string | null {
    return this._artifactObjectUrl.getFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string | null {
    return this._artifactObjectUrl.getDownloadUrl(id);
  }
}
