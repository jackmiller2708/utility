import type { ToolModel } from '@app/domain';

import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '@app/ui/atoms/icon/icon.component';

export interface ToolCategoryGroup {
  readonly category: string;
  readonly tools: readonly ToolModel[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './sidebar.component.html',
  host: {
    class: 'block flex-none w-full lg:w-[240px] bg-press border-b lg:border-b-0 lg:border-r border-press-line space-y-6',
    role: 'navigation',
  },
})
export class SidebarComponent {
  readonly tools = input<readonly ToolModel[]>([]);
  readonly activeToolId = input<string>('image');
  /** True on the /recent route — no tool is the active one there. */
  readonly onRecentRoute = input<boolean>(false);
  /** True on the Recipes management routes (list, builder) — no tool is the active one there either. */
  readonly onRecipesRoute = input<boolean>(false);
  /** True on the Devices route — no tool is the active one there either. */
  readonly onDevicesRoute = input<boolean>(false);
  readonly selectedToolId = output<string>();
  readonly recentSelected = output<void>();
  readonly recipesSelected = output<void>();
  readonly devicesSelected = output<void>();

  /** Grouped in first-seen order, matching the order the backend registers tools in — never re-sorted, so a category's position stays stable as tools inside it change. */
  readonly groups = computed<readonly ToolCategoryGroup[]>(() => {
    const byCategory = new Map<string, ToolModel[]>();

    for (const tool of this.tools()) {
      const existing = byCategory.get(tool.category);
      if (existing) {
        existing.push(tool);
      } else {
        byCategory.set(tool.category, [tool]);
      }
    }

    return Array.from(byCategory.entries()).map(([category, tools]) => ({ category, tools }));
  });

  /** A tool with more than one operation reveals them on hover, e.g. "Inspect · Render · Extract" — so a user can tell PDF Documents does three things before ever clicking in. */
  operationsLabel(tool: ToolModel): string {
    return tool.operations.map((op) => op.name).join(' · ');
  }
}
