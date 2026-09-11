import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-telemetry-row',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './telemetry-row.component.html',
})
export class TelemetryRowComponent {
  label = input<string>('');
  srcValue = input<string>('');
  outValue = input<string>('');
  filled = input<boolean>(false);
  tone = input<'neutral' | 'mint' | 'gold'>('neutral');
}
