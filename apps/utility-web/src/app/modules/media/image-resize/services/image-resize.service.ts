import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from '../../../../core/services/api-client.service.js';
import type { ArtifactModel, ArtifactFileDetails } from '../../../../domain/index.js';

export interface ImageResizeFormState {
  targetWidth: number | null;
  targetHeight: number | null;
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
  private readonly apiClient = inject(ApiClientService);

  readonly maxAllowedDimension = 16384;
  readonly warningDimensionThreshold = 8192;

  readonly selectedImage = signal<ArtifactFileDetails | null>(null);
  readonly resultArtifact = signal<ArtifactModel | null>(null);
  readonly isProcessing = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lockAspectRatio = signal<boolean>(true);
  readonly activePresetId = signal<string | null>(null);

  readonly formState = signal<ImageResizeFormState>({
    targetWidth: 800,
    targetHeight: null,
    fitMode: 'inside',
    outputFormat: '',
    quality: 80,
    withoutEnlargement: true,
  });

  readonly isLossyFormat = computed(() => {
    const fmt = this.formState().outputFormat;
    return ['webp', 'jpeg', 'avif'].includes(fmt);
  });

  readonly qualityFidelityInfo = computed(() => {
    const q = this.formState().quality;
    if (q <= 50) {
      return { label: 'Aggressive Compression (Smaller File)', variant: 'amber' as const };
    }
    if (q <= 85) {
      return { label: 'Balanced Fidelity (Recommended)', variant: 'indigo' as const };
    }
    return { label: 'Maximum Fidelity (Larger File)', variant: 'emerald' as const };
  });

  readonly dimensionValidation = computed<DimensionValidationResult | null>(() => {
    const s = this.formState();
    const w = s.targetWidth;
    const h = s.targetHeight;

    if ((w !== null && w <= 0) || (h !== null && h <= 0)) {
      return {
        isValid: false,
        severity: 'error',
        message: 'Target dimensions must be positive integers (greater than 0 px).',
      };
    }

    if ((w !== null && w > this.maxAllowedDimension) || (h !== null && h > this.maxAllowedDimension)) {
      return {
        isValid: false,
        severity: 'error',
        message: `Target dimension exceeds maximum Sharp buffer limit (${this.maxAllowedDimension.toLocaleString()} px).`,
      };
    }

    if ((w !== null && w > this.warningDimensionThreshold) || (h !== null && h > this.warningDimensionThreshold)) {
      return {
        isValid: true,
        severity: 'warning',
        message: `High-resolution dimension (> ${this.warningDimensionThreshold.toLocaleString()} px) may require extended processing time.`,
      };
    }

    return null;
  });

  readonly isFormValid = computed(() => {
    const img = this.selectedImage();
    if (!img) return false;
    const val = this.dimensionValidation();
    if (val && !val.isValid) return false;
    return true;
  });

  readonly errorDiagnostic = computed<ErrorDiagnostic | null>(() => {
    const err = this.errorMessage();
    if (!err) return null;

    const lower = err.toLowerCase();
    if (
      lower.includes('dimension') ||
      lower.includes('width') ||
      lower.includes('height') ||
      lower.includes('large') ||
      lower.includes('memory') ||
      lower.includes('exceed')
    ) {
      return {
        title: 'Dimension Limit Exceeded',
        message: err,
        suggestion: 'Reduce target width or height, or select a lossy output format like WebP or JPEG to lower memory usage.',
      };
    }
    if (
      lower.includes('format') ||
      lower.includes('unsupported') ||
      lower.includes('mime') ||
      lower.includes('invalid')
    ) {
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
  });

  readonly computedTargetResolution = computed(() => {
    const s = this.formState();
    const img = this.selectedImage();
    let w = s.targetWidth;
    let h = s.targetHeight;

    if (img && this.lockAspectRatio()) {
      const ratio = img.width / img.height;
      if (w && !h) {
        h = Math.round(w / ratio);
      } else if (!w && h) {
        w = Math.round(h * ratio);
      }
    }

    const wStr = w ? `${w}w` : 'Auto';
    const hStr = h ? `${h}h` : 'Auto';
    return `${wStr} × ${hStr}`;
  });

  readonly sizeSavingsPercentage = computed(() => {
    const orig = this.selectedImage()?.size;
    const res = this.resultArtifact()?.size;
    if (!orig || !res || res >= orig) return null;
    return Math.round(((orig - res) / orig) * 100);
  });

  readonly artifactDownloadUrl = computed(() => {
    const art = this.resultArtifact();
    return art ? this.apiClient.getArtifactDownloadUrl(art.id) : '';
  });

  readonly artifactFileUrl = computed(() => {
    const art = this.resultArtifact();
    return art ? this.apiClient.getArtifactFileUrl(art.id) : null;
  });

  setImage(file: File): void {
    this.errorMessage.set(null);
    this.resultArtifact.set(null);
    this.activePresetId.set(null);

    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.selectedImage.set({
        file,
        previewUrl,
        name: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });

      const current = this.formState();
      if (!current.targetWidth && !current.targetHeight) {
        const halfWidth = Math.round(img.naturalWidth / 2);
        const halfHeight = Math.round(img.naturalHeight / 2);
        this.updateFormState({
          targetWidth: halfWidth,
          targetHeight: this.lockAspectRatio() ? halfHeight : null,
        });
      } else if (this.lockAspectRatio() && current.targetWidth && !current.targetHeight) {
        const ratio = img.naturalWidth / img.naturalHeight;
        this.updateFormState({
          targetHeight: Math.round(current.targetWidth / ratio),
        });
      }
    };
    img.src = previewUrl;
  }

