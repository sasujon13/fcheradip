import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Adds X-Language header to all API requests so the backend can translate
 * response data to the selected country's language (Google Translate).
 * Reads the persisted preference directly so CountryService can safely make
 * its own HttpClient requests without re-entering its dependency graph.
 */
@Injectable()
export class LanguageInterceptor implements HttpInterceptor {
  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // A previous local HTTPS redirect may be cached permanently by the browser.
    // Give development API reads a new cache identity after the dev proxy starts
    // forwarding the original protocol correctly. Production URLs are untouched.
    if (!environment.production && request.method === 'GET' && this.isApiRequest(request.url)) {
      request = request.clone({
        setParams: { '_cheradip_dev_proxy': 'https-forwarded-v1' },
      });
    }

    const lang = this.getPreferredLanguage();
    if (lang) {
      request = request.clone({
        setHeaders: { 'X-Language': lang },
      });
    }
    return next.handle(request);
  }

  private getPreferredLanguage(): string {
    try {
      return localStorage.getItem('preferred_lang') || document.documentElement.lang || 'en';
    } catch {
      return document.documentElement.lang || 'en';
    }
  }

  private isApiRequest(url: string): boolean {
    const apiUrl = (environment.apiUrl || '').replace(/\/$/, '');
    if (!apiUrl) return false;

    if (url.startsWith('http')) {
      try {
        const requestUrl = new URL(url, window.location.origin);
        const configuredUrl = new URL(apiUrl, window.location.origin);
        return requestUrl.origin === configuredUrl.origin &&
          (requestUrl.pathname === configuredUrl.pathname ||
            requestUrl.pathname.startsWith(`${configuredUrl.pathname}/`));
      } catch {
        return false;
      }
    }

    return url === apiUrl || url.startsWith(`${apiUrl}/`);
  }
}
