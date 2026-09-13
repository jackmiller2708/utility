import {
  ButtonComponent,
  BadgeComponent,
  DropzoneComponent,
  FileSummaryCardComponent,
  GalleryGridComponent,
  TileGroupComponent,
  ErrorDiagnosticComponent,
  GalleryItem,
  SortableFileListComponent,
  SortableFileItem,
  OperationFormComponent,
  VideoScrubberComponent,
} from '@app/ui';
import { VideoAudioService } from '../services/video-audio.service';
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OptionPipe } from '@app/core/pipes/option.pipe';

const kindForMimeType = (mimeType: string): 'image' | 'video' | 'audio' => {
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'image';
};

@Component({
  selector: 'app-video-audio-page',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    BadgeComponent,
    DropzoneComponent,
    FileSummaryCardComponent,
    GalleryGridComponent,
    TileGroupComponent,
    ErrorDiagnosticComponent,
    SortableFileListComponent,
    OperationFormComponent,
    VideoScrubberComponent,
    OptionPipe,
  ],
  providers: [VideoAudioService],
  templateUrl: './video-audio.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
})
export class VideoAudioComponent {
  readonly service = inject(VideoAudioService);

  readonly modeTiles = [
    { id: 'single', label: 'SINGLE' },
    { id: 'batch', label: 'BATCH' },
  ];

  readonly qualityTiles = this.service.qualityPresets.map((preset) => ({ id: preset.id, label: preset.label }));

  qualityTileId(value: number): string {
    return this.service.qualityPresets.find((preset) => preset.value === value)?.id ?? 'balanced';
  }

  onQualitySelected(presetId: string): void {
    const preset = this.service.qualityPresets.find((p) => p.id === presetId);
    if (preset) {
      this.service.setQuality(preset.value);
    }
  }

  onBatchQualitySelected(presetId: string): void {
    const preset = this.service.qualityPresets.find((p) => p.id === presetId);
    if (preset) {
      this.service.setBatchQuality(preset.value);
    }
  }

  onModeSelected(modeId: string): void {
    this.service.setMode(modeId as 'single' | 'batch');
  }

  onBatchFileReorder(event: { fromIndex: number; toIndex: number }): void {
    this.service.reorderBatchFiles(event.fromIndex, event.toIndex);
  }

  readonly batchFileItems = computed<readonly SortableFileItem[]>(() =>
    this.service.batchFiles().map((row) => ({
      id: row.id,
      name: row.file.name,
      sizeFormatted: this.service.formatBytes(row.file.size),
      detail: row.inspecting ? 'Reading…' : row.durationSeconds != null ? this.service.formatDuration(row.durationSeconds) : undefined,
    }))
  );

  readonly batchGalleryItems = computed<readonly GalleryItem[]>(() =>
    this.service.batchArtifactResults().map((artifact) => ({
      id: artifact.id,
      label: artifact.name,
      sizeFormatted: this.service.formatBytes(artifact.size),
      previewUrl: this.service.getArtifactFileUrl(artifact.id),
      downloadUrl: this.service.getArtifactDownloadUrl(artifact.id),
      kind: kindForMimeType(artifact.mimeType),
    }))
  );

  downloadAllBatch(): void {
    this.batchGalleryItems().forEach((item, index) => {
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

  readonly galleryTitle = computed(() => {
    const operation = this.service.activeOperation();
    if (this.service.isProcessing() && operation) {
      return operation === 'media.extract-audio' ? 'Extracting Audio' : operation === 'media.transcode' ? 'Transcoding' : 'Capturing Thumbnail';
    }

    const result = this.service.lastResult();
    if (!result) {
      return 'Results';
    }
    return result.operation === 'media.extract-audio' ? 'Extracted Audio' : result.operation === 'media.transcode' ? 'Transcoded' : 'Thumbnail';
  });

  readonly galleryItems = computed<readonly GalleryItem[]>(() => {
    const result = this.service.lastResult();
    if (!result) {
      return [];
    }

    const artifact = result.artifact;
    return [{
      id: artifact.id,
      label: artifact.name,
      sizeFormatted: this.service.formatBytes(artifact.size),
      previewUrl: this.service.getArtifactFileUrl(artifact.id),
      downloadUrl: this.service.getArtifactDownloadUrl(artifact.id),
      kind: kindForMimeType(artifact.mimeType),
    }];
  });

  readonly transcodeSizeDelta = computed<{ grew: boolean; percent: number } | null>(() => {
    const result = this.service.lastResult();
    const source = this.service.selectedFile();
    if (!result || result.operation !== 'media.transcode' || !source || source.size === 0) {
      return null;
    }

    const diff = result.artifact.size - source.size;
    const percent = Math.round((Math.abs(diff) / source.size) * 100);
    return { grew: diff > 0, percent };
  });

  downloadSingle(): void {
    const items = this.galleryItems();
    if (items[0]?.downloadUrl) {
      const link = document.createElement('a');
      link.href = items[0].downloadUrl;
      link.download = items[0].label;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }
}
