export interface ToolParameterModel {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly default?: unknown;
}

export interface ToolOperationModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters?: readonly ToolParameterModel[];
}

export interface ToolModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly operations: readonly ToolOperationModel[];
}
