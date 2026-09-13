import { Component, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { WorkbenchLayoutComponent, RouteCurtainComponent, EnrollmentGateComponent } from './ui';
import { RuntimeStatusService, DeviceTrustService } from './core';

const TOOL_ROUTES: Record<string, string> = {
  image: '/media/image-resize',
  media: '/media/video-audio',
  pdf: '/document/pdf',
  'pdf-merge-split': '/document/merge-split',
};

/** A saved recipe registers dynamically as `recipe.<id>` and has no entry in `TOOL_ROUTES` — it routes to `/recipes/:id` instead of a hand-built page. */
const RECIPE_TOOL_ID_PREFIX = 'recipe.';

const recipeIdFromToolId = (toolId: string): string | null =>
  toolId.startsWith(RECIPE_TOOL_ID_PREFIX) ? toolId.slice(RECIPE_TOOL_ID_PREFIX.length) : null;

const routeToToolId = (url: string): string | null => {
  const match = Object.entries(TOOL_ROUTES).find(([, route]) => url.startsWith(route));
  if (match) {
    return match[0];
  }

  const recipeMatch = url.match(/^\/recipes\/([^/?#]+)/);
  return recipeMatch && recipeMatch[1] !== 'new' ? `${RECIPE_TOOL_ID_PREFIX}${recipeMatch[1]}` : null;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, WorkbenchLayoutComponent, RouteCurtainComponent, EnrollmentGateComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  readonly runtimeStatus = inject(RuntimeStatusService);
  readonly deviceTrust = inject(DeviceTrustService);

  readonly activeToolId = signal<string>(routeToToolId(this.router.url) ?? 'image');
  readonly onRecentRoute = signal<boolean>(this.router.url.startsWith('/recent'));
  /** True only on the Recipes management surfaces (list, builder) — not on `/recipes/:id`, which behaves like an ordinary tool page and highlights that specific sidebar row via `activeToolId` instead. */
  readonly onRecipesRoute = signal<boolean>(this.router.url === '/recipes' || this.router.url.startsWith('/recipes/new'));
  readonly onDevicesRoute = signal<boolean>(this.router.url.startsWith('/devices'));

  ngOnInit(): void {
    this.runtimeStatus.refreshStatus();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = event.urlAfterRedirects;
        this.onRecentRoute.set(url.startsWith('/recent'));
        this.onRecipesRoute.set(url === '/recipes' || url.startsWith('/recipes/new'));
        this.onDevicesRoute.set(url.startsWith('/devices'));

        const toolId = routeToToolId(url);
        if (toolId) {
          this.activeToolId.set(toolId);
        }
      });
  }

  selectTool(toolId: string): void {
    this.activeToolId.set(toolId);

    const recipeId = recipeIdFromToolId(toolId);
    if (recipeId) {
      this.router.navigate(['/recipes', recipeId]);
      return;
    }

    const route = TOOL_ROUTES[toolId];
    if (route) {
      this.router.navigate([route]);
    }
  }

  selectRecent(): void {
    this.router.navigate(['/recent']);
  }

  selectRecipes(): void {
    this.router.navigate(['/recipes']);
  }

  selectDevices(): void {
    this.router.navigate(['/devices']);
  }
}
