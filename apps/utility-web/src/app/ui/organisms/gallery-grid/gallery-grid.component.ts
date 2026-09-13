import type { JobModel } from '@app/domain';

import { Component, input, output, effect, inject, ElementRef } from '@angular/core';
import { GalleryTileComponent } from '@app/ui/molecules/gallery-tile/gallery-tile.component';
import { BadgeComponent } from '@app/ui/atoms/badge/badge.component';
import { IconComponent } from '@app/ui/atoms/icon/icon.component';
import { MotionService } from '@app/core';
import { CommonModule } from '@angular/common';

export interface GalleryItem {
  readonly id: string;
  readonly label: string;
  readonly sizeFormatted: string;
  readonly previewUrl: string | null;
  readonly downloadUrl: string | null;
  /** How the tile plays its preview — a still image (default), a video with native controls, or an audio track with no visual frame to show. */
  readonly kind?: 'image' | 'video' | 'audio';
}

@Component({
  selector: 'app-gallery-grid',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent, GalleryTileComponent],
  templateUrl: './gallery-grid.component.html',
  host: { class: 'flex flex-col h-full min-w-0 bg-paper border border-paper-deckle rounded-lg shadow-paper-lift min-h-[420px]' },
})
export class GalleryGridComponent {
  readonly title = input<string>('Results');
  readonly items = input<readonly GalleryItem[]>([]);
  readonly loading = input<boolean>(false);
  /** When set, the loading state shows this job's real completed/total ledger and a cancel control; while submission is still in flight (job not yet registered), it falls back to a generic "Working…" message. */
  readonly job = input<JobModel | null>(null);
  readonly emptyTitle = input<string>('No output yet');
  readonly emptyMessage = input<string>('Run an action on the left to see results here.');
  readonly downloadAllClicked = output<void>();
  readonly cancelJob = output<void>();

  private readonly motion = inject(MotionService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private _seenFirstRender = false;
  private _previousCount = 0;

  constructor() {
    /** Pulled Sheet — the same focal completion moment as a job ticket, reused here rather than a second invented entrance, since results appearing IS a job completing. */
    effect(() => {
      const count = this.items().length;

      if (!this._seenFirstRender) {
        this._seenFirstRender = true;
        this._previousCount = count;
        return;
      }

      if (count > 0 && this._previousCount === 0) {
        this.motion.pulledSheet(this.hostRef.nativeElement);
      }

      this._previousCount = count;
    });
  }
}
