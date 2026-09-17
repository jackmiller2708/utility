import {
  ButtonComponent,
  BadgeComponent,
  BounceTextComponent,
  InputComponent,
  TileGroupComponent,
  ErrorDiagnosticComponent,
  GalleryGridComponent,
  GalleryItem,
} from '@app/ui';
import { VideoDownloadService } from '../services/video-download.service';
import { Component, inject, computed, signal, effect } from '@angular/core';
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
  selector: 'app-video-download-page',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    BadgeComponent,
    BounceTextComponent,
    InputComponent,
    TileGroupComponent,
    ErrorDiagnosticComponent,
    GalleryGridComponent,
    OptionPipe,
  ],
  providers: [VideoDownloadService],
  templateUrl: './video-download.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
})
export class VideoDownloadComponent {
  readonly service = inject(VideoDownloadService);

  readonly videoTiles = this.service.videoFormatTiles.map((t) => ({ id: t.id, label: t.label }));
  readonly audioTiles = this.service.audioFormatTiles.map((t) => ({ id: t.id, label: t.label }));

  /** A thumbnail that 404s collapses its slot entirely rather than leaving a blank rectangle — this page's whole "before" proof is the metadata reveal, so a picture-shaped hole undercuts that more than it would elsewhere. Reset whenever a new video's info loads, so the next thumbnail gets its own chance. */
  readonly thumbnailFailed = signal(false);

  constructor() {
    effect(() => {
      this.service.info();
      this.thumbnailFailed.set(false);
    });
  }

  onUrlChange(value: string): void {
    this.service.setUrl(value);
  }

  onUrlKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.service.loadInfo();
    }
  }

  selectVideoTile(tileId: string): void {
    this.service.selectFormat('video', tileId);
  }

  selectAudioTile(tileId: string): void {
    this.service.selectFormat('audio', tileId);
  }

  readonly galleryTitle = computed(() => {
    if (this.service.isProcessing()) {
      return this.service.selectedKind() === 'audio' ? 'Pulling Audio' : 'Pulling Video';
    }
    const result = this.service.lastResult();
    if (!result) {
      return 'Results';
    }
    return result.operation === 'video-download.download-audio' ? 'Pulled Audio' : 'Pulled Video';
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

  downloadResult(): void {
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

  onThumbnailError(): void {
    this.thumbnailFailed.set(true);
  }
}
