import type { HttpResponse } from "../interfaces";
import type { Observable } from "rxjs";

import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, map, of } from "rxjs";
import { Either } from "effect";
import { matchErrorMessage } from "../interceptors";
import { ResponseError } from "../errors";

export interface HttpOptions {
  headers?: HttpHeaders | { [header: string]: string | string[] };
  params?: HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean> };
}

@Injectable({ providedIn: 'root' })
export class HttpClientService {
  private readonly _http = inject(HttpClient);

  get<T>(url: string, options?: HttpOptions) {
    return this._http.get<T>(url, options) as Observable<HttpResponse<T>>;
  }

  post<T>(url: string, body: any, options?: HttpOptions) {
    return this._http.post<T>(url, body, options) as Observable<HttpResponse<T>>;
  }

  put<T>(url: string, body: any, options?: HttpOptions) {
    return this._http.put<T>(url, body, options) as Observable<HttpResponse<T>>;
  }

  patch<T>(url: string, body: any, options?: HttpOptions) {
    return this._http.patch<T>(url, body, options) as Observable<HttpResponse<T>>;
  }

  delete<T>(url: string, options?: HttpOptions){
    return this._http.delete<T>(url, options) as Observable<HttpResponse<T>>;
  }

  /**
   * `responseInterceptor` skips its usual `Either` body-wrapping for non-`json` requests
   * (Angular enforces the response body's runtime type against `responseType` right after
   * interceptors run, which an `Either`-wrapped body would fail) — so this wraps success and
   * error into the same `Either<Blob, ResponseError>` shape every other client method returns,
   * just done here instead of centrally.
   */
  getBlob(url: string, options?: HttpOptions): Observable<HttpResponse<Blob>> {
    return this._http.get(url, { ...options, responseType: 'blob' }).pipe(
      map((blob) => Either.right(blob)),
      catchError((error: HttpErrorResponse) => of(Either.left(new ResponseError({ code: error.status, message: matchErrorMessage(error) }))))
    );
  }
}