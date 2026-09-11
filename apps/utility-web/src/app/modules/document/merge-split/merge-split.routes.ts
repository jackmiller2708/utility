import { Routes } from '@angular/router';
import { MergeSplitComponent } from './components/merge-split.component.js';
import { curtainReadyGuard } from '../../../core/index.js';

export const MERGE_SPLIT_ROUTES: Routes = [
  {
    path: '',
    component: MergeSplitComponent,
    canActivate: [curtainReadyGuard],
  },
];
