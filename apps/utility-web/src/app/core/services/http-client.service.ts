import type { HttpResponse } from "../interfaces";
import type { Observable } from "rxjs";

import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";

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
}