import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthSessionService } from './auth-session.service';

/** Adds Authorization: Bearer <token> when request is to our API and token exists. */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authSession: AuthSessionService) {}

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
    let sentAuth = false;
    if (token && isApi) {
      sentAuth = true;
      request = request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }
    return next.handle(request).pipe(
      catchError((err: HttpErrorResponse) => {
        if (sentAuth && err.status === 401 && !this.isPublicAuthPost(request)) {
          this.authSession.invalidateSession('multi_device');
        }
        return throwError(() => err);
      })
    );
  }

  /** Wrong password on login/signup must not treat 401 as “logged out elsewhere”. */
  private isPublicAuthPost(request: HttpRequest<unknown>): boolean {
    if (request.method !== 'POST') {
      return false;
    }
    const url = request.url.toLowerCase();
    return [
      '/login/',
      '/signup/',
      '/password_update/',
      '/mobile_update/',
      '/profile_update/',
    ].some((p) => url.includes(p));
  }
}
