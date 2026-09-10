import { Data } from "effect";

export class ResponseError extends Data.TaggedError('ResponseError')<{
	readonly message: string;
  readonly code?: number;
}> {}