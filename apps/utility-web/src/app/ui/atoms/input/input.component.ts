import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './input.component.html',
})
export class InputComponent {
  id = input<string>('');
  ariaLabel = input<string>('');
  ariaLabelledby = input<string>('');
  type = input<string>('text');
  value = input<any>(null);
  placeholder = input<string>('');
  unitSuffix = input<string>('');
  disabled = input<boolean>(false);
  mono = input<boolean>(true);
  valueChange = output<any>();

  onInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.type() === 'number') {
      this.valueChange.emit(val === '' ? null : Number(val));
    } else {
      this.valueChange.emit(val);
    }
  }
}
