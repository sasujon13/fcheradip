import { Injector, Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CountryService } from './country.service';
import { environment } from '../../environments/environment';

/**
 * Adds X-Language header to all API requests so the backend can translate
 * response data to the selected country's language (Google Translate).
 * Uses Injector to get CountryService lazily in intercept() to avoid circular DI:
 * HTTP_INTERCEPTORS → LanguageInterceptor → CountryService → HttpClient → HTTP_INTERCEPTORS.
 */
@Injectable()
export class LanguageInterceptor implements HttpInterceptor {
  constructor(private injector: Injector) {}

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

    const lang = this.injector.get(CountryService).getPreferredLang();
    if (lang) {
      request = request.clone({
        setHeaders: { 'X-Language': lang },
      });
    }
    return next.handle(request);
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
