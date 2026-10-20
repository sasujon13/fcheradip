import { HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthInterceptor } from './auth.interceptor';

describe('commerce management request authentication', () => {
  it('sends the normal CSRF header for staff session writes', () => {
    const interceptor = new AuthInterceptor({invalidateSession: () => {}} as any);
    spyOn<any>(interceptor, 'cookieValue').and.returnValue('test-csrf-token');
    let sent: HttpRequest<unknown> | undefined;
    interceptor.intercept(new HttpRequest('POST', `${environment.apiUrl}/ecommerce/admin/products/`, {}), {
      handle: request => { sent = request; return of(new HttpResponse({status: 201})); },
    }).subscribe();
    expect(sent!.headers.get('X-CSRFToken')).toBe('test-csrf-token');
    expect(sent!.withCredentials).toBeTrue();
  });

  it('does not send a CSRF cookie to another origin or on read-only requests', () => {
    const interceptor = new AuthInterceptor({invalidateSession: () => {}} as any);
    const cookie = spyOn<any>(interceptor, 'cookieValue').and.returnValue('test-csrf-token');
    for (const request of [new HttpRequest('POST', 'https://example.com/ecommerce/admin/products/', {}),
      new HttpRequest('GET', `${environment.apiUrl}/ecommerce/admin/products/`)]) {
      interceptor.intercept(request, {
        handle: sent => { expect(sent.headers.has('X-CSRFToken')).toBeFalse(); return of(new HttpResponse({status: 200})); },
      }).subscribe();
    }
    expect(cookie).not.toHaveBeenCalled();
  });
});
