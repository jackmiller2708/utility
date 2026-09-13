import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { DeviceIdentityService, HeadersFromSignedRequest } from './services/device-identity.service.js';
import { isObject, hasProperty, isString, isNotUndefined } from 'effect/Predicate';
import { catchError, from, map, of, switchMap, tap } from 'rxjs';
import { Either, identity, Match, Option } from 'effect';
import { DeviceTrustService } from './services/device-trust.service.js';
import { SafeRefinement } from 'effect/Match';
import { ResponseError } from './errors';
import { inject } from '@angular/core';

/**
 * Since `ErrorEvent` is a browser-level network error, it doesn't not exist on the server, so we can't use `instanceof` directly.
 * This refinement checks for its existence first, then narrows the type if it does exist.
 */
const isErrorEvent: SafeRefinement<InstanceType<typeof ErrorEvent>, never> = (
	identity((error: unknown) => isNotUndefined(globalThis.ErrorEvent) && error instanceof globalThis.ErrorEvent)
) as any;

/**
 * NestJS's default exception body shape is `{ statusCode, message, error }`.
 * `message` is a plain string for most exceptions, or an array of strings for
 * validation-pipe failures. Angular has already JSON-parsed this into `error.error`.
 */
const extractBackendMessage = (body: unknown) => Option.Do.pipe(
	Option.filterMap(() => isObject(body) && hasProperty(body, 'message') ? Option.some(body.message) : Option.none()),
	Option.filterMap((message) => isString(message) && message.length > 0 
		? Option.some(message) 
		: Array.isArray(message) && message.every(isString)
			? Option.some(message.join(', '))
			: Option.none()
	),
);

const matchStatusMessage = Match.type<HttpErrorResponse>().pipe(
	Match.when({ status: 401 }, () => 'Unauthorized! Please log in again.'),
	Match.when({ status: 403 }, () => 'Forbidden! You do not have permission to access this.'),
	Match.when({ status: 404 }, () => 'The requested resource was not found.'),
	Match.when({ status: 500 }, () => 'Internal Server Error. Please try again later.'),
	Match.orElse((error) => `Error Code ${error.status}: ${error.message}`)
);

const matchErrorMessage = Match.type<HttpErrorResponse>().pipe(
	Match.when({ error: isErrorEvent }, ({ error }) => `Client Error: ${error.message}`),
	Match.orElse((error) => extractBackendMessage(error.error).pipe(Option.getOrElse(() => matchStatusMessage(error))))
);

/**
 * Attaches the device-auth signature headers `DeviceAuthGuard` requires for
 * any request that isn't from `localhost` — the signed payload is
 * `METHOD:path:timestamp:nonce:` (see `DeviceIdentityService.sign`), so the
 * path here must be exactly the request URL as sent, byte for byte matching
 * what the backend guard reads off `req.originalUrl`. Requests before
 * enrollment (or during local dev, where the guard's own `isLocal` bypass
 * makes signing unnecessary) go out unsigned; `sign()` returns `null` when
 * there's no local device identity yet.
 */
export const deviceSigningInterceptor: HttpInterceptorFn = (req, next) => {
	const identity = inject(DeviceIdentityService);

	return from(identity.sign(req.method, req.url)).pipe(switchMap((signed) => next(signed
		? req.clone({ setHeaders: HeadersFromSignedRequest.from(signed) })
		: req
	)));
};

/**
 * A 401 here means `DeviceAuthGuard` rejected the signature this request
 * carried — the one case that can only mean the device backing it is no
 * longer valid (revoked, most likely), never "not enrolled yet" (those go
 * out unsigned, or against unguarded endpoints like `/auth/status`). Feeding
 * every 401 through `DeviceTrustService.invalidateTrust` re-opens the gate
 * the moment that happens, rather than leaving a revoked session free to
 * keep navigating a UI whose every protected call now silently fails.
 */
export const responseInterceptor: HttpInterceptorFn = (req, next) => {
	const deviceTrust = inject(DeviceTrustService);

	return next(req).pipe(
		map((event) => event instanceof HttpResponse
			? event.clone({ body: Either.right(event.body) })
			: event
		),
		catchError((error: HttpErrorResponse) => of(new HttpResponse({
			body: Either.left(new ResponseError({ code: error.status, message: matchErrorMessage(error) })),
			status: 200
		}))),
		tap((event) => {
			if (event instanceof HttpResponse && Either.isEither(event.body) && Either.isLeft(event.body) && event.body.left.code === 401) {
				deviceTrust.invalidateTrust('This device is no longer trusted. Ask to be trusted again to continue.');
			}
		}),
	);
};
