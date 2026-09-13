import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonComponent, InputComponent, TileGroupComponent, TileItem, OperationFormComponent, IconComponent } from '@app/ui';
import { RecipesService } from '../services/recipes.service';
import { WorkflowModelFromWorkflowResponse } from '@app/domain';
import type { ToolParameterModel } from '@app/domain';
import { Either } from 'effect';

interface BuilderStep {
  readonly localId: string;
  operationId: string | null;
  params: Readonly<Record<string, unknown>>;
}

let builderStepIdCounter = 0;
const nextBuilderStepId = () => `builder_step_${++builderStepIdCounter}`;

@Component({
  selector: 'app-recipe-builder-page',
  standalone: true,
  imports: [CommonModule, ButtonComponent, InputComponent, TileGroupComponent, OperationFormComponent, IconComponent],
  templateUrl: './recipe-builder.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full max-w-3xl' },
})
export class RecipeBuilderComponent {
  private readonly recipes = inject(RecipesService);
  private readonly router = inject(Router);

  readonly name = signal('');
  readonly description = signal('');
  readonly steps = signal<readonly BuilderStep[]>([{ localId: nextBuilderStepId(), operationId: null, params: {} }]);
  readonly expandedLocalId = signal<string>(this.steps()[0].localId);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly operationTiles = computed<readonly TileItem[]>(() =>
    this.recipes.eligibleOperations().map((op) => ({ id: op.id, label: op.name.toUpperCase() }))
  );

  readonly canAddStep = computed(() => {
    const list = this.steps();
    return list.length > 0 && !!list[list.length - 1].operationId;
  });

  readonly canSave = computed(() =>
    this.name().trim().length > 0 &&
    this.steps().length > 0 &&
    this.steps().every((step) => !!step.operationId)
  );

  setName(value: string): void {
    this.name.set(value);
  }

  setDescription(value: string): void {
    this.description.set(value);
  }

  operationName(operationId: string | null): string {
    if (!operationId) {
      return '';
    }
    return this.recipes.eligibleOperations().find((op) => op.id === operationId)?.name ?? operationId;
  }

  parametersFor(operationId: string | null): readonly ToolParameterModel[] {
    if (!operationId) {
      return [];
    }
    return this.recipes.eligibleOperations().find((op) => op.id === operationId)?.parameters ?? [];
  }

  isExpanded(step: BuilderStep): boolean {
    return this.expandedLocalId() === step.localId;
  }

  expand(localId: string): void {
    this.expandedLocalId.set(localId);
  }

  /** Switching a step's operation forgets any values left over from the previous one — the same "no stray leftover field" rule VideoAudio's batch-operation switch already follows. */
  selectOperation(localId: string, operationId: string): void {
    this.steps.update((list) => list.map((step) => (step.localId === localId ? { ...step, operationId, params: {} } : step)));
  }

  setStepValues(localId: string, values: Readonly<Record<string, unknown>>): void {
    this.steps.update((list) => list.map((step) => (step.localId === localId ? { ...step, params: values } : step)));
  }

  addStep(): void {
    if (!this.canAddStep()) {
      return;
    }
    const newStep: BuilderStep = { localId: nextBuilderStepId(), operationId: null, params: {} };
    this.steps.update((list) => [...list, newStep]);
    this.expandedLocalId.set(newStep.localId);
  }

  removeStep(localId: string): void {
    const list = this.steps();
    if (list.length <= 1) {
      return;
    }

    const removedIndex = list.findIndex((step) => step.localId === localId);
    const next = list.filter((step) => step.localId !== localId);
    this.steps.set(next);

    if (this.expandedLocalId() === localId) {
      const fallbackIndex = Math.max(0, removedIndex - 1);
      this.expandedLocalId.set(next[fallbackIndex]?.localId ?? next[0].localId);
    }
  }

  save(): void {
    if (!this.canSave() || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.recipes.create$({
      name: this.name().trim(),
      description: this.description().trim() || undefined,
      steps: this.steps().map((step) => ({ operationId: step.operationId!, params: step.params })),
    }).subscribe(Either.match({
      onRight: (res) => {
        const workflow = WorkflowModelFromWorkflowResponse.from(res);
        this.recipes.onCreated(workflow);
        this.router.navigate(['/recipes', workflow.id]);
      },
      onLeft: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err.message || 'Could not save this recipe');
      },
    }));
  }
}
