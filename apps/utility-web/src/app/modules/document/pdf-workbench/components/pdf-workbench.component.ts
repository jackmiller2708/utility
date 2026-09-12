import { ButtonComponent, BadgeComponent, InputComponent, DropzoneComponent, FileSummaryCardComponent, GalleryGridComponent, TileGroupComponent, ErrorDiagnosticComponent, GalleryItem, SortableFileListComponent, SortableFileItem, OperationFormComponent } from '@app/ui';
import { PdfWorkbenchService } from '../services/pdf-workbench.service';
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OptionPipe } from '@app/core/pipes/option.pipe';

@Component({
  selector: 'app-pdf-workbench-page',
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
    OperationFormComponent,
    OptionPipe,
  ],
  providers: [PdfWorkbenchService],
  templateUrl: './pdf-workbench.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
})
export class PdfWorkbenchComponent {
  readonly service = inject(PdfWorkbenchService);

  readonly modeTiles = [
    { id: 'single', label: 'SINGLE' },
    { id: 'batch', label: 'BATCH' },
  ];

  readonly dpiTiles = this.service.dpiOptions.map((dpi) => ({ id: String(dpi), label: `${dpi} DPI` }));

  readonly batchFileItems = computed<readonly SortableFileItem[]>(() =>
    this.service.batchFiles().map((row) => ({
      id: row.id,
      name: row.file.name,
      sizeFormatted: this.service.formatBytes(row.file.size),
      detail: row.inspecting ? 'Reading…' : row.pages != null ? `${row.pages} page${row.pages === 1 ? '' : 's'}` : undefined,
    }))
  );

  readonly batchCostEstimateLabel = computed(() => {
    const estimate = this.service.batchRenderCostEstimate();
    if (!estimate) {
      return null;
    }
    const label = `≈${this.service.formatSeconds(estimate.seconds)} · ~${this.service.formatBytes(estimate.bytes)}`;
    return estimate.knownFileCount < estimate.totalFileCount
      ? `${label} (${estimate.knownFileCount} of ${estimate.totalFileCount} files known)`
      : label;
  });

  readonly batchGalleryItems = computed<readonly GalleryItem[]>(() =>
    this.service.batchArtifactResults().map((artifact) => ({
      id: artifact.id,
      label: artifact.name,
      sizeFormatted: this.service.formatBytes(artifact.size),
      previewUrl: this.service.getArtifactFileUrl(artifact.id),
      downloadUrl: this.service.getArtifactDownloadUrl(artifact.id),
    }))
  );

  readonly batchTitle = computed(() => {
    if (this.service.isBatchActive()) {
      return 'Working';
    }
    if (this.service.isInspectBatch()) {
      return this.service.batchInspectResults().length > 0 ? 'Inspected' : 'Results';
    }
    if (this.service.batchArtifactResults().length === 0) {
      return 'Results';
    }
    return this.service.batchOperation() === 'pdf.render-pages' ? 'Rendered Pages' : 'Extracted Images';
  });

  onModeSelected(modeId: string): void {
    this.service.setMode(modeId as 'single' | 'batch');
  }

  onBatchFileReorder(event: { fromIndex: number; toIndex: number }): void {
    this.service.reorderBatchFiles(event.fromIndex, event.toIndex);
  }

  onBatchDpiSelected(dpiId: string): void {
    this.service.updateBatchDpi(Number(dpiId));
  }

  downloadAllBatch(): void {
    this.batchGalleryItems().forEach((item, index) => {
      if (!item.downloadUrl) {
        return;
      }
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = item.downloadUrl!;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 150);
    });
  }

  readonly galleryTitle = computed(() => {
    const action = this.service.activeAction();
    if (this.service.isProcessing() && action) {
      return action === 'render' ? 'Rendering Pages' : 'Extracting Images';
    }

    const result = this.service.lastResult();
    if (!result) {
      return 'Results';
    }
    return result.action === 'render' ? 'Rendered Pages' : 'Extracted Images';
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
      previewUrl: this.service.getArtifactFileUrl(artifact.id),
      downloadUrl: this.service.getArtifactDownloadUrl(artifact.id),
    }));
  });

  readonly costEstimateLabel = computed(() => {
    const estimate = this.service.renderCostEstimate();
    if (!estimate) {
      return null;
    }
    return `≈${this.service.formatSeconds(estimate.seconds)} · ~${this.service.formatBytes(estimate.bytes)}`;
  });

  onDpiSelected(dpiId: string): void {
    this.service.updateDpi(Number(dpiId));
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
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 150);
    });
  }
}
