import { Routes } from '@angular/router';
import { deviceTrustGuard } from './core/guards/device-trust.guard';

export const routes: Routes = [
  {
    // Pathless wrapper so `deviceTrustGuard` runs once, ahead of every leaf
    // route's own `curtainReadyGuard`, without repeating it across modules.
    path: '',
    canActivateChild: [deviceTrustGuard],
    children: [
      {
        path: 'media',
        loadChildren: () => import('./modules/media/media.routes').then((m) => m.MEDIA_ROUTES),
      },
      {
        path: 'document',
        loadChildren: () => import('./modules/document/document.routes').then((m) => m.DOCUMENT_ROUTES),
      },
      {
        path: 'recent',
        loadChildren: () => import('./modules/recent/recent.routes').then((m) => m.RECENT_ROUTES),
      },
      {
        path: 'recipes',
        loadChildren: () => import('./modules/recipes/recipes.routes').then((m) => m.RECIPES_ROUTES),
      },
      {
        path: 'devices',
        loadChildren: () => import('./modules/devices/devices.routes').then((m) => m.DEVICES_ROUTES),
      },
      {
        path: '',
        redirectTo: 'media/image-resize',
        pathMatch: 'full',
      },
      {
        path: '**',
        redirectTo: 'media/image-resize',
      },
    ],
  },
];
