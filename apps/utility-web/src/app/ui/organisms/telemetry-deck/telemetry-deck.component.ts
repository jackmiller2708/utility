import type { ArtifactModel } from '@app/domain';

import { Component, input, output } from '@angular/core';
import { TelemetryRowComponent } from '../../molecules/telemetry-row/telemetry-row.component';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component';
import { IconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'app-telemetry-deck',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent, TelemetryRowComponent],
  templateUrl: './telemetry-deck.component.html',
})
export class TelemetryDeckComponent {
  readonly artifact = input<ArtifactModel | null>(null);
  readonly previewUrl = input<string | null>(null);
  readonly savingsPercentage = input<number | null>(null);
  readonly downloadUrl = input<string | null>(null);
  readonly loading = input<boolean>(false);
  readonly downloadClicked = output<void>();

  formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 B'
    };
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
