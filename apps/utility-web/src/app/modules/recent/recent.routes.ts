import { Routes } from '@angular/router';
import { RecentArtifactsComponent } from './components/recent-artifacts.component.js';
import { curtainReadyGuard } from '../../core/index.js';

export const RECENT_ROUTES: Routes = [
  {
    path: '',
    component: RecentArtifactsComponent,
    canActivate: [curtainReadyGuard],
  },
];
