import { Routes } from '@angular/router';
import { DevicesListComponent } from './components/devices-list.component.js';
import { curtainReadyGuard } from '../../core/index.js';

export const DEVICES_ROUTES: Routes = [
  {
    path: '',
    component: DevicesListComponent,
    canActivate: [curtainReadyGuard],
  },
];
