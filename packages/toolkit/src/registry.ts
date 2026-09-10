import { Context, Effect, Layer } from "effect";
import { Tool } from "./tool.js";
import { Operation } from "./operation.js";
import { ToolsListResponse } from "@utility/protocol";

export interface ToolRegistry {
  readonly registerTool: (tool: Tool) => Effect.Effect<void>;
  readonly getTools: () => Effect.Effect<readonly Tool[]>;
  readonly getTool: (id: string) => Effect.Effect<Tool | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly getOperation: (id: string) => Effect.Effect<Operation<any, any, any, any> | undefined>;
  readonly getToolsInfo: () => Effect.Effect<ToolsListResponse>;
}

export const ToolRegistry = Context.GenericTag<ToolRegistry>("@utility/toolkit/ToolRegistry");

export const makeToolRegistry = (initialTools: readonly Tool[] = []) =>
  Layer.sync(ToolRegistry, () => {
    const toolsMap = new Map<string, Tool>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operationsMap = new Map<string, Operation<any, any, any, any>>();

    const registerToolSync = (tool: Tool) => {
      toolsMap.set(tool.id, tool);
      for (const op of tool.operations) {
        operationsMap.set(op.id, op);
      }
    };

    for (const tool of initialTools) {
      registerToolSync(tool);
    }

    return ToolRegistry.of({
      registerTool: (tool: Tool) =>
        Effect.sync(() => {
          registerToolSync(tool);
        }),

      getTools: () => Effect.sync(() => Array.from(toolsMap.values())),

      getTool: (id: string) => Effect.sync(() => toolsMap.get(id)),

      getOperation: (id: string) => Effect.sync(() => operationsMap.get(id)),

      getToolsInfo: () =>
        Effect.sync(() => ({
          tools: Array.from(toolsMap.values()).map((t) => t.toInfo()),
        })),
    });
  });

export const ToolRegistryLive = makeToolRegistry();
