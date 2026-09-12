import type { WorkflowResponse, WorkflowListResponse, WorkflowRunOutput } from '@utility/protocol';
import type { From } from '@utility/adapter';
import { ArtifactModel } from './artifact.model.js';

export interface WorkflowStepModel {
  readonly operationId: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface WorkflowModelParams {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly WorkflowStepModel[];
  readonly createdAt: string;
  /** What to submit a job against to run this recipe — `recipe.<id>`. */
  readonly operationId: string;
}

export class WorkflowModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly WorkflowStepModel[];
  readonly createdAt: string;
  readonly operationId: string;

  constructor(params: WorkflowModelParams) {
    this.id = params.id;
    this.name = params.name;
    this.description = params.description;
    this.steps = params.steps;
    this.createdAt = params.createdAt;
    this.operationId = params.operationId;
  }

  get stepCount(): number {
    return this.steps.length;
  }
}

export const WorkflowModelFromWorkflowResponse: From<WorkflowResponse, WorkflowModel> = {
  from: (dto) => new WorkflowModel(dto),
};

export const WorkflowModelsFromWorkflowListResponse: From<WorkflowListResponse, readonly WorkflowModel[]> = {
  from: (dto) => dto.workflows.map((workflow) => WorkflowModelFromWorkflowResponse.from(workflow)),
};

export const ArtifactModelFromWorkflowRunOutput: From<WorkflowRunOutput, ArtifactModel> = {
  from: (dto) => new ArtifactModel(dto.artifact),
};