  resetImage(): void {
    this.selectedImage.set(null);
    this.resultArtifact.set(null);
    this.errorMessage.set(null);
    this.activePresetId.set(null);
  }

  toggleAspectRatioLock(): void {
    this.lockAspectRatio.update((prev) => !prev);
    if (this.lockAspectRatio()) {
      const img = this.selectedImage();
      const s = this.formState();
      if (img && s.targetWidth) {
        const ratio = img.width / img.height;
        this.updateFormState({
          targetHeight: Math.round(s.targetWidth / ratio),
        });
      }
    }
  }

  updateWidth(newWidth: number | null): void {
    this.activePresetId.set(null);
    const img = this.selectedImage();
    if (this.lockAspectRatio() && img && newWidth && newWidth > 0) {
      const ratio = img.width / img.height;
      this.updateFormState({
        targetWidth: newWidth,
        targetHeight: Math.round(newWidth / ratio),
      });
    } else {
      this.updateFormState({ targetWidth: newWidth });
    }
  }

  updateHeight(newHeight: number | null): void {
    this.activePresetId.set(null);
    const img = this.selectedImage();
    if (this.lockAspectRatio() && img && newHeight && newHeight > 0) {
      const ratio = img.width / img.height;
      this.updateFormState({
        targetWidth: Math.round(newHeight * ratio),
        targetHeight: newHeight,
      });
    } else {
      this.updateFormState({ targetHeight: newHeight });
    }
  }

  swapDimensions(): void {
    this.activePresetId.set(null);
    const s = this.formState();
    const currentW = s.targetWidth;
    const currentH = s.targetHeight;
    const img = this.selectedImage();

    if (!img) return;

    if (currentW && currentH) {
      this.updateFormState({
        targetWidth: currentH,
        targetHeight: currentW,
      });
    } else if (currentW && !currentH) {
      const ratio = img.width / img.height;
      const calcH = Math.round(currentW / ratio);
      this.updateFormState({
        targetWidth: calcH,
        targetHeight: currentW,
      });
    } else if (!currentW && currentH) {
      const ratio = img.width / img.height;
      const calcW = Math.round(currentH * ratio);
      this.updateFormState({
        targetWidth: currentH,
        targetHeight: calcW,
      });
    } else {
      this.updateFormState({
        targetWidth: img.height,
        targetHeight: img.width,
      });
    }
  }

  updateFormState(partial: Partial<ImageResizeFormState>): void {
    this.formState.update((prev) => ({ ...prev, ...partial }));
  }

  applyScalePreset(scale: number, presetId?: string): void {
    const current = this.selectedImage();
    if (!current) return;
    this.activePresetId.set(presetId ?? null);
    this.updateFormState({
      targetWidth: Math.round(current.width * scale),
      targetHeight: Math.round(current.height * scale),
    });
  }

  applyDimensionPreset(w: number, h: number, presetId?: string): void {
    this.activePresetId.set(presetId ?? null);
    this.updateFormState({
      targetWidth: w,
      targetHeight: h,
    });
  }

  executeResize(): void {
    if (!this.isFormValid()) return;
    const img = this.selectedImage();
    if (!img) return;

    this.isProcessing.set(true);
    this.errorMessage.set(null);

    const s = this.formState();

    this.apiClient
      .executeImageResize(img.file, {
        width: s.targetWidth,
        height: s.targetHeight,
        fit: s.fitMode,
        withoutEnlargement: s.withoutEnlargement,
        format: s.outputFormat || undefined,
        quality: this.isLossyFormat() ? s.quality : undefined,
      })
      .subscribe({
        next: (res) => {
          this.resultArtifact.set({
            id: res.artifact.id,
            name: res.artifact.name,
            mimeType: res.artifact.mimeType,
            size: res.artifact.size,
            checksum: res.artifact.checksum,
            createdAt: res.artifact.createdAt,
          });
          this.isProcessing.set(false);
        },
        error: (err) => {
          this.errorMessage.set(
            err?.error?.message || err?.message || 'Failed to process image transformation'
          );
          this.isProcessing.set(false);
        },
      });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
