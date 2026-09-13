import { Routes } from '@angular/router';
import { ImageResizeComponent } from './components/image-resize.component';
import { curtainReadyGuard } from '@app/core';

export const IMAGE_RESIZE_ROUTES: Routes = [
  {
    path: '',
    component: ImageResizeComponent,
    canActivate: [curtainReadyGuard],
  },
];
