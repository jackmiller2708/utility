import { Routes } from '@angular/router';
import { VideoDownloadComponent } from './components/video-download.component';
import { curtainReadyGuard } from '@app/core';

export const VIDEO_DOWNLOAD_ROUTES: Routes = [
  {
    path: '',
    component: VideoDownloadComponent,
    canActivate: [curtainReadyGuard],
  },
];
