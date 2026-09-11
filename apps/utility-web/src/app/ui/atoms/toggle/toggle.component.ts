import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toggle.component.html',
})
export class ToggleComponent {
  checked = input<boolean>(false);
  label = input<string>('');
  description = input<string>('');
  disabled = input<boolean>(false);
  checkedChange = output<boolean>();

  onChange(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.checkedChange.emit(isChecked);
  }
}
