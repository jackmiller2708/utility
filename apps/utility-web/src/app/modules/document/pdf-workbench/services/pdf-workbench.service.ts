import type { ArtifactModel, JobModel } from '../../../../domain/index.js';
import type { PdfRenderPagesOutput, PdfExtractImagesOutput } from '@utility/protocol';

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ApiClientService } from '../../../../core/services/api-client.service.js';
import { JobTrackerService } from '../../../../core/index.js';
import { ArtifactModelsFromPdfRenderPagesOutput, ArtifactModelsFromPdfExtractImagesOutput } from '../../../../domain/index.js';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

export interface PdfFileDetails {
  readonly file: File;
  readonly previewUrl: string;
  readonly name: string;
  readonly size: number;
}

export interface PdfInspectResult {
  readonly pages: number;
  readonly title?: string;
  readonly author?: string;
}

export interface ErrorDiagnostic {
  title: string;
  message: string;
  suggestion: string;
}

export type PdfAction = 'render' | 'extract';

export interface CostEstimate {
  readonly seconds: number;
  readonly bytes: number;
}

/**
 * Derived from real measurements on a representative 110-page, image-heavy A4
 * document (a 96MB Illustrator-exported brand guideline) — a 5-page sample was
 * rendered at each resolution through the real pdftoppm binary. 72 DPI has no
 * direct measurement and is extrapolated from the 150 DPI rate via the pixel-area
 * ratio (72/150)^2. This is a client-side estimate to disclose cost before the
 * user commits, not a guarantee — real documents vary page to page.
 */
const SECONDS_PER_PAGE: Record<number, number> = {
  72: 0.43,
  150: 1.86,
  300: 6.22,
  600: 9.34,
};

const BYTES_PER_PAGE: Record<number, number> = {
  72: 280_000,
  150: 1_220_000,
  300: 3_200_000,
  600: 2_800_000,
};

/** DPI at or above which a page range is nudged forward instead of "all pages". */
const RANGE_NUDGE_DPI_THRESHOLD = 300;
const DEFAULT_RANGE_SIZE = 10;

