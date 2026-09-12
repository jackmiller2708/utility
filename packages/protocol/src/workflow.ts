import { Schema } from "effect";
import { ArtifactSchema } from "./artifact.js";

export const WorkflowStepSchema = Schema.Struct({
  operationId: Schema.String,
  params: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export type WorkflowStep = typeof WorkflowStepSchema.Type;

export const CreateWorkflowRequestSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  steps: Schema.Array(WorkflowStepSchema).pipe(Schema.minItems(1)),
});

export type CreateWorkflowRequest = typeof CreateWorkflowRequestSchema.Type;

export const WorkflowResponseSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  steps: Schema.Array(WorkflowStepSchema),
  createdAt: Schema.String,
  /** What to POST to `/jobs/:operationId` (or `/tools/:operationId`) to run this recipe. */
  operationId: Schema.String,
});

export type WorkflowResponse = typeof WorkflowResponseSchema.Type;

export const WorkflowListResponseSchema = Schema.Struct({
  workflows: Schema.Array(WorkflowResponseSchema),
});

export type WorkflowListResponse = typeof WorkflowListResponseSchema.Type;

export const WorkflowRunOutputSchema = Schema.Struct({
  artifact: ArtifactSchema,
  steps: Schema.Array(
    Schema.Struct({
      operationId: Schema.String,
      artifact: ArtifactSchema,
    })
  ),
});

export type WorkflowRunOutput = typeof WorkflowRunOutputSchema.Type;
