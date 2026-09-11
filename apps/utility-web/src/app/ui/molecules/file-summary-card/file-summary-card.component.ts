import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../../atoms/button/button.component.js';

@Component({
  selector: 'app-file-summary-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './file-summary-card.component.html',
})
export class FileSummaryCardComponent {
  name = input<string>('');
  dimensions = input<string>('');
  sizeFormatted = input<string>('');
  previewUrl = input<string | null>(null);
  changeFile = output<void>();

  confirmingRemoval = signal(false);

  requestRemoval(): void {
    this.confirmingRemoval.set(true);
  }

  cancelRemoval(): void {
    this.confirmingRemoval.set(false);
  }

  confirmRemoval(): void {
    this.confirmingRemoval.set(false);
    this.changeFile.emit();
  }
}
