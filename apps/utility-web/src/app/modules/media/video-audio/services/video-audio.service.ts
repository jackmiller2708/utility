import type { ArtifactModel, JobModel, ToolParameterModel } from '@app/domain';
import type { MediaInspectOutput, MediaThumbnailOutput, MediaExtractAudioOutput, MediaTranscodeOutput } from '@utility/protocol';

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ApiClientService } from '@app/core/services/api-client.service';
import { ArtifactObjectUrlService } from '@app/core/services/artifact-object-url.service';
import { JobTrackerService, RuntimeStatusService } from '@app/core';
import {
  ArtifactModelFromMediaThumbnailOutput,
  ArtifactModelFromMediaExtractAudioOutput,
  ArtifactModelFromMediaTranscodeOutput,
} from '@app/domain';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

export type VideoAudioMode = 'single' | 'batch';
export type VideoAudioBatchOperation = 'media.inspect' | 'media.thumbnail' | 'media.extract-audio' | 'media.transcode';
export type VideoAudioJobOperation = 'media.thumbnail' | 'media.extract-audio' | 'media.transcode';

export interface BatchFileRow {
  readonly id: string;
  readonly file: File;
  /** Fetched via `media.inspect` the moment the file is added — mirrors PDF Documents' eager per-file inspect, here surfacing duration instead of page count. */
  readonly durationSeconds: number | null;
  readonly inspecting: boolean;
}

export interface BatchInspectRow {
  readonly fileName: string;
  readonly durationSeconds: number;
  readonly format: string;
  readonly video: MediaInspectOutput['video'];
  readonly audio: MediaInspectOutput['audio'];
}

/** See image-resize's own MAX_BATCH_FILES for why: bounds concurrent server-side ffmpeg processes and keeps the file list from pushing settings and the submit button off-screen. */
const MAX_BATCH_FILES = 25;

let videoAudioBatchRowIdCounter = 0;
const nextVideoAudioBatchRowId = () => `video_audio_batch_row_${++videoAudioBatchRowIdCounter}`;

export interface SelectedMediaFile {
  readonly file: File;
  readonly previewUrl: string;
  readonly name: string;
  readonly size: number;
}

export interface ErrorDiagnostic {
  title: string;
  message: string;
  suggestion: string;
}

/**
 * Quality is FFmpeg's CRF renamed and hidden behind three named presets — the same
 * "never expose codec jargon" rule that keeps `image.resize`'s quality a plain 1-100 slider
 * rather than a filter-graph parameter. The backend already inverts this to CRF internally;
 * the frontend goes one step further and never shows the number at all, offering named tiers
 * instead — Archive/Balanced/Web mirror the backend's own default (70 = Balanced) exactly.
 */
export const QUALITY_PRESETS: ReadonlyArray<{ id: string; label: string; value: number }> = [
  { id: 'archive', label: 'ARCHIVE', value: 90 },
  { id: 'balanced', label: 'BALANCED', value: 70 },
  { id: 'web', label: 'WEB', value: 45 },
];

const DEFAULT_QUALITY = 70;

@Injectable()
export class VideoAudioService {
  private readonly _apiClient = inject(ApiClientService);
  private readonly _artifactObjectUrl = inject(ArtifactObjectUrlService);
  private readonly _jobTracker = inject(JobTrackerService);
  private readonly _runtimeStatus = inject(RuntimeStatusService);

  // ---- Batch mode state ----
  private readonly _mode = signal<VideoAudioMode>('single');
  private readonly _batchOperation = signal<VideoAudioBatchOperation>('media.thumbnail');
  private readonly _batchFiles = signal<readonly BatchFileRow[]>([]);
  private readonly _batchSettings = signal<Readonly<Record<string, unknown>>>({});
  private readonly _batchQuality = signal<number>(DEFAULT_QUALITY);
  private readonly _activeBatchId = signal<Option.Option<string>>(Option.none());
  private readonly _isBatchSubmitting = signal<boolean>(false);
  private readonly _batchArtifactResults = signal<readonly ArtifactModel[]>([]);
  private readonly _batchInspectResults = signal<readonly BatchInspectRow[]>([]);
  private readonly _batchLimitNotice = signal<string | null>(null);
  private readonly _collectedBatchJobIds = new Set<string>();

