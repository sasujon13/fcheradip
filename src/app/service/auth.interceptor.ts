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
    const apiUrlNorm = (environment.apiUrl || '').replace(/\/$/, '');
    let isApi = false;
    if (request.url.startsWith('http')) {
      const reqNorm = request.url.replace(/\/$/, '');
      isApi = reqNorm === apiUrlNorm || reqNorm.startsWith(apiUrlNorm + '/');
    } else {
      const apiPath = apiUrlNorm.startsWith('http') ? new URL(apiUrlNorm).pathname : apiUrlNorm;
      const apiPathNorm = (apiPath || '').replace(/\/$/, '');
      const pathNorm = (request.url || '').replace(/\/$/, '');
      isApi = pathNorm === apiPathNorm || pathNorm.startsWith(apiPathNorm + '/');
    }
    if (token && isApi) {
      request = request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }
    return next.handle(request);
  }
}
