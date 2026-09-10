import { Component, input, output } from '@angular/core';
import type { ToolInfo } from '@utility/protocol';

@Component({
  selector: 'app-tool-sidebar',
  standalone: true,
  template: `
    <div class="space-y-4">
      <div class="px-3 py-2">
        <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Available Tools
        </h3>
      </div>

      <div class="space-y-1">
        @for (tool of tools(); track tool.id) {
          <div class="space-y-1">
            <div class="px-3 py-1.5 text-xs font-medium text-zinc-400 flex items-center justify-between">
              <span>{{ tool.name }}</span>
              <span class="text-[10px] text-zinc-600 uppercase">{{ tool.category }}</span>
            </div>

            @for (op of tool.operations; track op.id) {
              <button
                type="button"
                (click)="selectedOperationId.emit(op.id)"
                [class.bg-indigo-600]="activeOperationId() === op.id"
                [class.text-white]="activeOperationId() === op.id"
                [class.text-zinc-300]="activeOperationId() !== op.id"
                [class.hover:bg-zinc-900]="activeOperationId() !== op.id"
                class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between group"
              >
                <div class="flex items-center space-x-2.5 truncate">
                  <span class="w-1.5 h-1.5 rounded-full" [class.bg-indigo-400]="activeOperationId() === op.id" [class.bg-zinc-600]="activeOperationId() !== op.id"></span>
                  <span class="truncate">{{ op.name }}</span>
                </div>
                <span
                  class="text-[10px] font-mono px-1.5 py-0.5 rounded opacity-75"
                  [class.bg-indigo-700]="activeOperationId() === op.id"
                  [class.bg-zinc-800]="activeOperationId() !== op.id"
                >
                  {{ op.id }}
                </span>
              </button>
            }
          </div>
        }
      </div>

      <!-- Roadmap preview for future tools -->
      <div class="pt-6 border-t border-zinc-800/80 px-3">
        <h4 class="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Roadmap Preview
        </h4>
        <div class="space-y-2 text-xs text-zinc-500">
          <div class="flex items-center justify-between py-1">
            <span>PDF Tools (Poppler)</span>
            <span class="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">M2</span>
          </div>
          <div class="flex items-center justify-between py-1">
            <span>Job Engine (Async)</span>
            <span class="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">M3</span>
          </div>
          <div class="flex items-center justify-between py-1">
            <span>Media (FFmpeg)</span>
            <span class="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">M5</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ToolSidebarComponent {
  tools = input<readonly ToolInfo[]>([]);
  activeOperationId = input<string>('image.resize');
  selectedOperationId = output<string>();
}
