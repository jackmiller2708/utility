import { Routes } from '@angular/router';

export const MEDIA_ROUTES: Routes = [
  {
    path: 'image-resize',
    loadChildren: () => import('./image-resize/image-resize.routes').then((m) => m.IMAGE_RESIZE_ROUTES),
  },
  {
    path: '',
    redirectTo: 'image-resize',
    pathMatch: 'full',
  },
];
