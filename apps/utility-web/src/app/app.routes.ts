import { Routes } from '@angular/router';

export const routes: Routes = [
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
    path: '',
    redirectTo: 'media/image-resize',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'media/image-resize',
  },
];
