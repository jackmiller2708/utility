import type { AuthStatusModel, ToolModel } from '@app/domain';

import { Component, input, output, inject, computed } from '@angular/core';
import { JobTrackerService } from '@app/core';
import { JobTrayComponent } from '@app/ui/organisms/job-tray/job-tray.component';
import { SidebarComponent } from '@app/ui/organisms/sidebar/sidebar.component';
import { HeaderComponent } from '@app/ui/organisms/header/header.component';
import { InkAtmosphereComponent } from '@app/ui/organisms/ink-atmosphere/ink-atmosphere.component';
import { LightroomComponent } from '@app/ui/organisms/lightroom/lightroom.component';
import { LightroomService } from '@app/ui/organisms/lightroom/lightroom.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workbench-layout',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent, JobTrayComponent, InkAtmosphereComponent, LightroomComponent],
  templateUrl: './workbench-layout.component.html',
  host: { class: 'min-h-screen bg-press text-press-text flex flex-col font-sans relative overflow-hidden' },
})
export class WorkbenchLayoutComponent {
  readonly jobTracker = inject(JobTrackerService);
  readonly lightroom = inject(LightroomService);
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

  /** Mirrors the sidebar's own active-section logic so the masthead names whatever the visitor is actually looking at, instead of a fixed "IMAGES". */
  readonly sectionLabel = computed(() => {
    if (this.onRecipesRoute()) return 'RECIPES';
    if (this.onRecentRoute()) return 'RECENT';
    if (this.onDevicesRoute()) return 'DEVICES';

    return this.tools().find((tool) => tool.id === this.activeToolId())?.category.toUpperCase() ?? '';
  });
}
