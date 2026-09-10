import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { SafeRefinement } from 'effect/Match';
import { ResponseError } from './errors';
import { Either, Match } from 'effect';

const isErrorEvent = (): SafeRefinement<InstanceType<typeof ErrorEvent>, never> => (
	(error: unknown) => typeof globalThis.ErrorEvent !== 'undefined' && error instanceof globalThis.ErrorEvent
) as any;

const matchErrorMessage = Match.type<HttpErrorResponse>().pipe(
	Match.when({ error: isErrorEvent() }, ({ error }) => `Client Error: ${error.message}`),
	Match.when({ status: 401 }, () => 'Unauthorized! Please log in again.'),
	Match.when({ status: 403 }, () => 'Forbidden! You do not have permission to access this.'),
	Match.when({ status: 404 }, () => 'The requested resource was not found.'),
	Match.when({ status: 500 }, () => 'Internal Server Error. Please try again later.'),
	Match.orElse((error) => `Error Code ${error.status}: ${error.message}`)
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