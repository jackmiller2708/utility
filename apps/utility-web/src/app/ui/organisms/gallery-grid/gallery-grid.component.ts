import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { GalleryTileComponent } from '../../molecules/gallery-tile/gallery-tile.component.js';

export interface GalleryItem {
  readonly id: string;
  readonly label: string;
  readonly sizeFormatted: string;
  readonly previewUrl: string | null;
  readonly downloadUrl: string | null;
}

@Component({
  selector: 'app-gallery-grid',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent, GalleryTileComponent],
  templateUrl: './gallery-grid.component.html',
  host: { class: 'block h-full min-w-0' },
})
export class GalleryGridComponent {
  readonly title = input<string>('Results');
  readonly items = input<readonly GalleryItem[]>([]);
  readonly loading = input<boolean>(false);
  readonly elapsedLabel = input<string | null>(null);
  readonly emptyTitle = input<string>('No output yet');
  readonly emptyMessage = input<string>('Run an action on the left to see results here.');
  readonly downloadAllClicked = output<void>();
}
