import { ButtonComponent, BadgeComponent, InputComponent, DropzoneComponent, FileSummaryCardComponent, GalleryGridComponent, TileGroupComponent, ErrorDiagnosticComponent, SortableFileListComponent, GalleryItem, SortableFileItem } from '@app/ui';
import { MergeSplitService } from '../services/merge-split.service';
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OptionPipe } from '@app/core/pipes/option.pipe';

@Component({
  selector: 'app-merge-split-page',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    BadgeComponent,
    InputComponent,
    DropzoneComponent,
    FileSummaryCardComponent,
    GalleryGridComponent,
    TileGroupComponent,
    ErrorDiagnosticComponent,
    SortableFileListComponent,
    OptionPipe,
  ],
  providers: [MergeSplitService],
  templateUrl: './merge-split.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
})
export class MergeSplitComponent {
  readonly service = inject(MergeSplitService);

  readonly modeTiles = [
    { id: 'split', label: 'SPLIT' },
    { id: 'merge', label: 'MERGE' },
  ];

  readonly mergeFileItems = computed<readonly SortableFileItem[]>(() =>
    this.service.mergeFiles().map((row) => ({
      id: row.id,
      name: row.file.name,
      sizeFormatted: this.service.formatBytes(row.file.size),
      detail: row.inspecting ? 'Reading…' : row.pages != null ? `${row.pages} page${row.pages === 1 ? '' : 's'}` : undefined,
    }))
  );

  readonly galleryTitle = computed(() => {
    const action = this.service.activeAction();
    if (this.service.isProcessing() && action) {
      return action === 'split' ? 'Splitting PDF' : 'Merging PDFs';
    }

    const result = this.service.lastResult();
    if (!result) {
      return 'Results';
    }
    return result.action === 'split' ? 'Split Files' : 'Merged File';
  });

  readonly galleryItems = computed<readonly GalleryItem[]>(() => {
    const result = this.service.lastResult();
    if (!result) {
      return [];
    }

    return result.items.map((artifact) => ({
      id: artifact.id,
      label: artifact.name,
      sizeFormatted: this.service.formatBytes(artifact.size),
      previewUrl: null,
      downloadUrl: this.service.getArtifactDownloadUrl(artifact.id),
    }));
  });

  onModeSelected(modeId: string): void {
    this.service.setMode(modeId as 'split' | 'merge');
  }

  onMergeFilesSelected(files: File[]): void {
    this.service.addMergeFiles(files);
  }

  onMergeFileReorder(event: { fromIndex: number; toIndex: number }): void {
    this.service.reorderMergeFiles(event.fromIndex, event.toIndex);
  }

  downloadAll(): void {
    const items = this.galleryItems();
    items.forEach((item, index) => {
      if (!item.downloadUrl) {
        return;
      }
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = item.downloadUrl!;
        link.download = item.label;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 150);
    });
  }
}
