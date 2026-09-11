import { Routes } from '@angular/router';
import { VideoAudioComponent } from './components/video-audio.component.js';
import { curtainReadyGuard } from '../../../core/index.js';

export const VIDEO_AUDIO_ROUTES: Routes = [
  {
    path: '',
    component: VideoAudioComponent,
    canActivate: [curtainReadyGuard],
  },
];
