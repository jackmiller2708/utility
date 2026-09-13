import { Routes } from '@angular/router';
import { VideoAudioComponent } from './components/video-audio.component';
import { curtainReadyGuard } from '@app/core';

export const VIDEO_AUDIO_ROUTES: Routes = [
  {
    path: '',
    component: VideoAudioComponent,
    canActivate: [curtainReadyGuard],
  },
];
