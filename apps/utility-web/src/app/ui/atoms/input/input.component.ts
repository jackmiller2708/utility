import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './input.component.html',
  host: { class: 'block relative w-full' },
})
export class InputComponent {
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly ariaLabelledby = input<string>('');
  readonly type = input<string>('text');
  readonly value = input<any>(null);
  readonly placeholder = input<string>('');
  readonly unitSuffix = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly required = input<boolean>(false);
  readonly mono = input<boolean>(true);
  readonly valueChange = output<any>();

  onInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;

    if (this.type() === 'number') {
      this.valueChange.emit(val === '' ? null : Number(val));
    } else {
      this.valueChange.emit(val);
    }
  }
}
