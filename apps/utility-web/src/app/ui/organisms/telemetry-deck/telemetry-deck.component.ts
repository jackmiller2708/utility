import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { TelemetryRowComponent } from '../../molecules/telemetry-row/telemetry-row.component.js';
import type { ArtifactModel } from '../../../domain/index.js';

@Component({
  selector: 'app-telemetry-deck',
  standalone: true,
  imports: [
    CommonModule,
    BadgeComponent,
    IconComponent,
    TelemetryRowComponent,
  ],
  templateUrl: './telemetry-deck.component.html',
})
export class TelemetryDeckComponent {
  artifact = input<ArtifactModel | null>(null);
  previewUrl = input<string | null>(null);
  savingsPercentage = input<number | null>(null);
  downloadUrl = input<string>('');
  loading = input<boolean>(false);
  downloadClicked = output<void>();

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
