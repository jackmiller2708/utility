import { Schema } from "effect";

export const ParameterTypeSchema = Schema.Literal("string", "number", "boolean", "file", "select");

export const ToolParameterSchema = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  type: ParameterTypeSchema,
  required: Schema.Boolean,
  description: Schema.optional(Schema.String),
  defaultValue: Schema.optional(Schema.Unknown),
  options: Schema.optional(Schema.Array(Schema.String)),
  /** Human-readable label per raw `options` value (e.g. `{ inside: "Fit" }`) — falls back to the raw value when a key is missing, so existing tools with plain enum options need no change. */
  optionLabels: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  /** Opt-in richer control for a `number` parameter — currently only `"slider"`, rendered as a labeled range input using `min`/`max`. Omitted (the default) keeps the plain number field. */
  inputStyle: Schema.optional(Schema.Literal("slider")),
});

export type ToolParameter = typeof ToolParameterSchema.Type;

export const OperationInfoSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  parameters: Schema.Array(ToolParameterSchema),
});

export type OperationInfo = typeof OperationInfoSchema.Type;

export const ToolInfoSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  category: Schema.String,
  operations: Schema.Array(OperationInfoSchema),
});

export type ToolInfo = typeof ToolInfoSchema.Type;

export const ToolsListResponseSchema = Schema.Struct({
  tools: Schema.Array(ToolInfoSchema),
});

export type ToolsListResponse = typeof ToolsListResponseSchema.Type;
