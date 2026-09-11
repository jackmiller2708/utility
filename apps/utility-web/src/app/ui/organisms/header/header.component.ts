import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AuthStatusModel } from '../../../domain/index.js';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  authStatus = input<AuthStatusModel | null>(null);
}
