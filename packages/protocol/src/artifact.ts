import { Schema } from "effect";

export const ArtifactSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.Literal("file", "directory"),
  mimeType: Schema.String,
  size: Schema.Number,
  createdAt: Schema.String,
  checksum: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

export type ArtifactResponse = typeof ArtifactSchema.Type;
