import { Routes } from '@angular/router';
import { curtainReadyGuard } from '../../core';
import { RecipesListComponent } from './components/recipes-list.component';
import { RecipeBuilderComponent } from './components/recipe-builder.component';
import { RecipeRunComponent } from './components/recipe-run.component';

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
