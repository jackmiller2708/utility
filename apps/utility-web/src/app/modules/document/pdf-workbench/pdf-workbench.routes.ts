import { Routes } from '@angular/router';
import { PdfWorkbenchComponent } from './components/pdf-workbench.component';
import { curtainReadyGuard } from '@app/core';

export const PDF_WORKBENCH_ROUTES: Routes = [
  {
    path: '',
    component: PdfWorkbenchComponent,
    canActivate: [curtainReadyGuard],
  },
];
