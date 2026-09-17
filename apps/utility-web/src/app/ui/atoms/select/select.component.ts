import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './select.component.html',
  host: { class: 'block relative min-w-0 w-full' },
})
export class SelectComponent {
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly ariaLabelledby = input<string>('');
  readonly options = input<readonly SelectOption[]>([]);
  readonly value = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly valueChange = output<string>();

  onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