@Injectable()
export class PdfWorkbenchService {
  private readonly _apiClient = inject(ApiClientService);
  private readonly _jobTracker = inject(JobTrackerService);
  private readonly _selectedPdf = signal<Option.Option<PdfFileDetails>>(Option.none());
  private readonly _inspectResult = signal<Option.Option<PdfInspectResult>>(Option.none());
  private readonly _isInspecting = signal<boolean>(false);
  private readonly _activeAction = signal<PdfAction | null>(null);
  private readonly _isSubmitting = signal<boolean>(false);
  private readonly _activeJobId = signal<Option.Option<string>>(Option.none());
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());
  private readonly _rangeTouchedByUser = signal<boolean>(false);

  private readonly _lastResult = signal<{ action: PdfAction; items: readonly ArtifactModel[] } | null>(null);

  private readonly _dpi = signal<number>(150);
  private readonly _firstPage = signal<number | null>(null);
  private readonly _lastPage = signal<number | null>(null);

  readonly selectedPdf = computed(() => Option.getOrNull(this._selectedPdf()));
  readonly inspectResult = computed(() => Option.getOrNull(this._inspectResult()));
  readonly isInspecting = this._isInspecting.asReadonly();
  readonly activeAction = this._activeAction.asReadonly();
  /** The tracked job behind the current render/extract run, once submission has been accepted — null before that, and null again once its terminal state has been consumed. */
  readonly activeJob = computed<JobModel | null>(() => {
    const id = this._activeJobId();
    return Option.isNone(id) ? null : this._jobTracker.jobs().find((job) => job.id === id.value) ?? null;
  });
  readonly isProcessing = computed(() => this._isSubmitting() || this.activeJob() !== null);
  readonly errorMessage = computed(() => Option.getOrNull(this._errorMessage()));
  readonly dpi = this._dpi.asReadonly();
  readonly firstPage = this._firstPage.asReadonly();
  readonly lastPage = this._lastPage.asReadonly();
  readonly lastResult = this._lastResult.asReadonly();

  readonly dpiOptions = [72, 150, 300, 600];

  readonly isRangeActive = computed(() => this._firstPage() != null || this._lastPage() != null);

  readonly resolvedPageCount = computed(() => {
    const inspect = this.inspectResult();
    if (!inspect) {
      return 0;
    }

    const first = this._firstPage() ?? 1;
    const last = this._lastPage() ?? inspect.pages;
    return Math.max(0, Math.min(last, inspect.pages) - first + 1);
  });

  readonly renderCostEstimate = computed<CostEstimate | null>(() => {
    const pageCount = this.resolvedPageCount();
    if (pageCount <= 0) {
      return null;
    }

    const dpi = this._dpi();
    const secondsPerPage = SECONDS_PER_PAGE[dpi] ?? SECONDS_PER_PAGE[150];
    const bytesPerPage = BYTES_PER_PAGE[dpi] ?? BYTES_PER_PAGE[150];

    return {
      seconds: Math.round(pageCount * secondsPerPage),
      bytes: Math.round(pageCount * bytesPerPage),
    };
  });

  readonly errorDiagnostic = computed<Option.Option<ErrorDiagnostic>>(() => this._errorMessage().pipe(Option.map((err) => {
    const lower = err.toLowerCase();

    if (lower.includes('valid pdf') || lower.includes('syntax') || lower.includes('damaged')) {
      return {
        title: 'Invalid PDF',
        message: err,
        suggestion: 'Check that the file opens normally in a PDF viewer and is not corrupted or password-protected.',
      };
    }

    if (lower.includes('page') || lower.includes('range')) {
      return {
        title: 'Page Range Issue',
        message: err,
        suggestion: 'Check that the first and last page are within the document and first is not after last.',
      };
    }

    return {
      title: 'Operation Failed',
      message: err,
      suggestion: 'Verify the PDF and parameters, then retry.',
    };
  })));

  constructor() {
    effect(() => {
      const job = this.activeJob();

      if (!job || !job.isTerminal) {
        return;
      }

      const action = this._activeAction() ?? 'render';
      this._activeJobId.set(Option.none());

      if (job.status === 'completed') {
        const items = action === 'extract'
          ? ArtifactModelsFromPdfExtractImagesOutput.from(job.result as PdfExtractImagesOutput)
          : ArtifactModelsFromPdfRenderPagesOutput.from(job.result as PdfRenderPagesOutput);
        this._lastResult.set({ action, items });
      } else if (job.status === 'failed') {
        this._errorMessage.set(Option.some(job.error ?? 'Operation failed'));
      }
    });
  }

  setPdf(file: File): void {
    this._errorMessage.set(Option.none());
    this._lastResult.set(null);
    this._inspectResult.set(Option.none());
    this._firstPage.set(null);
    this._lastPage.set(null);
    this._rangeTouchedByUser.set(false);

    const previewUrl = URL.createObjectURL(file);

    this._selectedPdf.set(Option.some({
      file,
      previewUrl,
      name: file.name,
      size: file.size,
    }));

    this._runInspect(file);
  }

  resetPdf(): void {
    this._selectedPdf.set(Option.none());
    this._inspectResult.set(Option.none());
    this._lastResult.set(null);
    this._errorMessage.set(Option.none());
    this._firstPage.set(null);
    this._lastPage.set(null);
  }

  updateDpi(dpi: number): void {
    this._dpi.set(dpi);

    const inspect = this.inspectResult();
    if (dpi >= RANGE_NUDGE_DPI_THRESHOLD && !this._rangeTouchedByUser() && !this.isRangeActive() && inspect) {
      this._firstPage.set(1);
      this._lastPage.set(Math.min(DEFAULT_RANGE_SIZE, inspect.pages));
    }
  }

  updateFirstPage(value: number | null): void {
    this._rangeTouchedByUser.set(true);
    this._firstPage.set(value);
  }

  updateLastPage(value: number | null): void {
    this._rangeTouchedByUser.set(true);
    this._lastPage.set(value);
  }

  clearRange(): void {
    this._rangeTouchedByUser.set(true);
    this._firstPage.set(null);
    this._lastPage.set(null);
  }

  executeRenderPages(): void {
    const pdf = this._selectedPdf();
    if (Option.isNone(pdf) || this.isProcessing()) {
      return;
    }

    this._activeAction.set('render');
    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this._jobTracker.submit$(
      'pdf.render-pages',
      pdf.value.name,
      this._apiClient.submitRenderPagesJob$(pdf.value.file, {
        dpi: this._dpi(),
        firstPage: this._firstPage(),
        lastPage: this._lastPage(),
      })
    )
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start render job')),
      }));
  }

  executeExtractImages(): void {
    const pdf = this._selectedPdf();
    if (Option.isNone(pdf) || this.isProcessing()) {
      return;
    }

    this._activeAction.set('extract');
    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this._jobTracker.submit$(
      'pdf.extract-images',
      pdf.value.name,
      this._apiClient.submitExtractImagesJob$(pdf.value.file)
    )
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start extract job')),
      }));
  }

  cancelActiveJob(): void {
    const id = this._activeJobId();
    if (Option.isSome(id)) {
      this._jobTracker.cancel(id.value);
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

  formatSeconds(totalSeconds: number): string {
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  getArtifactFileUrl(id: string): string {
    return this._apiClient.getArtifactFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string {
    return this._apiClient.getArtifactDownloadUrl(id);
  }

  private _runInspect(file: File): void {
    this._isInspecting.set(true);
    this._errorMessage.set(Option.none());

    this._apiClient.inspectPdf$(file)
      .pipe(finalize(() => this._isInspecting.set(false)))
      .subscribe(Either.match({
        onRight: (res) => {
          this._inspectResult.set(Option.some(res));
        },
        onLeft: (err) => {
          this._errorMessage.set(Option.some(err.message || 'Failed to inspect PDF'));
        },
      }));
  }

}
