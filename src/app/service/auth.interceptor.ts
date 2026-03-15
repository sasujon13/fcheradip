import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Adds Authorization: Bearer <token> when request is to our API and token exists. */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('authToken');
    const apiUrl = (environment.apiUrl || '').replace(/\/$/, '');
    const path = request.url.startsWith('http') ? new URL(request.url).pathname : request.url;
    const isApi = path === apiUrl || path.startsWith(apiUrl + '/');
    if (token && isApi) {
      request = request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }
    return next.handle(request);
  }
}
