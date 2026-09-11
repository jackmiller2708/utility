import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../organisms/header/header.component.js';
import { SidebarComponent } from '../../organisms/sidebar/sidebar.component.js';
import { JobTrayComponent } from '../../organisms/job-tray/job-tray.component.js';
import { JobTrackerService } from '../../../core/index.js';
import type { AuthStatusModel, ToolModel } from '../../../domain/index.js';

@Component({
  selector: 'app-workbench-layout',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent, JobTrayComponent],
  templateUrl: './workbench-layout.component.html',
})
export class WorkbenchLayoutComponent {
  readonly jobTracker = inject(JobTrackerService);

  authStatus = input<AuthStatusModel | null>(null);
  tools = input<readonly ToolModel[]>([]);
  activeToolId = input<string>('image');
  onRecentRoute = input<boolean>(false);
  toolSelected = output<string>();
  recentSelected = output<void>();
}
