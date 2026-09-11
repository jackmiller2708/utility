import type { ArtifactModel, JobModel } from '../../../../domain/index.js';
import type { PdfSplitOutput, PdfMergeOutput } from '@utility/protocol';

import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ApiClientService } from '../../../../core/services/api-client.service.js';
import { JobTrackerService } from '../../../../core/index.js';
import { ArtifactModelsFromPdfSplitOutput, ArtifactModelFromPdfMergeOutput } from '../../../../domain/index.js';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

export type MergeSplitMode = 'split' | 'merge';
export type MergeSplitAction = 'split' | 'merge';

export interface PdfFileDetails {
  readonly file: File;
  readonly name: string;
  readonly size: number;
}

export interface PdfInspectResult {
  readonly pages: number;
  readonly title?: string;
  readonly author?: string;
}

export interface SplitRangeRow {
  readonly id: string;
  readonly firstPage: number | null;
  readonly lastPage: number | null;
}

export interface MergeFileRow {
  readonly id: string;
  readonly file: File;
  readonly pages: number | null;
  readonly inspecting: boolean;
}

export interface ErrorDiagnostic {
  title: string;
  message: string;
  suggestion: string;
}

let rowIdCounter = 0;
const nextRowId = () => `row_${++rowIdCounter}`;

@Injectable()
export class MergeSplitService {
  private readonly _apiClient = inject(ApiClientService);
  private readonly _jobTracker = inject(JobTrackerService);

