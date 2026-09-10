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
  value = input<string>('');
  variant = input<'default' | 'cyan' | 'emerald' | 'subtle'>('default');
  copyable = input<boolean>(false);
}
