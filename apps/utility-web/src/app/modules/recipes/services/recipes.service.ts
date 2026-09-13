import type { ToolOperationModel } from '@app/domain';
import type { CreateWorkflowInput } from '@app/core/services/api-client.service';

import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClientService } from '@app/core/services/api-client.service';
import { RuntimeStatusService } from '@app/core';
import { WorkflowModel, WorkflowModelFromWorkflowResponse, WorkflowModelsFromWorkflowListResponse } from '@app/domain';
import { Either } from 'effect';

/**
 * The four operations the backend's `WorkflowRegistry` currently accepts as a recipe step —
 * each takes exactly one file and emits exactly one artifact, the contract a chained step
 * requires (`packages/toolkit/src/workflow.ts`'s `producesArtifact`). That eligibility isn't
 * part of the wire `OperationInfo` schema, so it can't be derived from `GET /tools` alone;
 * this list mirrors the backend's own allowlist and needs updating alongside it. The backend
 * re-validates on every `POST /workflows` regardless — this only narrows the picker's choices.
 */
const ELIGIBLE_STEP_OPERATION_IDS: readonly string[] = ['image.resize', 'media.thumbnail', 'media.extract-audio', 'media.transcode'];

/** The shared catalog of saved recipes — parallels `RuntimeStatusService.tools`: fetched once, refreshed after a create/delete, read by every Recipes page. */
@Injectable({ providedIn: 'root' })
export class RecipesService {
  private readonly apiClient = inject(ApiClientService);
  private readonly runtimeStatus = inject(RuntimeStatusService);

  private readonly _workflows = signal<readonly WorkflowModel[]>([]);
  private readonly _loaded = signal(false);
  private readonly _isLoading = signal(false);

  readonly workflows = this._workflows.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  /** Every operation eligible as a recipe step, across every registered tool. */
  readonly eligibleOperations = computed<readonly ToolOperationModel[]>(() =>
    this.runtimeStatus.tools()
      .flatMap((tool) => tool.operations)
      .filter((op) => ELIGIBLE_STEP_OPERATION_IDS.includes(op.id))
  );

  /** Fetches the list once; subsequent calls are no-ops until `refresh()` is called explicitly. */
  ensureLoaded(): void {
    if (this._loaded()) {
      return;
    }
    this.refresh();
  }

  refresh(): void {
    this._isLoading.set(true);
    this.apiClient.listWorkflows$().subscribe(Either.match({
      onRight: (res) => {
        this._workflows.set(WorkflowModelsFromWorkflowListResponse.from(res));
        this._loaded.set(true);
        this._isLoading.set(false);
      },
      onLeft: () => {
        this._isLoading.set(false);
      },
    }));
  }

  findById(id: string): WorkflowModel | null {
    return this._workflows().find((w) => w.id === id) ?? null;
  }

  create$(input: CreateWorkflowInput) {
    return this.apiClient.createWorkflow$(input);
  }

  /** Fetches one recipe directly, bypassing the cached list — used by the run page so a direct link or refresh works even before the list has loaded. */
  get$(id: string) {
    return this.apiClient.getWorkflow$(id);
  }

  delete$(id: string) {
    return this.apiClient.deleteWorkflow$(id);
  }

  /**
   * A saved recipe registers itself as a real operation on the backend (`recipe.<id>`),
   * which is how it shows up in the sidebar's dynamically-grouped tool list — but that list
   * is only as fresh as the last `GET /tools` call. Creating or deleting a recipe changes
   * that response, so both refresh it immediately rather than leaving the sidebar to catch
   * up on the next unrelated navigation.
   */
  onCreated(workflow: ReturnType<typeof WorkflowModelFromWorkflowResponse.from>): void {
    this._workflows.update((list) => [workflow, ...list]);
    this._loaded.set(true);
    this.runtimeStatus.refreshStatus();
  }

  onDeleted(id: string): void {
    this._workflows.update((list) => list.filter((w) => w.id !== id));
    this.runtimeStatus.refreshStatus();
  }
}
