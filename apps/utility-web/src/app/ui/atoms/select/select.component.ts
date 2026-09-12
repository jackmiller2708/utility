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
  id = input<string>('');
  ariaLabel = input<string>('');
  ariaLabelledby = input<string>('');
  options = input<readonly SelectOption[]>([]);
  value = input<string>('');
  disabled = input<boolean>(false);
  valueChange = output<string>();

  onChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.valueChange.emit(val);
  }
}
