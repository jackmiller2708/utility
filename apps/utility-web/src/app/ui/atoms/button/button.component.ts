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
  readonly variant = input<'primary' | 'secondary' | 'ghost' | 'success'>('primary');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly type = input<'button' | 'submit'>('button');
  readonly clicked = output<MouseEvent>();
}
