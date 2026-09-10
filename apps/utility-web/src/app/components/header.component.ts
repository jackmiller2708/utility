import { Component, input } from '@angular/core';
import type { AuthStatusResponse } from '@utility/protocol';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <header class="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white font-bold text-lg">
            ⚡
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-bold text-zinc-100 tracking-tight text-lg">Utility Platform</span>
              <span class="text-xs font-mono uppercase bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 px-2 py-0.5 rounded">M0</span>
            </div>
            <p class="text-xs text-zinc-400">Local-first capability runtime</p>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          @if (authStatus(); as auth) {
            <div class="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span class="text-zinc-300 font-medium">
                {{ auth.isLocal ? 'Localhost Runtime (Active)' : 'Authenticated Device' }}
              </span>
            </div>
          } @else {
            <div class="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
              <span class="h-2 w-2 rounded-full bg-amber-500"></span>
              <span>Connecting to runtime...</span>
            </div>
          }
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  authStatus = input<AuthStatusResponse | null>(null);
}
