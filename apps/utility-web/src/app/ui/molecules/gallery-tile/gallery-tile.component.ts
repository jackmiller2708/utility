import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '@app/ui/atoms/icon/icon.component';

@Component({
  selector: 'app-gallery-tile',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './gallery-tile.component.html',
  host: { class: 'block relative bg-paper-fresh border border-paper-deckle rounded-sm overflow-hidden transition duration-shift ease-run hover:border-ink-muted hover:shadow-paper-lift' },
})
export class GalleryTileComponent {
  label = input.required<string>();
  sizeFormatted = input<string>('');
  previewUrl = input<string | null>(null);
  downloadUrl = input<string | null>(null);
  kind = input<'image' | 'video' | 'audio'>('image');
}
