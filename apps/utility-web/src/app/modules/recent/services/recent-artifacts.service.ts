import type { ArtifactModel } from '@app/domain';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from '@app/core/services/api-client.service';
import { ArtifactObjectUrlService } from '@app/core/services/artifact-object-url.service';
import { RuntimeStatusService } from '@app/core/services/runtime-status.service';
import { ArtifactModelsFromArtifactResponseList } from '@app/domain';
import { Either } from 'effect';
import { finalize, Subject, debounceTime, distinctUntilChanged } from 'rxjs';

export interface ArtifactDayGroup {
  readonly label: string;
  readonly artifacts: readonly ArtifactModel[];
}

export interface OperationFilterOption {
  readonly id: string;
  readonly label: string;
}

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

const dayLabel = (isoDate: string): string => {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (sameDay(date, today)) {
    return 'Today';
  }
  if (sameDay(date, yesterday)) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

/**
 * The archive opposite the job tray — the durable record once a tab's own files clear. `GET
 * /artifacts` is cursor-paginated server-side (30 at a time) with server-side search and
 * operation filtering: this service never asks for the whole history at once, and every
 * search keystroke or filter change re-queries from page one rather than filtering an
 * ever-growing client-side list.
 */
@Injectable()
export class RecentArtifactsService {
  private readonly apiClient = inject(ApiClientService);
  private readonly _artifactObjectUrl = inject(ArtifactObjectUrlService);
  private readonly runtimeStatus = inject(RuntimeStatusService);

  private readonly _artifacts = signal<readonly ArtifactModel[]>([]);
  private readonly _nextCursor = signal<string | null>(null);
  private readonly _total = signal<number>(0);
  private readonly _isLoading = signal<boolean>(true);
  private readonly _isLoadingMore = signal<boolean>(false);
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _searchQuery = signal<string>('');
  private readonly _selectedOperation = signal<string | null>(null);
  private readonly _searchInput$ = new Subject<string>();

  readonly artifacts = this._artifacts.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isLoadingMore = this._isLoadingMore.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly searchQuery = this._searchQuery.asReadonly();
  readonly selectedOperation = this._selectedOperation.asReadonly();
  readonly hasMore = computed(() => this._nextCursor() !== null);
  readonly total = this._total.asReadonly();
  readonly isFiltered = computed(() => this._searchQuery().length > 0 || this._selectedOperation() !== null);

  /** Every operation any registered tool could have produced an artifact through — the same source the sidebar reveals on hover, so the filter never lists something that can't actually appear here. */
  readonly operationOptions = computed<readonly OperationFilterOption[]>(() =>
    this.runtimeStatus.tools().flatMap((tool) => tool.operations.map((op) => ({ id: op.id, label: op.name })))
  );

  /** Already newest-first from the backend; grouping preserves that order both across and within groups. */
  readonly groupedByDay = computed<readonly ArtifactDayGroup[]>(() => {
    const groups = new Map<string, ArtifactModel[]>();

    for (const artifact of this._artifacts()) {
      const label = dayLabel(artifact.createdAt);
      const existing = groups.get(label);
      if (existing) {
        existing.push(artifact);
      } else {
        groups.set(label, [artifact]);
      }
    }

    return Array.from(groups.entries()).map(([label, artifacts]) => ({ label, artifacts }));
  });

  constructor() {
    this._searchInput$.pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged()).subscribe((query) => {
      this._searchQuery.set(query);
      this._loadFirstPage();
    });
  }

  load(): void {
    this._loadFirstPage();
  }

  /** Called on every keystroke; the actual query (and reload) is debounced. */
  setSearch(query: string): void {
    this._searchInput$.next(query);
  }

  setOperationFilter(operation: string | null): void {
    if (operation === this._selectedOperation()) {
      return;
    }
    this._selectedOperation.set(operation);
    this._loadFirstPage();
  }

  loadMore(): void {
    const cursor = this._nextCursor();
    if (!cursor || this._isLoadingMore()) {
      return;
    }

    this._isLoadingMore.set(true);
    this.apiClient.listArtifacts$({ limit: PAGE_SIZE, cursor, ...this._activeFilters() })
      .pipe(finalize(() => this._isLoadingMore.set(false)))
      .subscribe(Either.match({
        onRight: (res) => {
          this._artifacts.update((list) => [...list, ...ArtifactModelsFromArtifactResponseList.from(res.artifacts)]);
          this._nextCursor.set(res.nextCursor);
          this._total.set(res.total);
        },
        onLeft: (err) => this._errorMessage.set(err.message || 'Failed to load more'),
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

  formatTime(isoDate: string): string {
    return new Date(isoDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  getArtifactFileUrl(id: string): string | null {
    return this._artifactObjectUrl.getFileUrl(id);
  }

  getArtifactDownloadUrl(id: string): string | null {
    return this._artifactObjectUrl.getDownloadUrl(id);
  }

  private _activeFilters(): { search?: string; operation?: string } {
    const search = this._searchQuery();
    const operation = this._selectedOperation();
    return {
      search: search || undefined,
      operation: operation ?? undefined,
    };
  }

  private _loadFirstPage(): void {
    this._isLoading.set(true);
    this._errorMessage.set(null);

    this.apiClient.listArtifacts$({ limit: PAGE_SIZE, ...this._activeFilters() })
      .pipe(finalize(() => this._isLoading.set(false)))
      .subscribe(Either.match({
        onRight: (res) => {
          this._artifacts.set(ArtifactModelsFromArtifactResponseList.from(res.artifacts));
          this._nextCursor.set(res.nextCursor);
          this._total.set(res.total);
        },
        onLeft: (err) => this._errorMessage.set(err.message || 'Failed to load recent artifacts'),
      }));
  }
}
