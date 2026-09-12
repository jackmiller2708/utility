import type { AuthStatusModel } from '../../../domain/index.js';

import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  readonly authStatus = input<AuthStatusModel | null>(null);
  readonly activeJobCount = input<number>(0);
  readonly jobTrayToggled = output<void>();
}
