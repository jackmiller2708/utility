import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AuthStatusModel } from '../../../domain/index.js';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  host: {
    class: 'flex-none bg-press-elevated border-b border-press-line sticky top-0 z-50',
    role: 'banner',
  },
})
export class HeaderComponent {
  authStatus = input<AuthStatusModel | null>(null);
  activeJobCount = input<number>(0);
  jobTrayToggled = output<void>();
}
