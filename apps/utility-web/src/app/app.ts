import { Component, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { WorkbenchLayoutComponent, RouteCurtainComponent } from './ui/index.js';
import { RuntimeStatusService } from './core/index.js';

const TOOL_ROUTES: Record<string, string> = {
  image: '/media/image-resize',
  media: '/media/video-audio',
  pdf: '/document/pdf',
  'pdf-merge-split': '/document/merge-split',
};

const routeToToolId = (url: string): string | null => {
  const match = Object.entries(TOOL_ROUTES).find(([, route]) => url.startsWith(route));
  return match ? match[0] : null;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, WorkbenchLayoutComponent, RouteCurtainComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  readonly runtimeStatus = inject(RuntimeStatusService);

  readonly activeToolId = signal<string>(routeToToolId(this.router.url) ?? 'image');
  readonly onRecentRoute = signal<boolean>(this.router.url.startsWith('/recent'));

  ngOnInit(): void {
    this.runtimeStatus.refreshStatus();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.onRecentRoute.set(event.urlAfterRedirects.startsWith('/recent'));

        const toolId = routeToToolId(event.urlAfterRedirects);
        if (toolId) {
          this.activeToolId.set(toolId);
        }
      });
  }

  selectTool(toolId: string): void {
    this.activeToolId.set(toolId);

    const route = TOOL_ROUTES[toolId];
    if (route) {
      this.router.navigate([route]);
    }
  }

  selectRecent(): void {
    this.router.navigate(['/recent']);
  }
}
