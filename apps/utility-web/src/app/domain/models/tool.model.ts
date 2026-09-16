import type { ToolInfo, ToolsListResponse, ToolParameter, OperationInfo } from '@utility/protocol';
import type { From } from '@utility/adapter';

export interface ToolParameterModel {
  readonly name: string;
  readonly label: string;
  readonly type: ToolParameter['type'];
  readonly required: boolean;
  readonly description?: string;
  readonly defaultValue?: unknown;
  readonly options?: readonly string[];
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly min?: number;
  readonly max?: number;
  readonly inputStyle?: 'slider';
}

export interface ToolOperationModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParameterModel[];
}

export interface ToolModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly operations: readonly ToolOperationModel[];
}

const toolParameterModelFrom = (dto: ToolParameter): ToolParameterModel => ({
  name: dto.name,
  label: dto.label,
  type: dto.type,
  required: dto.required,
  description: dto.description,
  defaultValue: dto.defaultValue,
  options: dto.options,
  optionLabels: dto.optionLabels,
  min: dto.min,
  max: dto.max,
  inputStyle: dto.inputStyle,
});

const toolOperationModelFrom = (dto: OperationInfo): ToolOperationModel => ({
  id: dto.id,
  name: dto.name,
  description: dto.description,
  parameters: dto.parameters.map(toolParameterModelFrom),
});

export const ToolModelFromToolInfo: From<ToolInfo, ToolModel> = {
  from: (dto) => ({
    id: dto.id,
    name: dto.name,
    description: dto.description,
    category: dto.category,
    operations: dto.operations.map(toolOperationModelFrom),
  }),
};

export const ToolModelsFromToolsListResponse: From<ToolsListResponse, readonly ToolModel[]> = {
  from: (dto) => dto.tools.map((tool) => ToolModelFromToolInfo.from(tool)),
};
