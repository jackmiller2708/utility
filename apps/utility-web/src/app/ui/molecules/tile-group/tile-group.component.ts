import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TileItem {
  id: string;
  label: string;
}

@Component({
  selector: 'app-tile-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tile-group.component.html',
})
export class TileGroupComponent {
  heading = input<string>('');
  tiles = input<readonly TileItem[]>([]);
  activeId = input<string | null>(null);
  /** Which spot ink marks the selected tile — pink for the primary shortcut, blue for a setting. */
  activeInk = input<'pink' | 'blue'>('blue');
  tileSelected = output<string>();
}
