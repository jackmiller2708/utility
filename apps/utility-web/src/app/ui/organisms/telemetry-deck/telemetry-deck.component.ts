import type { ArtifactModel } from '@app/domain';
import type { ComparisonSource, SizeDelta } from '../../../modules/media/image-resize/services/image-resize.service.js';

import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { TelemetryRowComponent } from '../../molecules/telemetry-row/telemetry-row.component.js';

interface LedgerRow {
  key: string;
  src: string;
  out: string;
  filled: boolean;
  tone: 'neutral' | 'mint' | 'gold';
}

@Component({
  selector: 'app-telemetry-deck',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent, TelemetryRowComponent],
  templateUrl: './telemetry-deck.component.html',
  host: { class: 'block h-full min-w-0' },
})
export class TelemetryDeckComponent {
  readonly artifact = input<ArtifactModel | null>(null);
  readonly previewUrl = input<string | null>(null);
  readonly downloadUrl = input<string | null>(null);
  readonly loading = input<boolean>(false);
  readonly source = input<ComparisonSource | null>(null);
  readonly targetDimensionsLabel = input<string>('—');
  readonly outputFormatLabel = input<string>('—');
  readonly sizeDelta = input<SizeDelta | null>(null);
  readonly downloadClicked = output<void>();

  formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  get ledgerRows(): LedgerRow[] {
    const src = this.source();
    const art = this.artifact();
    const delta = this.sizeDelta();

    const rows: LedgerRow[] = [
      {
        key: 'FORMAT',
        src: src?.formatLabel ?? '—',
        out: art ? this.outputFormatLabel() : '—',
        filled: !!art,
        tone: 'neutral',
      },
      {
        key: 'DIMENSIONS',
        src: src?.dimensions ?? '—',
        out: art ? this.targetDimensionsLabel() : '—',
        filled: !!art,
        tone: 'neutral',
      },
      {
        key: 'FILE SIZE',
        src: src?.sizeFormatted ?? '—',
        out: art ? this.formatBytes(art.size) : '—',
        filled: !!art,
        tone: 'neutral',
      },
      {
        key: 'SIZE DELTA',
        src: 'original',
        out: delta ? (delta.grew ? '+' : '-') + delta.percent + '%' : '—',
        filled: !!delta,
        tone: delta ? (delta.grew ? 'gold' : 'mint') : 'neutral',
      },
    ];

    if (art?.checksum) {
      rows.push({
        key: 'CHECKSUM',
        src: 'export',
        out: art.checksum.slice(0, 24) + '…',
        filled: true,
        tone: 'neutral',
      });
    }

    return rows;
  }
}
