import { Data } from "effect";

export class DomainError extends Data.TaggedError("DomainError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class EntityNotFoundError extends Data.TaggedError("EntityNotFoundError")<{
  readonly entityType: string;
  readonly entityId: string;
  readonly message?: string;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly issues?: readonly unknown[];
}> {}

export class SecurityError extends Data.TaggedError("SecurityError")<{
  readonly message: string;
  readonly code?: string;
}> {}
