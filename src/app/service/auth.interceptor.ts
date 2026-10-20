import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthSessionService } from './auth-session.service';
import { accountSessionKey } from './account-session-state';

/** Adds Authorization: Bearer <token> when request is to our API and token exists. */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authSession: AuthSessionService) {}

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('authToken');
    const requestSession = accountSessionKey();
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
    if (isApi) request = request.clone({ withCredentials: true });
    const sharedCookieProbe = /\/session\/\?cookie_only=1(?:&|$)/.test(request.url);
    if (token && isApi && !sharedCookieProbe) {
      sentAuth = true;
      request = request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }
    const scraperRequest = request.url.includes('/scraper/') || request.url.includes('/run_scraper');
    const commerceManagementRequest = request.url.includes('/ecommerce/admin/');
    if (isApi && (scraperRequest || commerceManagementRequest) && !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(request.method) &&
        !request.headers.has('X-CSRFToken')) {
      const csrfToken = this.cookieValue('csrftoken');
      if (csrfToken) request = request.clone({ setHeaders: { 'X-CSRFToken': csrfToken } });
    }
    return next.handle(request).pipe(
      catchError((err: HttpErrorResponse) => {
        if (sentAuth && requestSession && requestSession === accountSessionKey() && err.status === 401 && !this.isPublicAuthPost(request)) {
          this.authSession.invalidateSession('multi_device');
        }
        return throwError(() => err);
      })
    );
  }

  private cookieValue(name: string): string {
    const prefix = `${name}=`;
    const cookie = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
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
