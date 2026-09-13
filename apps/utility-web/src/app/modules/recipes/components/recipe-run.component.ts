import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ButtonComponent,
  BadgeComponent,
  DropzoneComponent,
  FileSummaryCardComponent,
  GalleryGridComponent,
  GalleryItem,
  TileGroupComponent,
  IconComponent,
} from '@app/ui';
import { RecipesService } from '../services/recipes.service';
import { ApiClientService } from '@app/core/services/api-client.service';
import { ArtifactObjectUrlService } from '@app/core/services/artifact-object-url.service';
import { JobTrackerService, RuntimeStatusService } from '@app/core';
import { ArtifactModel, ArtifactModelFromWorkflowRunOutput, WorkflowModel, WorkflowModelFromWorkflowResponse } from '@app/domain';
import type { WorkflowRunOutput } from '@utility/protocol';
import { Either, Option } from 'effect';
import { finalize } from 'rxjs';

type RunMode = 'single' | 'batch';

interface DropzoneConfig {
  readonly accept: string;
  readonly formats: readonly string[];
}

const MEDIA_DROPZONE: DropzoneConfig = { accept: 'video/*,audio/*', formats: ['MP4', 'MOV', 'WEBM', 'MKV', 'MP3', 'WAV'] };
const IMAGE_DROPZONE: DropzoneConfig = { accept: 'image/png,image/jpeg,image/webp,image/avif,image/gif', formats: ['PNG', 'JPEG', 'WebP', 'AVIF'] };

const kindForMimeType = (mimeType: string): 'image' | 'video' | 'audio' => {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
};

