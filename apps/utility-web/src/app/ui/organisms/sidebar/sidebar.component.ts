import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import type { ToolModel } from '../../../domain/index.js';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  tools = input<readonly ToolModel[]>([]);
  activeOperationId = input<string>('image.resize');
  selectedOperationId = output<string>();
}
