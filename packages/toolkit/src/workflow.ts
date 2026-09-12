import { Context, Effect, Layer, Data, Schema } from "effect";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { WorkflowRunOutput, WorkflowRunOutputSchema } from "@utility/protocol";
import { Artifact } from "@utility/domain";
import { FileSystem, ArtifactStore } from "@utility/runtime";
import { Operation } from "./operation.js";
import { Tool, createTool } from "./tool.js";
import { ToolRegistry } from "./registry.js";

export interface WorkflowStep {
  readonly operationId: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly WorkflowStep[];
  readonly createdAt: string;
}

export class WorkflowValidationError extends Data.TaggedError("WorkflowValidationError")<{
  readonly message: string;
}> {}

export class WorkflowStepError extends Data.TaggedError("WorkflowStepError")<{
  readonly workflowId: string;
  readonly stepIndex: number;
  readonly operationId: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WorkflowNotFoundError extends Data.TaggedError("WorkflowNotFoundError")<{
  readonly workflowId: string;
}> {}

/** The operation id a compiled recipe is registered under — what callers POST to `/jobs/:operationId`. */
export const recipeOperationId = (workflowId: string): string => `recipe.${workflowId}`;

const RECIPE_FILE_PARAM = "file";
const RECIPE_INPUT_SCHEMA = Schema.Struct({ file: Schema.String });

/**
 * Validates that an operation can serve as a workflow step: exactly one non-plural file
 * input (so a single artifact can be handed to it) and a declared single-artifact output
 * (so its result can be handed to the next step). Fan-out operations (pdf.render-pages,
 * pdf.extract-images, pdf.split), multi-file operations (pdf.merge's "files"), and
 * metadata-only operations (pdf.inspect, media.inspect) all fail this and can't be chained.
 */
const validateStepOperation = (
  step: WorkflowStep,
  index: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  op: Operation<any, any, any, any> | undefined
): WorkflowValidationError | undefined => {
  if (!op) {
    return new WorkflowValidationError({
      message: `Step ${index + 1}: operation "${step.operationId}" is not registered`,
    });
  }

  const fileParams = op.parameters.filter((p) => p.type === "file");
  if (fileParams.length !== 1 || fileParams[0].name === "files") {
    return new WorkflowValidationError({
      message: `Step ${index + 1}: operation "${step.operationId}" does not take a single file input, so it can't be chained in a recipe`,
    });
  }

  if (!op.producesArtifact) {
    return new WorkflowValidationError({
      message: `Step ${index + 1}: operation "${step.operationId}" does not produce a single artifact output, so it can't be chained in a recipe`,
    });
  }

  return undefined;
};

/**
 * Compiles a saved recipe into a runnable single-file Operation. Feeds each step's output
 * artifact forward as the next step's input file by copying it (via ArtifactStore, where
 * every operation already persists its output) back into the same workspace's input
 * directory — reusing the one `WorkspaceInstance` the caller already set up for the whole
 * chain rather than inventing per-step workspace lifecycle management.
 */
export const compileWorkflowOperation = (
  definition: WorkflowDefinition
): Operation<{ readonly file: string }, WorkflowRunOutput, WorkflowStepError, ToolRegistry | ArtifactStore | FileSystem> => ({
  id: recipeOperationId(definition.id),
  name: definition.name,
  description: definition.description,
  parameters: [
    {
      name: RECIPE_FILE_PARAM,
      label: "Input File",
      type: "file",
      required: true,
      description: "The file to run through this recipe",
    },
  ],
  inputSchema: RECIPE_INPUT_SCHEMA,
  outputSchema: WorkflowRunOutputSchema,
  execute: (input, context) =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry;
      const artifactStore = yield* ArtifactStore;
      const fs = yield* FileSystem;

      let currentFileName = input.file;
      const stepResults: { operationId: string; artifact: Artifact }[] = [];

      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        const op = yield* registry.getOperation(step.operationId);

        if (!op) {
          return yield* Effect.fail(
            new WorkflowStepError({
              workflowId: definition.id,
              stepIndex: i,
              operationId: step.operationId,
              message: `Operation "${step.operationId}" is no longer registered`,
            })
          );
        }

        const fileParam = op.parameters.find((p) => p.type === "file")!.name;
        const stepInput = { ...step.params, [fileParam]: currentFileName };

        context.reportProgress?.({ completed: i, total: definition.steps.length, message: op.name });

        const output = yield* op.execute(stepInput, { workspace: context.workspace }).pipe(
          Effect.mapError(
            (cause) =>
              new WorkflowStepError({
                workflowId: definition.id,
                stepIndex: i,
                operationId: step.operationId,
                message: `Step ${i + 1} ("${op.name}") failed`,
                cause,
              })
          )
        );

        const artifact = op.producesArtifact!(output);
        stepResults.push({ operationId: step.operationId, artifact });

        if (i < definition.steps.length - 1) {
          const storedPath = yield* artifactStore.getArtifactPath(artifact.id).pipe(
            Effect.mapError(
              (cause) =>
                new WorkflowStepError({
                  workflowId: definition.id,
                  stepIndex: i,
                  operationId: step.operationId,
                  message: `Failed to stage step ${i + 1} output for the next step`,
                  cause,
                })
            )
          );
          yield* fs.copy(storedPath, context.workspace.resolveInputPath(artifact.name)).pipe(
            Effect.mapError(
              (cause) =>
                new WorkflowStepError({
                  workflowId: definition.id,
                  stepIndex: i,
                  operationId: step.operationId,
                  message: `Failed to stage step ${i + 1} output for the next step`,
                  cause,
                })
            )
          );
          currentFileName = artifact.name;
        }
      }

      context.reportProgress?.({ completed: definition.steps.length, total: definition.steps.length });

      const last = stepResults[stepResults.length - 1];
      return { artifact: last.artifact, steps: stepResults };
    }),
  // The runtime value is always a domain `Artifact` (produced by some tool operation's own
  // `producesArtifact`); `WorkflowRunOutput` only widens its `id` to `string` for the wire.
  producesArtifact: (output) => output.artifact as Artifact,
});