  readonly mode = this._mode.asReadonly();
  readonly batchOperation = this._batchOperation.asReadonly();
  readonly batchFiles = this._batchFiles.asReadonly();
  readonly batchSettings = this._batchSettings.asReadonly();
  readonly batchQuality = this._batchQuality.asReadonly();
  readonly batchArtifactResults = this._batchArtifactResults.asReadonly();
  readonly batchInspectResults = this._batchInspectResults.asReadonly();
  readonly batchLimitNotice = this._batchLimitNotice.asReadonly();
  readonly maxBatchFiles = MAX_BATCH_FILES;
  readonly qualityPresets = QUALITY_PRESETS;

  readonly batchOperationTiles = [
    { id: 'media.inspect', label: 'INSPECT' },
    { id: 'media.thumbnail', label: 'THUMBNAIL' },
    { id: 'media.extract-audio', label: 'EXTRACT AUDIO' },
    { id: 'media.transcode', label: 'TRANSCODE' },
  ];

  readonly isInspectBatch = computed(() => this._batchOperation() === 'media.inspect');
  readonly isTranscodeBatch = computed(() => this._batchOperation() === 'media.transcode');

  /**
   * Non-file parameters of the active batch operation, minus `quality` on transcode — that one
   * gets the bespoke named-preset tile group below instead of a raw 1-100 field, the same "an
   * absolute quality tier deserves its own control" call PDF's DPI tiles already made.
   */
  readonly batchParameters = computed<readonly ToolParameterModel[]>(() =>
    this._operationParameters(this._batchOperation()).filter((p) => p.name !== 'quality')
  );

  readonly batchJobs = computed<readonly JobModel[]>(() => {
    const id = this._activeBatchId();
    if (Option.isNone(id)) {
      return [];
    }
    return this._jobTracker.jobs().filter((job) => job.batchId === id.value);
  });

  readonly isBatchActive = computed(() => this._isBatchSubmitting() || this.batchJobs().some((job) => job.isActive));
  readonly canSubmitBatch = computed(() => this._batchFiles().length > 0 && !this.isBatchActive());

  readonly batchTitle = computed(() => {
    if (this.isBatchActive()) {
      return 'Working';
    }
    if (this.isInspectBatch()) {
      return this._batchInspectResults().length > 0 ? 'Inspected' : 'Results';
    }
    if (this._batchArtifactResults().length === 0) {
      return 'Results';
    }
    switch (this._batchOperation()) {
      case 'media.thumbnail':
        return 'Thumbnails';
      case 'media.extract-audio':
        return 'Extracted Audio';
      case 'media.transcode':
        return 'Transcoded';
      default:
        return 'Results';
    }
  });

  setMode(mode: VideoAudioMode): void {
    this._mode.set(mode);
  }

  /** Switching operations forgets any stray field values from the previous one (they'd otherwise show as an unmatched, blank-looking selection — e.g. a leftover "mp4" while viewing Extract Audio's own mp3/aac/wav tiles) — each operation's own declared defaults refill the form immediately. */
  setBatchOperation(operation: string): void {
    this._batchOperation.set(operation as VideoAudioBatchOperation);
    this._batchSettings.set({});
  }

  setBatchFormValues(values: Readonly<Record<string, unknown>>): void {
    this._batchSettings.set(values);
  }

  setBatchQuality(value: number): void {
    this._batchQuality.set(value);
  }

