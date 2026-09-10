import type { ArtifactModel, ArtifactFileDetails } from '../../../../domain/index.js';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from '../../../../core/services/api-client.service.js';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

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

@Injectable()
export class ImageResizeService {
  private readonly _apiClient = inject(ApiClientService);
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
      return { label: 'Aggressive Compression (Smaller File)', variant: 'amber' as const };
    }

    if (q <= 85) {
      return { label: 'Balanced Fidelity (Recommended)', variant: 'indigo' as const };
    }

    return { label: 'Maximum Fidelity (Larger File)', variant: 'emerald' as const };
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

  readonly sizeSavingsPercentage = computed(() => {
    return Option.Do.pipe(
      Option.andThen(() => Option.all([this._selectedImage(), this._resultArtifact()])),
      Option.filterMap(([{ size: orig }, { size: res }]) => res >= orig
        ? Option.none()
        : Option.some(Math.round(((orig - res) / orig) * 100)
      )),
      Option.getOrNull
    )
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
          this._resultArtifact.set(Option.some({
            id: res.artifact.id,
            name: res.artifact.name,
            mimeType: res.artifact.mimeType,
            size: res.artifact.size,
            checksum: res.artifact.checksum,
            createdAt: res.artifact.createdAt,
          }));
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
