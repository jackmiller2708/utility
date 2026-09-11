import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';

@Component({
  selector: 'app-error-diagnostic',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './error-diagnostic.component.html',
})
export class ErrorDiagnosticComponent {
  title = input.required<string>();
  message = input.required<string>();
  suggestion = input<string>('');
  retryLabel = input<string>('Retry');
  retryClicked = output<void>();
}
