import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '@app/ui/atoms/icon/icon.component';

@Component({
  selector: 'app-error-diagnostic',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './error-diagnostic.component.html',
  host: { class: 'flex flex-col gap-2 min-w-0 p-4 bg-riso-red/10 border border-riso-red rounded-sm' },
})
export class ErrorDiagnosticComponent {
  title = input.required<string>();
  message = input.required<string>();
  suggestion = input<string>('');
  retryLabel = input<string>('Retry');
  retryClicked = output<void>();
}
