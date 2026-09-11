import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import type { ToolModel } from '../../../domain/index.js';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, BadgeComponent],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  tools = input<readonly ToolModel[]>([]);
  activeToolId = input<string>('image');
  selectedToolId = output<string>();
}
