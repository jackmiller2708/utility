import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MotionService } from '@app/core';

export interface TileItem {
  id: string;
  label: string;
}

@Component({
  selector: 'app-tile-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tile-group.component.html',
  host: { class: 'block min-w-0' },
})
export class TileGroupComponent {
  private readonly motion = inject(MotionService);

  heading = input<string>('');
  tiles = input<readonly TileItem[]>([]);
  activeId = input<string | null>(null);
  /** Which spot ink marks the selected tile — pink for the primary shortcut, blue for a setting. */
  activeInk = input<'pink' | 'blue'>('blue');
  tileSelected = output<string>();

  /** A chosen plate punched into the rail — the same scale-flash as Odometer Tick, reused for any newly-selected tile. */
  selectTile(id: string, event: MouseEvent): void {
    if (id !== this.activeId()) {
      this.motion.tick(event.currentTarget as HTMLElement);
    }
    this.tileSelected.emit(id);
  }
}
