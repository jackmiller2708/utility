import { Controller, Get, Post, Delete, Param, Body, UseGuards, BadRequestException } from "@nestjs/common";
import { Effect } from "effect";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { WorkflowRegistry, recipeOperationId, WorkflowStep } from "@utility/toolkit";

interface CreateWorkflowBody {
  name?: string;
  description?: string;
  steps?: { operationId?: string; params?: Record<string, unknown> }[];
}

function parseSteps(body: CreateWorkflowBody): readonly WorkflowStep[] {
  if (!body.name || typeof body.name !== "string") {
    throw new BadRequestException("name is required");
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    throw new BadRequestException("steps must be a non-empty array");
  }

  return body.steps.map((step, index) => {
    if (!step.operationId || typeof step.operationId !== "string") {
      throw new BadRequestException(`steps[${index}].operationId is required`);
    }
    return {
      operationId: step.operationId,
      params: step.params && typeof step.params === "object" ? step.params : {},
    };
  });
}

@UseGuards(DeviceAuthGuard)
@Controller("workflows")
export class WorkflowsController {
  constructor(private readonly effectRuntime: EffectRuntimeService) {}

  @Post()
  async createWorkflow(@Body() body: CreateWorkflowBody) {
    const steps = parseSteps(body);

    const definition = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* WorkflowRegistry;
        return yield* registry.createWorkflow({ name: body.name!, description: body.description, steps });
      })
    );

    return { ...definition, operationId: recipeOperationId(definition.id) };
  }

  @Get()
  async listWorkflows() {
    const workflows = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* WorkflowRegistry;
        return yield* registry.listWorkflows();
      })
    );

    return { workflows: workflows.map((w) => ({ ...w, operationId: recipeOperationId(w.id) })) };
  }

  @Get(":id")
  async getWorkflow(@Param("id") id: string) {
    const definition = await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* WorkflowRegistry;
        return yield* registry.getWorkflow(id);
      })
    );

    return { ...definition, operationId: recipeOperationId(definition.id) };
  }

  @Delete(":id")
  async deleteWorkflow(@Param("id") id: string) {
    await this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* WorkflowRegistry;
        return yield* registry.deleteWorkflow(id);
      })
    );

    return { deleted: true };
  }
}
