import { Routes } from '@angular/router';

export const MEDIA_ROUTES: Routes = [
  {
    path: 'image-resize',
    loadChildren: () => import('./image-resize/image-resize.routes').then((m) => m.IMAGE_RESIZE_ROUTES),
  },
  {
    path: 'video-audio',
    loadChildren: () => import('./video-audio/video-audio.routes').then((m) => m.VIDEO_AUDIO_ROUTES),
  },
  {
    path: '',
    redirectTo: 'image-resize',
    pathMatch: 'full',
  },
];
