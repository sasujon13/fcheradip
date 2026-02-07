import { Injector, Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { CountryService } from './country.service';

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
    const lang = this.injector.get(CountryService).getPreferredLang();
    if (lang) {
      request = request.clone({
        setHeaders: { 'X-Language': lang },
      });
    }
    return next.handle(request);
  }
}
