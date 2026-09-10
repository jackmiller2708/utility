import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import type { AuthStatusModel } from '../../../domain/index.js';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  authStatus = input<AuthStatusModel | null>(null);
}
