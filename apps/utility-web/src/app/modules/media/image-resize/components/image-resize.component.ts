import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ButtonComponent,
  BadgeComponent,
  InputComponent,
  SelectComponent,
  ToggleComponent,
  IconComponent,
  DropzoneComponent,
  FileSummaryCardComponent,
  TelemetryDeckComponent,
  PresetButtonsComponent,
} from '../../../../ui/index.js';
import { ImageResizeService } from '../services/image-resize.service.js';

@Component({
  selector: 'app-image-resize-page',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    BadgeComponent,
    InputComponent,
    SelectComponent,
    ToggleComponent,
    IconComponent,
    DropzoneComponent,
    FileSummaryCardComponent,
    TelemetryDeckComponent,
    PresetButtonsComponent,
  ],
  providers: [ImageResizeService],
  templateUrl: './image-resize.component.html',
})
export class ImageResizeComponent {
  readonly service = inject(ImageResizeService);

  readonly fitOptions = [
    { value: 'inside', label: 'Preserve Aspect (Scale down within bounds)' },
    { value: 'cover', label: 'Cover & Crop (Fill dimensions, crop excess)' },
    { value: 'contain', label: 'Contain & Letterbox (Pad to exact canvas)' },
    { value: 'fill', label: 'Stretch to Fit (Distort proportions)' },
    { value: 'outside', label: 'Enclose Bounds (Match minimum dimension)' },
  ];

  readonly formatOptions = [
    { value: '', label: 'Keep Source Format' },
    { value: 'webp', label: 'WebP (Balanced Compression & Web standard)' },
    { value: 'jpeg', label: 'JPEG (Standard Photo Compression)' },
    { value: 'png', label: 'PNG (Lossless Graphics & Transparency)' },
    { value: 'avif', label: 'AVIF (High Efficiency Next-Gen)' },
  ];

  readonly presets = [
    { id: 'orig', label: '100% (Original)' },
    { id: 'p50', label: '50%' },
    { id: 'p25', label: '25%' },
    { id: '1080p', label: '1080p' },
    { id: 'sq800', label: '800 Sq' },
  ];

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      if (this.service.selectedImage() && !this.service.isProcessing()) {
        event.preventDefault();
        this.service.executeResize();
      }
    }
  }

  @HostListener('window:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
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
    const val = Number((event.target as HTMLInputElement).value);
    this.service.updateFormState({ quality: val });
  }
}