  addBatchFiles(files: readonly File[]): void {
    const room = Math.max(0, MAX_BATCH_FILES - this._batchFiles().length);
    const accepted = files.slice(0, room);
    const rejectedCount = files.length - accepted.length;

    const rows: BatchFileRow[] = accepted.map((file) => ({ id: nextVideoAudioBatchRowId(), file, durationSeconds: null, inspecting: true }));
    this._batchFiles.update((list) => [...list, ...rows]);

    this._batchLimitNotice.set(rejectedCount > 0
      ? `Batch limit is ${MAX_BATCH_FILES} files — ${rejectedCount} file${rejectedCount === 1 ? '' : 's'} not added.`
      : null);

    for (const row of rows) {
      this._apiClient.inspectMedia$(row.file)
        .pipe(finalize(() => {
          this._batchFiles.update((list) => list.map((r) => (r.id === row.id ? { ...r, inspecting: false } : r)));
        }))
        .subscribe(Either.match({
          onRight: (res) => {
            this._batchFiles.update((list) => list.map((r) => (r.id === row.id ? { ...r, durationSeconds: res.durationSeconds } : r)));
          },
          onLeft: () => {
            // Leave durationSeconds null; the row still shows, just without a duration detail.
          },
        }));
    }
  }

  removeBatchFile(id: string): void {
    this._batchFiles.update((list) => list.filter((row) => row.id !== id));
    this._batchLimitNotice.set(null);
  }

  clearBatchFiles(): void {
    this._batchFiles.set([]);
    this._batchLimitNotice.set(null);
  }

