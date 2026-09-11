import type { ArtifactModel, ArtifactFileDetails, ToolParameterModel, JobModel } from '../../../../domain/index.js';
import type { ImageResizeOutput } from '@utility/protocol';

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ApiClientService } from '../../../../core/services/api-client.service.js';
import { JobTrackerService, RuntimeStatusService } from '../../../../core/index.js';
import { ArtifactModelFromImageResizeOutput } from '../../../../domain/index.js';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

export type ImageResizeMode = 'single' | 'batch';

export interface BatchFileRow {
  readonly id: string;
  readonly file: File;
}

/**
 * A batch submits every file as its own concurrent job (`JobTrackerService.submitBatch$`'s
 * `forkJoin`) — each of which spawns its own Sharp process server-side. With no cap, a large
 * accidental drop (a whole folder) would fire dozens of simultaneous resizes on one local
 * machine, and the file list would grow past the settings and submit button below it. 25 is
 * generous for the realistic case (a shoot, a batch of screenshots) while keeping both bounded.
 */
const MAX_BATCH_FILES = 25;

let batchRowIdCounter = 0;
const nextBatchRowId = () => `batch_row_${++batchRowIdCounter}`;

export interface ImageResizeFormState {
  targetWidth: Option.Option<number>;
  targetHeight: Option.Option<number>;
  fitMode: string;
  outputFormat: string;
  quality: number;
  withoutEnlargement: boolean;
}

export interface ErrorDiagnostic {
  title: string;
  message: string;
  suggestion: string;
}

export interface DimensionValidationResult {
  isValid: boolean;
  severity: 'warning' | 'error';
  message: string;
}

export interface ComparisonSource {
  readonly name: string;
  readonly dimensions: string;
  readonly sizeFormatted: string;
  readonly formatLabel: string;
}

export interface SizeDelta {
  readonly percent: number;
  readonly grew: boolean;
}

@Injectable()
export class ImageResizeService {
  private readonly _apiClient = inject(ApiClientService);
  private readonly _jobTracker = inject(JobTrackerService);
  private readonly _runtimeStatus = inject(RuntimeStatusService);

  // Batch mode state
  private readonly _mode = signal<ImageResizeMode>('single');
  private readonly _batchFiles = signal<readonly BatchFileRow[]>([]);
  private readonly _batchSettings = signal<Readonly<Record<string, unknown>>>({
    fit: 'inside',
    withoutEnlargement: true,
    quality: 80,
  });
  private readonly _activeBatchId = signal<Option.Option<string>>(Option.none());
  private readonly _isBatchSubmitting = signal<boolean>(false);
  private readonly _batchResults = signal<readonly ArtifactModel[]>([]);
  private readonly _batchLimitNotice = signal<string | null>(null);
  private readonly _collectedBatchJobIds = new Set<string>();

  readonly mode = this._mode.asReadonly();
  readonly batchFiles = this._batchFiles.asReadonly();
  readonly batchSettings = this._batchSettings.asReadonly();
  readonly batchResults = this._batchResults.asReadonly();
  readonly batchLimitNotice = this._batchLimitNotice.asReadonly();
  readonly maxBatchFiles = MAX_BATCH_FILES;

  /** `image.resize`'s own declared parameters (label, type, options, min/max), minus the file param OperationFormComponent already excludes — read from the same tool registry the sidebar discovers tools from, not duplicated here. */
  readonly batchParameters = computed<readonly ToolParameterModel[]>(() => {
    const tool = this._runtimeStatus.tools().find((t) => t.id === 'image');
    return tool?.operations.find((op) => op.id === 'image.resize')?.parameters ?? [];
  });

  readonly batchJobs = computed<readonly JobModel[]>(() => {
    const id = this._activeBatchId();
    if (Option.isNone(id)) {
      return [];
    }
    return this._jobTracker.jobs().filter((job) => job.batchId === id.value);
  });