const workflowToTool = (definition: WorkflowDefinition): Tool =>
  createTool({
    id: recipeOperationId(definition.id),
    name: definition.name,
    description: definition.description,
    category: "Recipes",
    operations: [compileWorkflowOperation(definition)],
  });

export interface CreateWorkflowInput {
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly WorkflowStep[];
}

export interface WorkflowRegistry {
  readonly createWorkflow: (input: CreateWorkflowInput) => Effect.Effect<WorkflowDefinition, WorkflowValidationError>;
  readonly getWorkflow: (id: string) => Effect.Effect<WorkflowDefinition, WorkflowNotFoundError>;
  readonly listWorkflows: () => Effect.Effect<readonly WorkflowDefinition[]>;
  readonly deleteWorkflow: (id: string) => Effect.Effect<void, WorkflowNotFoundError>;
}

export const WorkflowRegistry = Context.GenericTag<WorkflowRegistry>("@utility/toolkit/WorkflowRegistry");

export interface WorkflowRegistryConfig {
  readonly storageDir?: string;
}

let workflowIdCounter = 0;
const nextWorkflowId = () => `wf_${Date.now()}_${(++workflowIdCounter).toString(36)}${crypto.randomBytes(3).toString("hex")}`;

export const makeWorkflowRegistry = (config: WorkflowRegistryConfig = {}) =>
  Layer.effect(
    WorkflowRegistry,
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const toolRegistry = yield* ToolRegistry;
      const storageDir = config.storageDir || path.join(os.homedir(), ".utility", "workflows");

      yield* fs.createDirectory(storageDir).pipe(Effect.orDie);

      const workflows = new Map<string, WorkflowDefinition>();

      const files = yield* fs.listDirectory(storageDir).pipe(Effect.catchAll(() => Effect.succeed([] as readonly string[])));
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const content = yield* fs.readString(path.join(storageDir, file)).pipe(Effect.catchAll(() => Effect.succeed(null)));
        if (!content) continue;
        try {
          const definition = JSON.parse(content) as WorkflowDefinition;
          workflows.set(definition.id, definition);
          yield* toolRegistry.registerTool(workflowToTool(definition));
        } catch {
          // ignore corrupted recipe files
        }
      }

      const createWorkflow = (input: CreateWorkflowInput): Effect.Effect<WorkflowDefinition, WorkflowValidationError> =>
        Effect.gen(function* () {
          if (input.steps.length === 0) {
            return yield* Effect.fail(new WorkflowValidationError({ message: "A recipe needs at least one step" }));
          }

          for (let i = 0; i < input.steps.length; i++) {
            const op = yield* toolRegistry.getOperation(input.steps[i].operationId);
            const error = validateStepOperation(input.steps[i], i, op);
            if (error) {
              return yield* Effect.fail(error);
            }
          }

          const definition: WorkflowDefinition = {
            id: nextWorkflowId(),
            name: input.name,
            description: input.description ?? "",
            steps: input.steps,
            createdAt: new Date().toISOString(),
          };

          yield* fs.write(path.join(storageDir, `${definition.id}.json`), JSON.stringify(definition, null, 2)).pipe(
            Effect.mapError((cause) => new WorkflowValidationError({ message: `Failed to save recipe: ${cause.message}` }))
          );

          workflows.set(definition.id, definition);
          yield* toolRegistry.registerTool(workflowToTool(definition));

          return definition;
        });

      const getWorkflow = (id: string): Effect.Effect<WorkflowDefinition, WorkflowNotFoundError> => {
        const definition = workflows.get(id);
        return definition ? Effect.succeed(definition) : Effect.fail(new WorkflowNotFoundError({ workflowId: id }));
      };

      const listWorkflows = (): Effect.Effect<readonly WorkflowDefinition[]> =>
        Effect.sync(() => Array.from(workflows.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      const deleteWorkflow = (id: string): Effect.Effect<void, WorkflowNotFoundError> =>
        Effect.gen(function* () {
          yield* getWorkflow(id);
          yield* fs.remove(path.join(storageDir, `${id}.json`)).pipe(Effect.catchAll(() => Effect.void));
          yield* toolRegistry.removeTool(recipeOperationId(id));
          workflows.delete(id);
        });

      return { createWorkflow, getWorkflow, listWorkflows, deleteWorkflow };
    })
  );

export const WorkflowRegistryLive = makeWorkflowRegistry();
