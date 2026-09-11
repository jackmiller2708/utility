import { ButtonComponent, BadgeComponent, InputComponent, DropzoneComponent, FileSummaryCardComponent, GalleryGridComponent, TileGroupComponent, ErrorDiagnosticComponent, GalleryItem } from '@app/ui';
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
    OptionPipe,
  ],
  providers: [PdfWorkbenchService],
  templateUrl: './pdf-workbench.component.html',
  host: { class: 'block min-w-0 w-full' },
})
export class PdfWorkbenchComponent {
  readonly service = inject(PdfWorkbenchService);

  readonly dpiTiles = this.service.dpiOptions.map((dpi) => ({ id: String(dpi), label: `${dpi} DPI` }));

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
