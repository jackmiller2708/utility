import type { ArtifactModel, JobModel, ToolParameterModel } from '@app/domain';
import type { PdfRenderPagesOutput, PdfExtractImagesOutput, PdfInspectOutput } from '@utility/protocol';

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ApiClientService } from '@app/core/services/api-client.service';
import { ArtifactObjectUrlService } from '@app/core/services/artifact-object-url.service';
import { JobTrackerService, RuntimeStatusService } from '@app/core';
import { ArtifactModelsFromPdfRenderPagesOutput, ArtifactModelsFromPdfExtractImagesOutput } from '@app/domain';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

export type PdfWorkbenchMode = 'single' | 'batch';
export type PdfBatchOperation = 'pdf.inspect' | 'pdf.render-pages' | 'pdf.extract-images';

export interface BatchFileRow {
  readonly id: string;
  readonly file: File;
  /** Fetched via `pdf.inspect` the moment the file is added — the batch cost estimate needs every file's real page count, not just the one file single mode has on hand. */
  readonly pages: number | null;
  readonly inspecting: boolean;
}

export interface BatchInspectRow {
  readonly fileName: string;
  readonly pages: number;
  readonly title?: string;
  readonly author?: string;
}

/** See image-resize's `MAX_BATCH_FILES` for why: bounds concurrent server-side jobs and keeps the file list from pushing the settings and submit button below it off-screen. */
const MAX_BATCH_FILES = 25;

let pdfBatchRowIdCounter = 0;
const nextPdfBatchRowId = () => `pdf_batch_row_${++pdfBatchRowIdCounter}`;

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

export interface BatchCostEstimate extends CostEstimate {
  /** How many of the batch's files have finished being inspected and are reflected in this estimate. */
  readonly knownFileCount: number;
  readonly totalFileCount: number;
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
  private readonly _artifactObjectUrl = inject(ArtifactObjectUrlService);
  private readonly _jobTracker = inject(JobTrackerService);
  private readonly _runtimeStatus = inject(RuntimeStatusService);

  // Batch mode state
  private readonly _mode = signal<PdfWorkbenchMode>('single');
  private readonly _batchOperation = signal<PdfBatchOperation>('pdf.render-pages');
  private readonly _batchFiles = signal<readonly BatchFileRow[]>([]);
  private readonly _batchDpi = signal<number>(150);
  private readonly _batchFirstPage = signal<number | null>(null);
  private readonly _batchLastPage = signal<number | null>(null);
  private readonly _activeBatchId = signal<Option.Option<string>>(Option.none());
  private readonly _isBatchSubmitting = signal<boolean>(false);
  private readonly _batchArtifactResults = signal<readonly ArtifactModel[]>([]);
  private readonly _batchInspectResults = signal<readonly BatchInspectRow[]>([]);
  private readonly _batchLimitNotice = signal<string | null>(null);
  private readonly _collectedBatchJobIds = new Set<string>();

  readonly mode = this._mode.asReadonly();
  readonly batchOperation = this._batchOperation.asReadonly();
  readonly batchFiles = this._batchFiles.asReadonly();
  readonly batchDpi = this._batchDpi.asReadonly();
  readonly batchArtifactResults = this._batchArtifactResults.asReadonly();
  readonly batchInspectResults = this._batchInspectResults.asReadonly();
  readonly batchLimitNotice = this._batchLimitNotice.asReadonly();
  readonly maxBatchFiles = MAX_BATCH_FILES;

  readonly batchOperationTiles = [
    { id: 'pdf.inspect', label: 'INSPECT' },
    { id: 'pdf.render-pages', label: 'RENDER PAGES' },
    { id: 'pdf.extract-images', label: 'EXTRACT IMAGES' },
  ];

  readonly isRenderBatch = computed(() => this._batchOperation() === 'pdf.render-pages');
  readonly isInspectBatch = computed(() => this._batchOperation() === 'pdf.inspect');

  /**
   * Non-file, non-dpi parameters of the active batch operation. DPI renders as its own tile
   * group below (an absolute quality tier, reused directly from single mode's own DPI options —
   * unlike single mode's page-range auto-nudge, which depends on one file's page count and has
   * no equivalent across N unrelated files, so it's dropped here rather than faked); render-pages'
   * firstPage/lastPage have no bespoke logic left once that nudge doesn't apply, so they fall
   * through to the generic renderer. inspect/extract-images declare no non-file parameters at
   * all, so this — and the form it drives — is empty for them.
   */
  readonly batchParameters = computed<readonly ToolParameterModel[]>(() => {
    const tool = this._runtimeStatus.tools().find((t) => t.id === 'pdf');
    const op = tool?.operations.find((o) => o.id === this._batchOperation());
    return (op?.parameters ?? []).filter((p) => p.type !== 'file' && p.name !== 'dpi');
  });

  readonly batchFormValues = computed<Readonly<Record<string, unknown>>>(() => ({
    firstPage: this._batchFirstPage(),
    lastPage: this._batchLastPage(),
  }));

  readonly batchJobs = computed<readonly JobModel[]>(() => {
    const id = this._activeBatchId();
    if (Option.isNone(id)) {
      return [];
    }
    return this._jobTracker.jobs().filter((job) => job.batchId === id.value);
  });

  readonly isBatchActive = computed(() => this._isBatchSubmitting() || this.batchJobs().some((job) => job.isActive));
  readonly canSubmitBatch = computed(() => this._batchFiles().length > 0 && !this.isBatchActive());

