import { Injectable, computed, signal } from '@angular/core';
import type { LightroomSide } from './lightroom.component';

export interface LightroomRequest {
  readonly initialSide: LightroomSide;
  readonly originalUrl: string | null;
  readonly exportUrl: string | null;
  readonly originalCaption: string;
  readonly exportCaption: string;
  readonly label: string;
}

/**
 * Holds whichever preview is currently open, so `WorkbenchLayoutComponent` can mount
 * `LightroomComponent` once at the shell root — a sibling of `app-header`/`footer`,
 * never nested under the routed content's own `relative z-10` stacking context, which
 * traps a `position: fixed` descendant behind them regardless of its own z-index.
 * Mirrors `JobTrackerService`: state owned by a root-provided service, read by whatever
 * feature page needs to open it, rendered by the shell.
 *
 * `open()` takes a closure rather than a plain value so the shell keeps reading the
 * caller's own signals live — e.g. an export finishing while its preview is already
 * open still updates the image shown.
 */
@Injectable({ providedIn: 'root' })
export class LightroomService {
  private readonly _requestFn = signal<(() => LightroomRequest) | null>(null);
  private readonly _leaving = signal(false);

  readonly request = computed(() => this._requestFn()?.() ?? null);
  readonly leaving = this._leaving.asReadonly();

  open(requestFn: () => LightroomRequest): void {
    this._requestFn.set(requestFn);
    this._leaving.set(false);
  }

  close(): void {
    this._leaving.set(true);
  }

  onLeftView(): void {
    this._requestFn.set(null);
    this._leaving.set(false);
  }
}
