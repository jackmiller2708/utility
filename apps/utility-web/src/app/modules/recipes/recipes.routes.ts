import { Routes } from '@angular/router';
import { curtainReadyGuard } from '../../core/index.js';
import { RecipesListComponent } from './components/recipes-list.component.js';
import { RecipeBuilderComponent } from './components/recipe-builder.component.js';
import { RecipeRunComponent } from './components/recipe-run.component.js';

export const RECIPES_ROUTES: Routes = [
  {
    path: '',
    component: RecipesListComponent,
    canActivate: [curtainReadyGuard],
  },
  {
    path: 'new',
    component: RecipeBuilderComponent,
    canActivate: [curtainReadyGuard],
  },
  {
    path: ':id',
    component: RecipeRunComponent,
    canActivate: [curtainReadyGuard],
  },
];
