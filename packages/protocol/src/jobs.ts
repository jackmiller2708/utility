import { Schema } from "effect";

export const JobStatusSchema = Schema.Literal("pending", "running", "completed", "failed", "cancelled");

export type JobStatus = typeof JobStatusSchema.Type;

export const JobProgressSchema = Schema.Struct({
  completed: Schema.Number,
  total: Schema.Number,
  message: Schema.optional(Schema.String),
});

export type JobProgress = typeof JobProgressSchema.Type;

export const JobResponseSchema = Schema.Struct({
  id: Schema.String,
  operationId: Schema.String,
  status: JobStatusSchema,
  progress: Schema.NullOr(JobProgressSchema),
  result: Schema.NullOr(Schema.Unknown),
  error: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  startedAt: Schema.NullOr(Schema.String),
  completedAt: Schema.NullOr(Schema.String),
});

export type JobResponse = typeof JobResponseSchema.Type;

export const JobSubmittedResponseSchema = Schema.Struct({
  jobId: Schema.String,
});

export type JobSubmittedResponse = typeof JobSubmittedResponseSchema.Type;

export const JobListResponseSchema = Schema.Struct({
  jobs: Schema.Array(JobResponseSchema),
});

export type JobListResponse = typeof JobListResponseSchema.Type;

export const JobCancelResponseSchema = Schema.Struct({
  cancelled: Schema.Boolean,
});

export type JobCancelResponse = typeof JobCancelResponseSchema.Type;
