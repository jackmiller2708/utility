import { Operation } from "./operation.js";
import { ToolInfo } from "@utility/protocol";

export interface Tool {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly operations: readonly Operation<any, any, any, any>[];
  readonly toInfo: () => ToolInfo;
}

export function createTool(toolDef: Omit<Tool, "toInfo">): Tool {
  return {
    ...toolDef,
    toInfo: (): ToolInfo => ({
      id: toolDef.id,
      name: toolDef.name,
      description: toolDef.description,
      category: toolDef.category,
      operations: toolDef.operations.map((op) => ({
        id: op.id,
        name: op.name,
        description: op.description,
        parameters: [...op.parameters],
      })),
    }),
  };
}
