import { Routes } from '@angular/router';
import { ImageResizeComponent } from './components/image-resize.component.js';
import { curtainReadyGuard } from '../../../core/index.js';

export const IMAGE_RESIZE_ROUTES: Routes = [
  {
    path: '',
    component: ImageResizeComponent,
    canActivate: [curtainReadyGuard],
  },
];
