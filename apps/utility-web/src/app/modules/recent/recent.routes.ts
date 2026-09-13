import { Routes } from '@angular/router';
import { RecentArtifactsComponent } from './components/recent-artifacts.component';
import { curtainReadyGuard } from '../../core';

export const RECENT_ROUTES: Routes = [
  {
    path: '',
    component: RecentArtifactsComponent,
    canActivate: [curtainReadyGuard],
  },
];