@Component({
  selector: 'app-recipe-run-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    DropzoneComponent,
    FileSummaryCardComponent,
    GalleryGridComponent,
    TileGroupComponent,
    IconComponent,
  ],
  templateUrl: './recipe-run.component.html',
  host: { class: 'block min-w-0 w-full' },
})
export class RecipeRunComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly recipes = inject(RecipesService);
  private readonly apiClient = inject(ApiClientService);
  private readonly artifactObjectUrl = inject(ArtifactObjectUrlService);
  private readonly jobTracker = inject(JobTrackerService);
  private readonly runtimeStatus = inject(RuntimeStatusService);

  readonly recipe = signal<WorkflowModel | null>(null);
  readonly notFound = signal(false);

  readonly modeTiles = [
    { id: 'single', label: 'SINGLE' },
    { id: 'batch', label: 'BATCH' },
  ];
  readonly mode = signal<RunMode>('single');

  readonly dropzoneConfig = computed<DropzoneConfig>(() => {
    const firstStep = this.recipe()?.steps[0]?.operationId ?? '';
    return firstStep.startsWith('media.') ? MEDIA_DROPZONE : IMAGE_DROPZONE;
  });

  // ---- Single file ----
  private readonly _selectedFile = signal<Option.Option<File>>(Option.none());
  private readonly _isSubmitting = signal(false);
  private readonly _activeJobId = signal<Option.Option<string>>(Option.none());
  private readonly _errorMessage = signal<Option.Option<string>>(Option.none());
  private readonly _lastResult = signal<ArtifactModel | null>(null);

  readonly selectedFile = computed(() => Option.getOrNull(this._selectedFile()));
  readonly errorMessage = computed(() => Option.getOrNull(this._errorMessage()));
  readonly lastResult = this._lastResult.asReadonly();
  readonly activeJob = computed(() => {
    const id = this._activeJobId();
    return Option.isNone(id) ? null : this.jobTracker.jobs().find((job) => job.id === id.value) ?? null;
  });
  readonly isProcessing = computed(() => this._isSubmitting() || this.activeJob() !== null);
  readonly canSubmit = computed(() => this.selectedFile() !== null && !this.isProcessing());

  readonly galleryItems = computed<readonly GalleryItem[]>(() => {
    const artifact = this.lastResult();
    if (!artifact) return [];
    return [{
      id: artifact.id,
      label: artifact.name,
      sizeFormatted: this.formatBytes(artifact.size),
      previewUrl: this.artifactObjectUrl.getFileUrl(artifact.id),
      downloadUrl: this.artifactObjectUrl.getDownloadUrl(artifact.id),
      kind: kindForMimeType(artifact.mimeType),
    }];
  });

  // ---- Batch ----
  private readonly _batchFiles = signal<readonly File[]>([]);
  private readonly _activeBatchId = signal<Option.Option<string>>(Option.none());
  private readonly _isBatchSubmitting = signal(false);
  private readonly _batchResults = signal<readonly ArtifactModel[]>([]);
  private readonly _collectedBatchJobIds = new Set<string>();

  readonly batchFiles = this._batchFiles.asReadonly();
  readonly batchJobs = computed(() => {
    const id = this._activeBatchId();
    if (Option.isNone(id)) return [];
    return this.jobTracker.jobs().filter((job) => job.batchId === id.value);
  });
  readonly isBatchActive = computed(() => this._isBatchSubmitting() || this.batchJobs().some((job) => job.isActive));
  readonly canSubmitBatch = computed(() => this._batchFiles().length > 0 && !this.isBatchActive());

  readonly batchGalleryItems = computed<readonly GalleryItem[]>(() =>
    this._batchResults().map((artifact) => ({
      id: artifact.id,
      label: artifact.name,
      sizeFormatted: this.formatBytes(artifact.size),
      previewUrl: this.artifactObjectUrl.getFileUrl(artifact.id),
      downloadUrl: this.artifactObjectUrl.getDownloadUrl(artifact.id),
      kind: kindForMimeType(artifact.mimeType),
    }))
  );

  constructor() {
    effect(() => {
      const job = this.activeJob();
      if (!job || !job.isTerminal) return;
      this._activeJobId.set(Option.none());

      if (job.status === 'completed') {
        const result = job.result as WorkflowRunOutput;
        this._lastResult.set(ArtifactModelFromWorkflowRunOutput.from(result));
      } else if (job.status === 'failed') {
        this._errorMessage.set(Option.some(job.error ?? 'This recipe failed to run'));
      }
    });

    effect(() => {
      for (const job of this.batchJobs()) {
        if (job.status !== 'completed' || this._collectedBatchJobIds.has(job.id)) continue;
        this._collectedBatchJobIds.add(job.id);
        const result = job.result as WorkflowRunOutput;
        this._batchResults.update((list) => [...list, ArtifactModelFromWorkflowRunOutput.from(result)]);
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      return;
    }

    const cached = this.recipes.findById(id);
    if (cached) {
      this.recipe.set(cached);
      return;
    }

    this.recipes.get$(id).subscribe(Either.match({
      onRight: (res) => this.recipe.set(WorkflowModelFromWorkflowResponse.from(res)),
      onLeft: () => this.notFound.set(true),
    }));
  }

  setMode(mode: string): void {
    this.mode.set(mode as RunMode);
  }

  setFile(file: File): void {
    this._errorMessage.set(Option.none());
    this._lastResult.set(null);
    this._selectedFile.set(Option.some(file));
  }

  resetFile(): void {
    this._selectedFile.set(Option.none());
    this._lastResult.set(null);
    this._errorMessage.set(Option.none());
  }

  addBatchFiles(files: readonly File[]): void {
    this._batchFiles.update((list) => [...list, ...files]);
  }

  removeBatchFile(file: File): void {
    this._batchFiles.update((list) => list.filter((f) => f !== file));
  }

  clearBatchFiles(): void {
    this._batchFiles.set([]);
    this._batchResults.set([]);
    this._activeBatchId.set(Option.none());
    this._collectedBatchJobIds.clear();
  }

  run(): void {
    const file = this.selectedFile();
    const recipe = this.recipe();
    if (!file || !recipe || this.isProcessing()) return;

    this._isSubmitting.set(true);
    this._errorMessage.set(Option.none());

    this.jobTracker.submit$(recipe.operationId, file.name, this.apiClient.submitJob$(recipe.operationId, file, {}))
      .pipe(finalize(() => this._isSubmitting.set(false)))
      .subscribe(Either.match({
        onRight: ({ jobId }) => this._activeJobId.set(Option.some(jobId)),
        onLeft: (err) => this._errorMessage.set(Option.some(err.message || 'Failed to start this recipe')),
      }));
  }

  runBatch(): void {
    const recipe = this.recipe();
    if (!recipe || !this.canSubmitBatch()) return;

    this._batchResults.set([]);
    this._collectedBatchJobIds.clear();
    this._isBatchSubmitting.set(true);

    this.jobTracker.submitBatch$(recipe.operationId, this._batchFiles(), {})
      .pipe(finalize(() => this._isBatchSubmitting.set(false)))
      .subscribe(({ batchId }) => this._activeBatchId.set(Option.some(batchId)));
  }

  cancelActiveJob(): void {
    const id = this._activeJobId();
    if (Option.isSome(id)) {
      this.jobTracker.cancel(id.value);
    }
  }

  stepLabel(operationId: string): string {
    const label = this.runtimeStatus.tools()
      .flatMap((tool) => tool.operations)
      .find((op) => op.id === operationId)?.name;
    return label ?? operationId.replace(/[.-]/g, ' ');
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
