import { Effect, Schema } from "effect";
import { ToolParameter } from "@utility/protocol";
import { WorkspaceInstance } from "@utility/runtime";

export interface OperationContext {
  readonly workspace: WorkspaceInstance;
}

export interface Operation<I, O, E = unknown, R = never> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParameter[];
  readonly inputSchema: Schema.Schema<I>;
  readonly outputSchema: Schema.Schema<O>;
  readonly execute: (input: I, context: OperationContext) => Effect.Effect<O, E, R>;
}
