import { ButtonComponent, BadgeComponent, InputComponent, ToggleComponent, IconComponent, DropzoneComponent, FileSummaryCardComponent, TelemetryDeckComponent, TileGroupComponent } from '@app/ui';
import { ImageResizeService } from '../services/image-resize.service';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OptionPipe } from '@app/core/pipes/option.pipe';

@Component({
  selector: 'app-image-resize-page',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    BadgeComponent,
    InputComponent,
    ToggleComponent,
    IconComponent,
    DropzoneComponent,
    FileSummaryCardComponent,
    TelemetryDeckComponent,
    TileGroupComponent,
    OptionPipe
  ],
  providers: [ImageResizeService],
  templateUrl: './image-resize.component.html',
  host: {
    class: 'block min-w-0 w-full',
    '(window:keydown)': 'onKeyDown($event)',
    '(window:paste)': 'onPaste($event)'
  }
})
export class ImageResizeComponent {
  readonly service = inject(ImageResizeService);

  readonly fitTiles = [
    { id: 'inside', label: 'FIT' },
    { id: 'cover', label: 'FILL' },
    { id: 'contain', label: 'LETTERBOX' },
    { id: 'fill', label: 'STRETCH' },
    { id: 'outside', label: 'COVER' },
  ];

  readonly fitHelp: Record<string, string> = {
    inside: 'Scales to fit inside the bounds, aspect ratio locked. Nothing is cropped.',
    cover: 'Scales to fill the bounds and crops the overflow — centre-weighted.',
    contain: 'Fits inside the bounds and pads the remainder to hit the exact canvas.',
    fill: 'Forces the exact canvas. Aspect ratio is not preserved — expect distortion.',
    outside: 'Scales so both dimensions meet or exceed the bounds. Nothing is cropped.',
  };

  readonly formatTiles = [
    { id: '', label: 'SOURCE' },
    { id: 'webp', label: 'WEBP' },
    { id: 'jpeg', label: 'JPEG' },
    { id: 'png', label: 'PNG' },
    { id: 'avif', label: 'AVIF' },
  ];

  readonly presets = [
    { id: 'orig', label: '100%' },
    { id: 'p50', label: '50%' },
    { id: 'p25', label: '25%' },
    { id: '1080p', label: '1080p' },
    { id: 'sq800', label: 'Square' },
  ];

  onKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && this.service.selectedImage() && !this.service.isProcessing()) {
      event.preventDefault();
      this.service.executeResize();
    }
  }

  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;

    if (!items) {
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();

        if (file) {
          event.preventDefault();
          this.service.setImage(file);
          break;
        }
      }
    }
  }

  onPresetSelected(presetId: string): void {
    switch (presetId) {
      case 'orig':
        this.service.applyScalePreset(1.0, 'orig');
        break;
      case 'p50':
        this.service.applyScalePreset(0.5, 'p50');
        break;
      case 'p25':
        this.service.applyScalePreset(0.25, 'p25');
        break;
      case '1080p':
        this.service.applyDimensionPreset(1920, 1080, '1080p');
        break;
      case 'sq800':
        this.service.applyDimensionPreset(800, 800, 'sq800');
        break;
    }
  }

  onQualitySliderChange(event: Event): void {
    this.service.updateFormState({ quality: Number((event.target as HTMLInputElement).value) });
  }
}
