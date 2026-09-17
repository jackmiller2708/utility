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
  readonly label = input.required<string>();
  readonly sizeFormatted = input<string>('');
  readonly previewUrl = input<string | null>(null);
  readonly downloadUrl = input<string | null>(null);
  readonly kind = input<'image' | 'video' | 'audio'>('image');
}
