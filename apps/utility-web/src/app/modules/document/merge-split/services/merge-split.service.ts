import type { ArtifactModel } from '../../../../domain/index.js';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from '../../../../core/services/api-client.service.js';
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

  private readonly _mode = signal<MergeSplitMode>('split');
  private readonly _isProcessing = signal<boolean>(false);
  private readonly _activeAction = signal<MergeSplitAction | null>(null);
  private readonly _elapsedSeconds = signal<number>(0);
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());
  private readonly _lastResult = signal<{ action: MergeSplitAction; items: readonly ArtifactModel[] } | null>(null);
  private _elapsedTimer: ReturnType<typeof setInterval> | undefined;

  // Split state
  private readonly _selectedPdf = signal<Option.Option<PdfFileDetails>>(Option.none());
  private readonly _inspectResult = signal<Option.Option<PdfInspectResult>>(Option.none());
  private readonly _isInspecting = signal<boolean>(false);
  private readonly _ranges = signal<readonly SplitRangeRow[]>([{ id: nextRowId(), firstPage: null, lastPage: null }]);

  // Merge state
  private readonly _mergeFiles = signal<readonly MergeFileRow[]>([]);

  readonly mode = this._mode.asReadonly();
  readonly isProcessing = this._isProcessing.asReadonly();
  readonly activeAction = this._activeAction.asReadonly();
  readonly elapsedSeconds = this._elapsedSeconds.asReadonly();
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
    if (Option.isNone(pdf) || this._isProcessing()) {
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
    this._isProcessing.set(true);
    this._errorMessage.set(Option.none());
    this._startElapsedTimer();

    this._apiClient.splitPdf$(pdf.value.file, ranges)
      .pipe(finalize(() => {
        this._isProcessing.set(false);
        this._stopElapsedTimer();
      }))
      .subscribe(Either.match({
        onRight: (res) => {
          this._lastResult.set({ action: 'split', items: ArtifactModelsFromPdfSplitOutput.from(res) });
        },
        onLeft: (err) => {
          this._errorMessage.set(Option.some(err.message || 'Failed to split PDF'));
        },
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
    if (files.length < 2 || this._isProcessing()) {
      return;
    }

    this._activeAction.set('merge');
    this._isProcessing.set(true);
    this._errorMessage.set(Option.none());
    this._startElapsedTimer();

    this._apiClient.mergePdfs$(files.map((f) => f.file))
      .pipe(finalize(() => {
        this._isProcessing.set(false);
        this._stopElapsedTimer();
      }))
      .subscribe(Either.match({
        onRight: (res) => {
          this._lastResult.set({ action: 'merge', items: [ArtifactModelFromPdfMergeOutput.from(res)] });
        },
        onLeft: (err) => {
          this._errorMessage.set(Option.some(err.message || 'Failed to merge PDFs'));
        },
      }));
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

  private _startElapsedTimer(): void {
    this._elapsedSeconds.set(0);
    this._elapsedTimer = setInterval(() => {
      this._elapsedSeconds.update((s) => s + 1);
    }, 1000);
  }

  private _stopElapsedTimer(): void {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = undefined;
    }
  }
}
