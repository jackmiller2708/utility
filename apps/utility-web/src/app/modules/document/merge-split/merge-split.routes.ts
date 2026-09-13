import { Routes } from '@angular/router';
import { MergeSplitComponent } from './components/merge-split.component';
import { curtainReadyGuard } from '@app/core';

export const MERGE_SPLIT_ROUTES: Routes = [
  {
    path: '',
    component: MergeSplitComponent,
    canActivate: [curtainReadyGuard],
  },
];
