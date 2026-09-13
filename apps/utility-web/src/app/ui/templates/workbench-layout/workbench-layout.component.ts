import type { AuthStatusModel, ToolModel } from '@app/domain';

import { Component, input, output, inject } from '@angular/core';
import { JobTrackerService } from '@app/core';
import { JobTrayComponent } from '@app/ui/organisms/job-tray/job-tray.component';
import { SidebarComponent } from '@app/ui/organisms/sidebar/sidebar.component';
import { HeaderComponent } from '@app/ui/organisms/header/header.component';
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
  readonly onDevicesRoute = input<boolean>(false);
  readonly toolSelected = output<string>();
  readonly recentSelected = output<void>();
  readonly recipesSelected = output<void>();
  readonly devicesSelected = output<void>();
}
