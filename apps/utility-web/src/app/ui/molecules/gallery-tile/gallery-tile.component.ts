import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';

@Component({
  selector: 'app-gallery-tile',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './gallery-tile.component.html',
})
export class GalleryTileComponent {
  label = input.required<string>();
  sizeFormatted = input<string>('');
  previewUrl = input<string | null>(null);
  downloadUrl = input<string | null>(null);
  kind = input<'image' | 'video' | 'audio'>('image');
}