  readonly isBatchActive = computed(() => this._isBatchSubmitting() || this.batchJobs().some((job) => job.isActive));
  readonly canSubmitBatch = computed(() => this._batchFiles().length > 0 && !this.isBatchActive());

  constructor() {
    /** Each batch job completing hands over its artifact exactly once — mirrors PdfWorkbenchService's single-job terminal effect, just fired per job instead of once. */
    effect(() => {
      for (const job of this.batchJobs()) {
        if (job.status === 'completed' && !this._collectedBatchJobIds.has(job.id)) {
          this._collectedBatchJobIds.add(job.id);
          const artifact = ArtifactModelFromImageResizeOutput.from(job.result as ImageResizeOutput);
          this._batchResults.update((list) => [...list, artifact]);
        }
      }
    });
  }

  setMode(mode: ImageResizeMode): void {
    this._mode.set(mode);
  }

  addBatchFiles(files: readonly File[]): void {
    const room = Math.max(0, MAX_BATCH_FILES - this._batchFiles().length);
    const accepted = files.slice(0, room);
    const rejectedCount = files.length - accepted.length;

    const rows = accepted.map((file) => ({ id: nextBatchRowId(), file }));
    this._batchFiles.update((list) => [...list, ...rows]);

    this._batchLimitNotice.set(rejectedCount > 0
      ? `Batch limit is ${MAX_BATCH_FILES} files — ${rejectedCount} file${rejectedCount === 1 ? '' : 's'} not added.`
      : null);
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

  setBatchSettings(values: Readonly<Record<string, unknown>>): void {
    this._batchSettings.set(values);
  }

  executeBatch(): void {
    if (!this.canSubmitBatch()) {
      return;
    }

    this._batchResults.set([]);
    this._collectedBatchJobIds.clear();
    this._isBatchSubmitting.set(true);

    this._jobTracker.submitBatch$('image.resize', this._batchFiles().map((row) => row.file), this._batchSettings())
      .pipe(finalize(() => this._isBatchSubmitting.set(false)))
      .subscribe(({ batchId }) => this._activeBatchId.set(Option.some(batchId)));
  }

  resetBatch(): void {
    this._batchFiles.set([]);
    this._batchResults.set([]);
    this._batchLimitNotice.set(null);
    this._activeBatchId.set(Option.none());
    this._collectedBatchJobIds.clear();
  }

  getArtifactFileUrl(id: string): string {
    return this._apiClient.getArtifactFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string {
    return this._apiClient.getArtifactDownloadUrl(id);
  }

  private readonly _selectedImage = signal<Option.Option<ArtifactFileDetails>>(Option.none());
  private readonly _resultArtifact = signal<Option.Option<ArtifactModel>>(Option.none());
  private readonly _isProcessing = signal<boolean>(false);
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());
  private readonly _lockAspectRatio = signal<boolean>(true);
  private readonly _activePresetId = signal<Option.Option<string>>(Option.none());  
  private readonly _formState = signal<ImageResizeFormState>({
    targetWidth: Option.some(800),
    targetHeight: Option.none(),
    fitMode: 'inside',
    outputFormat: '',
    quality: 80,
    withoutEnlargement: true,
  });

  readonly selectedImage = computed(() => Option.getOrNull(this._selectedImage()));
  readonly resultArtifact = computed(() => Option.getOrNull(this._resultArtifact()));
  readonly isProcessing = this._isProcessing.asReadonly();
  readonly errorMessage = computed(() => Option.getOrNull(this._errorMessage()));
  readonly lockAspectRatio = this._lockAspectRatio.asReadonly();
  readonly activePresetId = computed(() => Option.getOrNull(this._activePresetId()));
  readonly formState = this._formState.asReadonly();
  
  readonly maxAllowedDimension = 16384;
  readonly warningDimensionThreshold = 8192;
  readonly isLossyFormat = computed(() => {
    return ['webp', 'jpeg', 'avif'].includes(this._formState().outputFormat);
  });

  readonly qualityFidelityInfo = computed(() => {
    const q = this._formState().quality;

    if (q <= 50) {
      return { label: 'Aggressive Compression (Smaller File)', variant: 'gold' as const };
    }

    if (q <= 85) {
      return { label: 'Balanced Fidelity (Recommended)', variant: 'blue' as const };
    }

    return { label: 'Maximum Fidelity (Larger File)', variant: 'mint' as const };
  });

  readonly dimensionValidation = computed<Option.Option<DimensionValidationResult>>(() => {
    const s = this._formState();
    const w = s.targetWidth;
    const h = s.targetHeight;

    if ((Option.isSome(w) && w.value <= 0) || (Option.isSome(h) && h.value <= 0)) {
      return Option.some({
        isValid: false,
        severity: 'error',
        message: 'Target dimensions must be positive integers (greater than 0 px).',
      });
    }

    if ((Option.isSome(w) && w.value > this.maxAllowedDimension) || (Option.isSome(h) && h.value > this.maxAllowedDimension)) {
      return Option.some({
        isValid: false,
        severity: 'error',
        message: `Target dimension exceeds maximum Sharp buffer limit (${this.maxAllowedDimension.toLocaleString()} px).`,
      });
    }

    if ((Option.isSome(w) && w.value > this.warningDimensionThreshold) || (Option.isSome(h) && h.value > this.warningDimensionThreshold)) {
      return Option.some({
        isValid: true,
        severity: 'warning',
        message: `High-resolution dimension (> ${this.warningDimensionThreshold.toLocaleString()} px) may require extended processing time.`,
      });
    }

    return Option.none();
  });

  readonly isFormValid = computed(() => {
    const img = this._selectedImage();

    if (Option.isNone(img)) {
      return false;
    }

    return this.dimensionValidation().pipe(Option.match({
      onSome: (res) => res.isValid,
      onNone: () => true
    }));
  });

  readonly errorDiagnostic = computed<Option.Option<ErrorDiagnostic>>(() => this._errorMessage().pipe(Option.map((err) => {
    const lower = err.toLowerCase();

    if (lower.includes('dimension') || lower.includes('width') || lower.includes('height') || lower.includes('large') || lower.includes('memory') || lower.includes('exceed')) {
      return {
        title: 'Dimension Limit Exceeded',
        message: err,
        suggestion: 'Reduce target width or height, or select a lossy output format like WebP or JPEG to lower memory usage.',
      };
    }

    if (lower.includes('format') || lower.includes('unsupported') || lower.includes('mime') || lower.includes('invalid')) {
      return {
        title: 'Format Compatibility Issue',
        message: err,
        suggestion: 'Select standard WebP, PNG, or JPEG output format, or check if the input image file is corrupt.',
      };
    }

    return {
      title: 'Transformation Failed',
      message: err,
      suggestion: 'Verify input image dimensions and quality parameters, then retry.',
    };
  })));

  readonly computedTargetResolution = computed(() => {
    const s = this._formState();
    const img = this._selectedImage();

    let w = s.targetWidth;
    let h = s.targetHeight;

    if (Option.isSome(img) && this._lockAspectRatio()) {
      const ratio = img.value.width / img.value.height;

      if (Option.isSome(w) && Option.isNone(h)) {
        h = Option.some(Math.round(w.value / ratio));
      }

      if (Option.isNone(w) && Option.isSome(h)) {
        w = Option.some(Math.round(h.value * ratio));
      }
    }

    const wStr = w.pipe(Option.match({
      onSome: (wdth) => `${wdth}w`,
      onNone: () => 'Auto'
    }));

    const hStr = h.pipe(Option.match({
      onSome: (hght) => `${hght}h`,
      onNone: () => 'Auto'
    }));

    return `${wStr} × ${hStr}`;
  });

  readonly sizeDelta = computed<SizeDelta | null>(() => {
    return Option.Do.pipe(
      Option.andThen(() => Option.all([this._selectedImage(), this._resultArtifact()])),
      Option.map(([{ size: orig }, { size: res }]) => ({
        percent: Math.round(Math.abs((res - orig) / orig) * 100),
        grew: res > orig,
      })),
      Option.getOrNull
    )
  });

  readonly sourceFormatLabel = computed(() => {
    const img = this.selectedImage();

    if (!img) {
      return '';
    }

    const ext = img.file.type?.split('/')[1] || img.name.split('.').pop() || '';

    return ext.toUpperCase();
  });

  readonly outputFormatLabel = computed(() => {
    const fmt = this._formState().outputFormat;

    return fmt ? fmt.toUpperCase() : this.sourceFormatLabel();
  });

  readonly comparisonSource = computed<ComparisonSource | null>(() => {
    const img = this.selectedImage();

    if (!img) {
      return null;
    }

    return {
      name: img.name,
      dimensions: `${img.width}×${img.height}`,
      sizeFormatted: this.formatBytes(img.size),
      formatLabel: this.sourceFormatLabel(),
    };
  });

  readonly targetDimensionsLabel = computed(() => {
    const s = this._formState();
    const img = this._selectedImage();
    let w = s.targetWidth;
    let h = s.targetHeight;

    if (Option.isSome(img) && this._lockAspectRatio()) {
      const ratio = img.value.width / img.value.height;

      if (Option.isSome(w) && Option.isNone(h)) {
        h = Option.some(Math.round(w.value / ratio));
      }

      if (Option.isNone(w) && Option.isSome(h)) {
        w = Option.some(Math.round(h.value * ratio));
      }
    }

    if (Option.isNone(w) || Option.isNone(h)) {
      return '—';
    }

    return `${w.value}×${h.value}`;
  });

  readonly artifactDownloadUrl = computed(() => this._resultArtifact().pipe(Option.map(({ id }) => 
    this._apiClient.getArtifactDownloadUrl(id)
  )));

  readonly artifactFileUrl = computed(() => this._resultArtifact().pipe(Option.map(({ id }) => 
    this._apiClient.getArtifactFileUrl(id)
)));

  setImage(file: File): void {
    this._errorMessage.set(Option.none());
    this._resultArtifact.set(Option.none());
    this._activePresetId.set(Option.none());

    const previewUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      this._selectedImage.set(Option.some({
        file,
        previewUrl,
        name: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));

      const current = this._formState();
      const targetWidth = current.targetWidth;
      const targetHeight = current.targetHeight;

      if (!current.targetWidth && !current.targetHeight) {
        const halfWidth = Math.round(img.naturalWidth / 2);
        const halfHeight = Math.round(img.naturalHeight / 2);

        this.updateFormState({
          targetWidth: Option.some(halfWidth),
          targetHeight: this._lockAspectRatio() ? Option.some(halfHeight) : Option.none(),
        });

        return;
      }

      if (this._lockAspectRatio() && Option.isSome(targetWidth) && Option.isNone(targetHeight)) {
        const ratio = img.naturalWidth / img.naturalHeight;

        this.updateFormState({ targetHeight: Option.some(Math.round(targetWidth.value / ratio)) });
      }
    };

    img.src = previewUrl;
  }

  resetImage(): void {
    this._selectedImage.set(Option.none());
    this._resultArtifact.set(Option.none());
    this._errorMessage.set(Option.none());
    this._activePresetId.set(Option.none());
  }

  toggleAspectRatioLock(): void {
    this._lockAspectRatio.update((prev) => !prev);

    if (this._lockAspectRatio()) {
      const img = this._selectedImage();
      const targetWidth = this._formState().targetWidth;

      if (Option.isSome(img) && Option.isSome(targetWidth)) {
        const ratio = img.value.width / img.value.height;

        this.updateFormState({ targetHeight: Option.some(Math.round(targetWidth.value / ratio)) });
      }
    }
  }

  updateWidth(newWidth: number | null): void {
    this._activePresetId.set(Option.none());

    const img = this._selectedImage();

    if (this._lockAspectRatio() && Option.isSome(img) && newWidth && newWidth > 0) {
      const ratio = img.value.width / img.value.height;

      this.updateFormState({ targetWidth: Option.some(newWidth), targetHeight: Option.some(Math.round(newWidth / ratio)) });
    } else {
      this.updateFormState({ targetWidth: Option.fromNullable(newWidth) });
    }
  }

  updateHeight(newHeight: number | null): void {
    this._activePresetId.set(Option.none());

    const img = this._selectedImage();

    if (this._lockAspectRatio() && Option.isSome(img) && newHeight && newHeight > 0) {
      const ratio = img.value.width / img.value.height;

      this.updateFormState({ targetWidth: Option.some(Math.round(newHeight * ratio)), targetHeight: Option.some(newHeight) });
    } else {
      this.updateFormState({ targetHeight: Option.fromNullable(newHeight) });
    }
  }

  swapDimensions(): void {
    this._activePresetId.set(Option.none());

    const s = this._formState();
    const currentW = s.targetWidth;
    const currentH = s.targetHeight;
    const img = this._selectedImage();

    if (Option.isNone(img)) {
      return;
    }

    if (Option.isSome(currentW) && Option.isSome(currentH)) {
      this.updateFormState({ targetWidth: currentH, targetHeight: currentW });
    }

    if (Option.isSome(currentW) && Option.isNone(currentH)) {
      const ratio = img.value.width / img.value.height;
      const calcH = Math.round(currentW.value / ratio);

      this.updateFormState({ targetWidth: Option.some(calcH), targetHeight: currentW });
    }

    if (Option.isNone(currentW) && Option.isSome(currentH)) {
      const ratio = img.value.width / img.value.height;
      const calcW = Math.round(currentH.value * ratio);

      this.updateFormState({ targetWidth: currentH, targetHeight: Option.some(calcW) });
    } else {
      this.updateFormState({ targetWidth: Option.some(img.value.height), targetHeight: Option.some(img.value.width) });
    }
  }

  updateFormState(partial: Partial<ImageResizeFormState>): void {
    this._formState.update((prev) => ({ ...prev, ...partial }));
  }

  applyScalePreset(scale: number, presetId?: string): void {
    const current = this._selectedImage();

    if (Option.isNone(current)) {
      return;
    }

    this._activePresetId.set(Option.fromNullable(presetId));
    this.updateFormState({
      targetWidth: Option.some(Math.round(current.value.width * scale)),
      targetHeight: Option.some(Math.round(current.value.height * scale)),
    });
  }

  applyDimensionPreset(w: number, h: number, presetId?: string): void {
    this._activePresetId.set(Option.fromNullable(presetId));
    this.updateFormState({ targetWidth: Option.some(w), targetHeight: Option.some(h) });
  }

  executeResize(): void {
    if (!this.isFormValid()) {
      return;
    }

    const img = this._selectedImage();

    if (Option.isNone(img)) {
      return
    };

    this._isProcessing.set(true);
    this._errorMessage.set(Option.none());

    this._resizeImage$(img.value.file, this._formState())
      .pipe(finalize(() => this._isProcessing.set(false)))
      .subscribe(Either.match({
        onRight: (res) => {
          this._resultArtifact.set(Option.some(ArtifactModelFromImageResizeOutput.from(res)));
        },
        onLeft: (err) => {
          this._errorMessage.set(Option.some(err.message || 'Failed to process image transformation'));
        },
      }));
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

  private _resizeImage$(file: File, state: ImageResizeFormState) {
    return this._apiClient.executeImageResize$(file, {
      width: Option.getOrNull(state.targetWidth),
      height: Option.getOrNull(state.targetHeight),
      fit: state.fitMode,
      withoutEnlargement: state.withoutEnlargement,
      format: state.outputFormat || undefined,
      quality: this.isLossyFormat() ? state.quality : undefined,
    });
  }
}
