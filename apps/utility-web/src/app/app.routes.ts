import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'media',
    loadChildren: () => import('./modules/media/media.routes').then((m) => m.MEDIA_ROUTES),
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
