import { Routes } from '@angular/router';
import { DevicesListComponent } from './components/devices-list.component';
import { curtainReadyGuard } from '../../core';

export const DEVICES_ROUTES: Routes = [
  {
    path: '',
    component: DevicesListComponent,
    canActivate: [curtainReadyGuard],
  },
];