  /**
   * The batch equivalent of single mode's `renderCostEstimate` — deferred out of the original
   * batch build because it needs every file's own page count, not just the one file single mode
   * has on hand, and inspecting N files before showing anything felt like the wrong trade at the
   * time. Now: each file is inspected the moment it's added (see `addBatchFiles`), and the
   * estimate sums every file's *own* effective page count (the chosen range clamped to that
   * file's real page count) at the chosen DPI — accurate for files already inspected, and
   * flagged as partial via `knownFileCount`/`totalFileCount` for the rest still in flight.
   */
  readonly batchRenderCostEstimate = computed<BatchCostEstimate | null>(() => {
    if (!this.isRenderBatch()) {
      return null;
    }

    const files = this._batchFiles();
    const known = files.filter((row) => row.pages != null);
    if (known.length === 0) {
      return null;
    }

    const dpi = this._batchDpi();
    const secondsPerPage = SECONDS_PER_PAGE[dpi] ?? SECONDS_PER_PAGE[150];
    const bytesPerPage = BYTES_PER_PAGE[dpi] ?? BYTES_PER_PAGE[150];
    const first = this._batchFirstPage();
    const last = this._batchLastPage();

    let totalPages = 0;
    for (const row of known) {
      const pages = row.pages as number;
      const effectiveFirst = Math.max(first ?? 1, 1);
      const effectiveLast = Math.min(last ?? pages, pages);
      totalPages += Math.max(0, effectiveLast - effectiveFirst + 1);
    }

    return {
      seconds: Math.round(totalPages * secondsPerPage),
      bytes: Math.round(totalPages * bytesPerPage),
      knownFileCount: known.length,
      totalFileCount: files.length,
    };
  });

  setMode(mode: PdfWorkbenchMode): void {
    this._mode.set(mode);
  }

  setBatchOperation(operation: string): void {
    this._batchOperation.set(operation as PdfBatchOperation);
  }

  addBatchFiles(files: readonly File[]): void {
    const room = Math.max(0, MAX_BATCH_FILES - this._batchFiles().length);
    const accepted = files.slice(0, room);
    const rejectedCount = files.length - accepted.length;

    const rows: BatchFileRow[] = accepted.map((file) => ({ id: nextPdfBatchRowId(), file, pages: null, inspecting: true }));
    this._batchFiles.update((list) => [...list, ...rows]);

    this._batchLimitNotice.set(rejectedCount > 0
      ? `Batch limit is ${MAX_BATCH_FILES} files — ${rejectedCount} file${rejectedCount === 1 ? '' : 's'} not added.`
      : null);

    for (const row of rows) {
      this._apiClient.inspectPdf$(row.file)
        .pipe(finalize(() => {
          this._batchFiles.update((list) => list.map((r) => (r.id === row.id ? { ...r, inspecting: false } : r)));
        }))
        .subscribe(Either.match({
          onRight: (res) => {
            this._batchFiles.update((list) => list.map((r) => (r.id === row.id ? { ...r, pages: res.pages } : r)));
          },
          onLeft: () => {
            // Leave pages null; the row still shows and the batch cost estimate simply excludes it (noted as "N of M known").
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

  updateBatchDpi(dpi: number): void {
    this._batchDpi.set(dpi);
  }

  setBatchFormValues(values: Readonly<Record<string, unknown>>): void {
    const firstPage = values['firstPage'];
    const lastPage = values['lastPage'];
    this._batchFirstPage.set(typeof firstPage === 'number' ? firstPage : null);
    this._batchLastPage.set(typeof lastPage === 'number' ? lastPage : null);
  }

  executeBatch(): void {
    if (!this.canSubmitBatch()) {
      return;
    }

    const operation = this._batchOperation();
    const settings = operation === 'pdf.render-pages'
      ? { dpi: this._batchDpi(), firstPage: this._batchFirstPage(), lastPage: this._batchLastPage() }
      : {};

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

    /**
     * Each batch job completing hands over its result exactly once. Unlike image-resize's batch
     * (one job → one artifact), every PDF batch operation's result shape differs: inspect returns
     * plain data (no artifact at all), render-pages and extract-images each return an *array* of
     * artifacts per file — so a batch of N files can produce far more than N results.
     */
    effect(() => {
      for (const job of this.batchJobs()) {
        if (job.status !== 'completed' || this._collectedBatchJobIds.has(job.id)) {
          continue;
        }
        this._collectedBatchJobIds.add(job.id);

        if (job.operationId === 'pdf.inspect') {
          const result = job.result as PdfInspectOutput;
          this._batchInspectResults.update((list) => [...list, {
            fileName: job.label ?? 'file',
            pages: result.pages,
            title: result.title,
            author: result.author,
          }]);
        } else if (job.operationId === 'pdf.render-pages') {
          const artifacts = ArtifactModelsFromPdfRenderPagesOutput.from(job.result as PdfRenderPagesOutput);
          this._batchArtifactResults.update((list) => [...list, ...artifacts]);
        } else if (job.operationId === 'pdf.extract-images') {
          const artifacts = ArtifactModelsFromPdfExtractImagesOutput.from(job.result as PdfExtractImagesOutput);
          this._batchArtifactResults.update((list) => [...list, ...artifacts]);
        }
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

  getArtifactFileUrl(id: string): string | null {
    return this._artifactObjectUrl.getFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string | null {
    return this._artifactObjectUrl.getDownloadUrl(id);
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
