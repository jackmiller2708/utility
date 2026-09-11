import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { SafeRefinement } from 'effect/Match';
import { ResponseError } from './errors';
import { Either, Match } from 'effect';

const isErrorEvent = (): SafeRefinement<InstanceType<typeof ErrorEvent>, never> => (
	(error: unknown) => typeof globalThis.ErrorEvent !== 'undefined' && error instanceof globalThis.ErrorEvent
) as any;

/**
 * NestJS's default exception body shape is `{ statusCode, message, error }`.
 * `message` is a plain string for most exceptions, or an array of strings for
 * validation-pipe failures. Angular has already JSON-parsed this into `error.error`.
 */
const extractBackendMessage = (body: unknown): string | undefined => {
	if (!body || typeof body !== 'object' || !('message' in body)) {
		return undefined;
	}

	const message = (body as { message: unknown }).message;

	if (typeof message === 'string' && message.length > 0) {
		return message;
	}

	if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
		return message.join(', ');
	}

	return undefined;
};

const matchStatusMessage = Match.type<HttpErrorResponse>().pipe(
	Match.when({ status: 401 }, () => 'Unauthorized! Please log in again.'),
	Match.when({ status: 403 }, () => 'Forbidden! You do not have permission to access this.'),
	Match.when({ status: 404 }, () => 'The requested resource was not found.'),
	Match.when({ status: 500 }, () => 'Internal Server Error. Please try again later.'),
	Match.orElse((error) => `Error Code ${error.status}: ${error.message}`)
);

const matchErrorMessage = Match.type<HttpErrorResponse>().pipe(
	Match.when({ error: isErrorEvent() }, ({ error }) => `Client Error: ${error.message}`),
	Match.orElse((error) => extractBackendMessage(error.error) ?? matchStatusMessage(error))
);

export const responseInterceptor: HttpInterceptorFn = (req, next) => next(req).pipe(
	map((event) => event instanceof HttpResponse
		? event.clone({ body: Either.right(event.body) })
		: event
	),
	catchError((error: HttpErrorResponse) => of(new HttpResponse({
		body: Either.left(new ResponseError({ code: error.status, message: matchErrorMessage(error) })),
		status: 200
	})))
);
