import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // A saved recipe's id is only known at runtime, so it can't be enumerated for
    // prerendering the way every other (static) route in this app can — render it
    // per-request instead.
    path: 'recipes/:id',
    renderMode: RenderMode.Server
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
