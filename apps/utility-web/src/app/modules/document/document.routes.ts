import { Routes } from '@angular/router';

export const DOCUMENT_ROUTES: Routes = [
  {
    path: 'pdf',
    loadChildren: () => import('./pdf-workbench/pdf-workbench.routes').then((m) => m.PDF_WORKBENCH_ROUTES),
  },
  {
    path: 'merge-split',
    loadChildren: () => import('./merge-split/merge-split.routes').then((m) => m.MERGE_SPLIT_ROUTES),
  },
  {
    path: '',
    redirectTo: 'pdf',
    pathMatch: 'full',
  },
];
