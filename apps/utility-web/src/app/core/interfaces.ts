import type { ResponseError } from "./errors";
import type { Either } from "effect";

export type HttpResponse<T> = Either.Either<T, ResponseError>;