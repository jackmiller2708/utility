import { Component, inject, effect, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, NavigationCancel, NavigationError, NavigationSkipped } from '@angular/router';
import { filter } from 'rxjs';
import { RouteCurtainService } from '../../../core/index.js';

/**
 * The press room's own light going down between plates. Covers the whole
 * viewport while a tool switch (or the very first boot) is in flight. The
 * `curtainReadyGuard` on each tool's leaf route is what actually shows it —
 * this component only owns the DOM element (registered with the service the
 * guard drives) and triggers the reveal once a navigation settles.
 *
 * Starts fully opaque in the template itself (a plain inline style, so the
 * SSR-rendered HTML already ships this way) — the very first paint a browser
 * makes, before any JS runs, is this calm curtain, not the raw interface.
 */
@Component({
  selector: 'app-route-curtain',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './route-curtain.component.html',
  host: { class: 'contents' },
})
export class RouteCurtainComponent {
  private readonly router = inject(Router);
  readonly curtainService = inject(RouteCurtainService);

  private readonly curtain = viewChild.required<ElementRef<HTMLElement>>('curtain');

  readonly blocking = this.curtainService.blocking;

  constructor() {
    // Root-level and static in App's template, so this view — and this registration —
    // is ready before the router's very first navigation (guards included) can run:
    // routing requires <router-outlet> to exist, and that outlet is a sibling of this
    // component under the same root, created in the same initial change-detection pass.
    effect(() => this.curtainService.registerElement(this.curtain().nativeElement));

    this.router.events
      .pipe(filter((event) =>
        event instanceof NavigationEnd
        || event instanceof NavigationCancel
        || event instanceof NavigationError
        || event instanceof NavigationSkipped
      ))
      .subscribe(() => void this.curtainService.reveal());
  }
}
