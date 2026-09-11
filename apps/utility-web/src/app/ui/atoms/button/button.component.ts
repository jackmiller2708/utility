import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html',
  host: { class: 'inline-flex max-w-full' },
})
export class ButtonComponent {
  variant = input<'primary' | 'secondary' | 'ghost' | 'success'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  type = input<'button' | 'submit'>('button');
  clicked = output<MouseEvent>();
}