  private readonly _mode = signal<MergeSplitMode>('split');
  private readonly _activeAction = signal<MergeSplitAction | null>(null);
  private readonly _isSubmitting = signal<boolean>(false);
  private readonly _activeJobId = signal<Option.Option<string>>(Option.none());
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());
  private readonly _lastResult = signal<{ action: MergeSplitAction; items: readonly ArtifactModel[] } | null>(null);

  // Split state
  private readonly _selectedPdf = signal<Option.Option<PdfFileDetails>>(Option.none());
  private readonly _inspectResult = signal<Option.Option<PdfInspectResult>>(Option.none());
  private readonly _isInspecting = signal<boolean>(false);
  private readonly _ranges = signal<readonly SplitRangeRow[]>([{ id: nextRowId(), firstPage: null, lastPage: null }]);

  // Merge state
  private readonly _mergeFiles = signal<readonly MergeFileRow[]>([]);

  readonly mode = this._mode.asReadonly();
  readonly activeAction = this._activeAction.asReadonly();
  /** The tracked job behind the current split/merge run, once submission has been accepted — null before that, and null again once its terminal state has been consumed. */
  readonly activeJob = computed<JobModel | null>(() => {
    const id = this._activeJobId();
    return Option.isNone(id) ? null : this._jobTracker.jobs().find((job) => job.id === id.value) ?? null;
  });
  readonly isProcessing = computed(() => this._isSubmitting() || this.activeJob() !== null);
  readonly errorMessage = computed(() => Option.getOrNull(this._errorMessage()));
  readonly lastResult = this._lastResult.asReadonly();

  readonly selectedPdf = computed(() => Option.getOrNull(this._selectedPdf()));
  readonly inspectResult = computed(() => Option.getOrNull(this._inspectResult()));
  readonly isInspecting = this._isInspecting.asReadonly();
  readonly ranges = this._ranges.asReadonly();

  readonly mergeFiles = this._mergeFiles.asReadonly();

  readonly hasValidRange = computed(() => this._ranges().some((r) => r.firstPage != null && r.lastPage != null && r.firstPage <= r.lastPage));
  readonly canMerge = computed(() => this._mergeFiles().length >= 2);

  readonly errorDiagnostic = computed<Option.Option<ErrorDiagnostic>>(() => this._errorMessage().pipe(Option.map((err) => {
    const lower = err.toLowerCase();

    if (lower.includes('valid pdf') || lower.includes('syntax') || lower.includes('damaged')) {
      return {
        title: 'Invalid PDF',
        message: err,
        suggestion: 'Check that every file opens normally in a PDF viewer and is not corrupted or password-protected.',
      };
    }

    if (lower.includes('two pdf files') || lower.includes('page range')) {
      return {
        title: 'Nothing to do yet',
        message: err,
        suggestion: this._mode() === 'merge' ? 'Add at least two PDF files to merge.' : 'Add at least one valid page range.',
      };
    }

    return {
      title: 'Operation Failed',
      message: err,
      suggestion: 'Verify the files and parameters, then retry.',
    };
  })));

  constructor() {
    effect(() => {
      const job = this.activeJob();

      if (!job || !job.isTerminal) {
        return;
      }

      const action = this._activeAction() ?? 'split';
      this._activeJobId.set(Option.none());

      if (job.status === 'completed') {
        const items = action === 'merge'
          ? [ArtifactModelFromPdfMergeOutput.from(job.result as PdfMergeOutput)]
          : ArtifactModelsFromPdfSplitOutput.from(job.result as PdfSplitOutput);
        this._lastResult.set({ action, items });
      } else if (job.status === 'failed') {
        this._errorMessage.set(Option.some(job.error ?? 'Operation failed'));
      }
    });
  }

  setMode(mode: MergeSplitMode): void {
    this._mode.set(mode);
    this._selectedPdf.set(Option.none());
    this._inspectResult.set(Option.none());
    this._ranges.set([{ id: nextRowId(), firstPage: null, lastPage: null }]);
    this._mergeFiles.set([]);
    this._lastResult.set(null);
    this._errorMessage.set(Option.none());
  }

  // --- Split ---

  setPdf(file: File): void {
    this._errorMessage.set(Option.none());
    this._lastResult.set(null);
    this._inspectResult.set(Option.none());
    this._ranges.set([{ id: nextRowId(), firstPage: null, lastPage: null }]);

    this._selectedPdf.set(Option.some({ file, name: file.name, size: file.size }));

    this._isInspecting.set(true);
    this._apiClient.inspectPdf$(file)
      .pipe(finalize(() => this._isInspecting.set(false)))
      .subscribe(Either.match({
        onRight: (res) => this._inspectResult.set(Option.some(res)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to inspect PDF')),
      }));
  }

  resetPdf(): void {
    this._selectedPdf.set(Option.none());
    this._inspectResult.set(Option.none());
    this._ranges.set([{ id: nextRowId(), firstPage: null, lastPage: null }]);
    this._lastResult.set(null);
    this._errorMessage.set(Option.none());
  }

  addRange(): void {
    this._ranges.update((rows) => [...rows, { id: nextRowId(), firstPage: null, lastPage: null }]);
  }

  removeRange(id: string): void {
    this._ranges.update((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  }

  updateRangeFirst(id: string, value: number | null): void {
    this._ranges.update((rows) => rows.map((r) => (r.id === id ? { ...r, firstPage: value } : r)));
  }

  updateRangeLast(id: string, value: number | null): void {
    this._ranges.update((rows) => rows.map((r) => (r.id === id ? { ...r, lastPage: value } : r)));
  }

  executeSplit(): void {
    const pdf = this._selectedPdf();
    if (Option.isNone(pdf) || this.isProcessing()) {
      return;
    }

    const ranges = this._ranges()
      .filter((r) => r.firstPage != null && r.lastPage != null && r.firstPage <= r.lastPage)
      .map((r) => ({ firstPage: r.firstPage as number, lastPage: r.lastPage as number }));

    if (ranges.length === 0) {
      this._errorMessage.set(Option.some('At least one valid page range is required'));
      return;
    }

    this._activeAction.set('split');
    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this._jobTracker.submit$(
      'pdf.split',
      pdf.value.name,
      this._apiClient.submitSplitJob$(pdf.value.file, ranges)
    )
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start split job')),
      }));
  }

  // --- Merge ---

  addMergeFiles(files: readonly File[]): void {
    this._errorMessage.set(Option.none());
    this._lastResult.set(null);

    const newRows: MergeFileRow[] = files.map((file) => ({ id: nextRowId(), file, pages: null, inspecting: true }));
    this._mergeFiles.update((rows) => [...rows, ...newRows]);

    for (const row of newRows) {
      this._apiClient.inspectPdf$(row.file)
        .pipe(finalize(() => {
          this._mergeFiles.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, inspecting: false } : r)));
        }))
        .subscribe(Either.match({
          onRight: (res) => {
            this._mergeFiles.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, pages: res.pages } : r)));
          },
          onLeft: () => {
            // Leave pages null; the row still shows and the real error surfaces if merge is attempted on it.
          },
        }));
    }
  }

  removeMergeFile(id: string): void {
    this._mergeFiles.update((rows) => rows.filter((r) => r.id !== id));
  }

  reorderMergeFiles(fromIndex: number, toIndex: number): void {
    this._mergeFiles.update((rows) => {
      const next = [...rows];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  executeMerge(): void {
    const files = this._mergeFiles();
    if (files.length < 2 || this.isProcessing()) {
      return;
    }

    const label = files.length > 2 ? `${files[0].file.name} +${files.length - 1}` : files.map((f) => f.file.name).join(' + ');

    this._activeAction.set('merge');
    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this._jobTracker.submit$(
      'pdf.merge',
      label,
      this._apiClient.submitMergeJob$(files.map((f) => f.file))
    )
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start merge job')),
      }));
  }

  cancelActiveJob(): void {
    const id = this._activeJobId();
    if (Option.isSome(id)) {
      this._jobTracker.cancel(id.value);
    }
  }

  // --- Shared ---

  formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getArtifactFileUrl(id: string): string {
    return this._apiClient.getArtifactFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string {
    return this._apiClient.getArtifactDownloadUrl(id);
  }
}
