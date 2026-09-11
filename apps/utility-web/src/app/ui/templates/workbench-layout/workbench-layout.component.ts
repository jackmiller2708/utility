import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../organisms/header/header.component.js';
import { SidebarComponent } from '../../organisms/sidebar/sidebar.component.js';
import type { AuthStatusModel, ToolModel } from '../../../domain/index.js';

@Component({
  selector: 'app-workbench-layout',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent],
  templateUrl: './workbench-layout.component.html',
})
export class WorkbenchLayoutComponent {
  authStatus = input<AuthStatusModel | null>(null);
  tools = input<readonly ToolModel[]>([]);
  activeToolId = input<string>('image');
  toolSelected = output<string>();
}
