import type { AuthStatusModel, ToolModel } from '../../../domain/index.js';

import { Component, input, output, inject } from '@angular/core';
import { JobTrackerService } from '../../../core/index.js';
import { JobTrayComponent } from '../../organisms/job-tray/job-tray.component.js';
import { SidebarComponent } from '../../organisms/sidebar/sidebar.component.js';
import { HeaderComponent } from '../../organisms/header/header.component.js';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workbench-layout',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent, JobTrayComponent],
  templateUrl: './workbench-layout.component.html',
  host: { class: 'min-h-screen bg-press text-press-text flex flex-col font-sans' },
})
export class WorkbenchLayoutComponent {
  readonly jobTracker = inject(JobTrackerService);
  readonly authStatus = input<AuthStatusModel | null>(null);
  readonly tools = input<readonly ToolModel[]>([]);
  readonly activeToolId = input<string>('image');
  readonly onRecentRoute = input<boolean>(false);
  readonly onRecipesRoute = input<boolean>(false);
  readonly toolSelected = output<string>();
  readonly recentSelected = output<void>();
  readonly recipesSelected = output<void>();
}
