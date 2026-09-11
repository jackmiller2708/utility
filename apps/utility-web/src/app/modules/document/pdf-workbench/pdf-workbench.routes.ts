import { Routes } from '@angular/router';
import { PdfWorkbenchComponent } from './components/pdf-workbench.component.js';
import { curtainReadyGuard } from '../../../core/index.js';

export const PDF_WORKBENCH_ROUTES: Routes = [
  {
    path: '',
    component: PdfWorkbenchComponent,
    canActivate: [curtainReadyGuard],
  },
];