  reorderBatchFiles(fromIndex: number, toIndex: number): void {
    this._batchFiles.update((rows) => {
      const next = [...rows];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  executeBatch(): void {
    if (!this.canSubmitBatch()) {
      return;
    }

    const operation = this._batchOperation();
    const settings = operation === 'media.transcode'
      ? { ...this._batchSettings(), quality: this._batchQuality() }
      : this._batchSettings();

    this._batchArtifactResults.set([]);
    this._batchInspectResults.set([]);
    this._collectedBatchJobIds.clear();
    this._isBatchSubmitting.set(true);

    this._jobTracker.submitBatch$(operation, this._batchFiles().map((row) => row.file), settings)
      .pipe(finalize(() => this._isBatchSubmitting.set(false)))
      .subscribe(({ batchId }) => this._activeBatchId.set(Option.some(batchId)));
  }

  resetBatch(): void {
    this._batchFiles.set([]);
    this._batchArtifactResults.set([]);
    this._batchInspectResults.set([]);
    this._batchLimitNotice.set(null);
    this._activeBatchId.set(Option.none());
    this._collectedBatchJobIds.clear();
  }

  // ---- Single mode state ----
  private readonly _selectedFile = signal<Option.Option<SelectedMediaFile>>(Option.none());
  private readonly _inspectResult = signal<Option.Option<MediaInspectOutput>>(Option.none());
  private readonly _isInspecting = signal<boolean>(false);
  private readonly _activeOperation = signal<VideoAudioJobOperation | null>(null);
  private readonly _isSubmitting = signal<boolean>(false);
  private readonly _activeJobId = signal<Option.Option<string>>(Option.none());
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());

  private readonly _lastResult = signal<{ operation: VideoAudioJobOperation; artifact: ArtifactModel } | null>(null);

  private readonly _thumbnailTimestamp = signal<number | null>(null);
  private readonly _thumbnailSettings = signal<Readonly<Record<string, unknown>>>({});
  private readonly _audioSettings = signal<Readonly<Record<string, unknown>>>({});
  private readonly _transcodeSettings = signal<Readonly<Record<string, unknown>>>({});
  private readonly _quality = signal<number>(DEFAULT_QUALITY);

  readonly selectedFile = computed(() => Option.getOrNull(this._selectedFile()));
  readonly inspectResult = computed(() => Option.getOrNull(this._inspectResult()));
  readonly isInspecting = this._isInspecting.asReadonly();
  readonly activeOperation = this._activeOperation.asReadonly();
  /** The tracked job behind the current thumbnail/extract-audio/transcode run, once submission has been accepted — null before that, and null again once its terminal state has been consumed. */
  readonly activeJob = computed<JobModel | null>(() => {
    const id = this._activeJobId();
    return Option.isNone(id) ? null : this._jobTracker.jobs().find((job) => job.id === id.value) ?? null;
  });
  readonly isProcessing = computed(() => this._isSubmitting() || this.activeJob() !== null);
  readonly errorMessage = computed(() => Option.getOrNull(this._errorMessage()));
  readonly lastResult = this._lastResult.asReadonly();

  readonly thumbnailTimestamp = this._thumbnailTimestamp.asReadonly();
  readonly thumbnailSettings = this._thumbnailSettings.asReadonly();
  readonly audioSettings = this._audioSettings.asReadonly();
  readonly transcodeSettings = this._transcodeSettings.asReadonly();
  readonly quality = this._quality.asReadonly();

  readonly thumbnailParameters = computed<readonly ToolParameterModel[]>(() =>
    this._operationParameters('media.thumbnail').filter((p) => p.name !== 'timestampSeconds')
  );
  readonly audioParameters = computed<readonly ToolParameterModel[]>(() => this._operationParameters('media.extract-audio'));
  readonly transcodeParameters = computed<readonly ToolParameterModel[]>(() =>
    this._operationParameters('media.transcode').filter((p) => p.name !== 'quality')
  );

  readonly errorDiagnostic = computed<Option.Option<ErrorDiagnostic>>(() => this._errorMessage().pipe(Option.map((err) => {
    const lower = err.toLowerCase();

    if (lower.includes('does not look like a valid media file') || lower.includes('no readable duration')) {
      return {
        title: 'Invalid Media File',
        message: err,
        suggestion: 'Check that the file plays normally in a media player and is not corrupted or an unsupported container.',
      };
    }

    return {
      title: 'Operation Failed',
      message: err,
      suggestion: 'Verify the file and settings, then retry.',
    };
  })));

  constructor() {
    effect(() => {
      const job = this.activeJob();

      if (!job || !job.isTerminal) {
        return;
      }

      const operation = this._activeOperation() ?? 'media.thumbnail';
      this._activeJobId.set(Option.none());

      if (job.status === 'completed') {
        const artifact = this._artifactFromJobResult(operation, job.result);
        this._lastResult.set({ operation, artifact });
      } else if (job.status === 'failed') {
        this._errorMessage.set(Option.some(job.error ?? 'Operation failed'));
      }
    });

    /**
     * Each batch job completing hands over its result exactly once. Inspect's batch result is
     * plain data (no artifact at all, same treatment PDF Documents gives `pdf.inspect`); the other
     * three each return a single `{artifact}` — unlike PDF's render-pages/extract-images, no
     * operation here produces more than one artifact per file.
     */
    effect(() => {
      for (const job of this.batchJobs()) {
        if (job.status !== 'completed' || this._collectedBatchJobIds.has(job.id)) {
          continue;
        }
        this._collectedBatchJobIds.add(job.id);

        if (job.operationId === 'media.inspect') {
          const result = job.result as MediaInspectOutput;
          this._batchInspectResults.update((list) => [...list, {
            fileName: job.label ?? 'file',
            durationSeconds: result.durationSeconds,
            format: result.format,
            video: result.video,
            audio: result.audio,
          }]);
        } else {
          const artifact = this._artifactFromJobResult(job.operationId as VideoAudioJobOperation, job.result);
          this._batchArtifactResults.update((list) => [...list, artifact]);
        }
      }
    });
  }

  setFile(file: File): void {
    this._errorMessage.set(Option.none());
    this._lastResult.set(null);
    this._inspectResult.set(Option.none());
    this._thumbnailTimestamp.set(null);
    this._thumbnailSettings.set({});
    this._audioSettings.set({});
    this._transcodeSettings.set({});
    this._quality.set(DEFAULT_QUALITY);

    const previewUrl = URL.createObjectURL(file);

    this._selectedFile.set(Option.some({
      file,
      previewUrl,
      name: file.name,
      size: file.size,
    }));

    this._runInspect(file);
  }

  resetFile(): void {
    const current = this._selectedFile();
    if (Option.isSome(current)) {
      URL.revokeObjectURL(current.value.previewUrl);
    }
    this._selectedFile.set(Option.none());
    this._inspectResult.set(Option.none());
    this._lastResult.set(null);
    this._errorMessage.set(Option.none());
    this._thumbnailTimestamp.set(null);
  }

  updateThumbnailTimestamp(value: number): void {
    this._thumbnailTimestamp.set(value);
  }

  setThumbnailFormValues(values: Readonly<Record<string, unknown>>): void {
    this._thumbnailSettings.set(values);
  }

  setAudioFormValues(values: Readonly<Record<string, unknown>>): void {
    this._audioSettings.set(values);
  }

  setTranscodeFormValues(values: Readonly<Record<string, unknown>>): void {
    this._transcodeSettings.set(values);
  }

  setQuality(value: number): void {
    this._quality.set(value);
  }

  executeThumbnail(): void {
    this._executeJob('media.thumbnail', { ...this._thumbnailSettings(), timestampSeconds: this._thumbnailTimestamp() });
  }

  executeExtractAudio(): void {
    this._executeJob('media.extract-audio', this._audioSettings());
  }

  executeTranscode(): void {
    this._executeJob('media.transcode', { ...this._transcodeSettings(), quality: this._quality() });
  }

  cancelActiveJob(): void {
    const id = this._activeJobId();
    if (Option.isSome(id)) {
      this._jobTracker.cancel(id.value);
    }
  }

  retryLastOperation(): void {
    const operation = this._activeOperation();
    if (operation === 'media.extract-audio') {
      this.executeExtractAudio();
    } else if (operation === 'media.transcode') {
      this.executeTranscode();
    } else {
      this.executeThumbnail();
    }
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

  /** ffprobe reports a container's format as a comma-separated list of every alias the same demuxer answers to (e.g. "mov,mp4,m4a,3gp,3g2,mj2") — real, accurate, and not something to print verbatim in front of a designer. The first alias is always the canonical one. */
  formatLabel(format: string): string {
    return format.split(',')[0].toUpperCase();
  }

  formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  getArtifactFileUrl(id: string): string | null {
    return this._artifactObjectUrl.getFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string | null {
    return this._artifactObjectUrl.getDownloadUrl(id);
  }

  private _executeJob(operationId: VideoAudioJobOperation, params: Readonly<Record<string, unknown>>): void {
    const selected = this._selectedFile();
    if (Option.isNone(selected) || this.isProcessing()) {
      return;
    }

    this._activeOperation.set(operationId);
    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this._jobTracker.submit$(
      operationId,
      selected.value.name,
      this._apiClient.submitJob$(operationId, selected.value.file, params)
    )
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start job')),
      }));
  }

  private _artifactFromJobResult(operation: VideoAudioJobOperation, result: unknown): ArtifactModel {
    switch (operation) {
      case 'media.extract-audio':
        return ArtifactModelFromMediaExtractAudioOutput.from(result as MediaExtractAudioOutput);
      case 'media.transcode':
        return ArtifactModelFromMediaTranscodeOutput.from(result as MediaTranscodeOutput);
      default:
        return ArtifactModelFromMediaThumbnailOutput.from(result as MediaThumbnailOutput);
    }
  }

  private _operationParameters(operationId: string): readonly ToolParameterModel[] {
    const tool = this._runtimeStatus.tools().find((t) => t.id === 'media');
    return tool?.operations.find((o) => o.id === operationId)?.parameters ?? [];
  }

  private _runInspect(file: File): void {
    this._isInspecting.set(true);
    this._errorMessage.set(Option.none());

    this._apiClient.inspectMedia$(file)
      .pipe(finalize(() => this._isInspecting.set(false)))
      .subscribe(Either.match({
        onRight: (res) => {
          this._inspectResult.set(Option.some(res));
          if (this._thumbnailTimestamp() == null) {
            const seed = res.durationSeconds * 0.1;
            this._thumbnailTimestamp.set(Math.max(0, Math.min(seed, Math.max(0, res.durationSeconds - 0.05))));
          }
        },
        onLeft: (err) => {
          this._errorMessage.set(Option.some(err.message || 'Failed to inspect media file'));
        },
      }));
  }
}
