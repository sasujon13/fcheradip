import { Component, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { cheradipChangeDetection } from './change-detection.config';

@Component({ template: '<p>{{ message }}</p>' })
class AsyncCatalogueProbe {
  message = 'Finding your products…';
  constructor(private http: HttpClient) {}
  load(): void {
    this.http.get<{ count: number }>('/catalogue-refresh-test').subscribe(data => {
      this.message = `${data.count} products`;
      setTimeout(() => this.message += ' ready', 0);
    });
  }
}

describe('Legacy application asynchronous refresh', () => {
  it('renders HTTP results and timer reveals without another click or forced change detection', async () => {
    TestBed.configureTestingModule({
      imports: [AsyncCatalogueProbe],
      providers: [cheradipChangeDetection, provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AsyncCatalogueProbe);
    fixture.autoDetectChanges();
    const zone = TestBed.inject(NgZone);
    zone.run(() => fixture.componentInstance.load());
    zone.run(() => TestBed.inject(HttpTestingController).expectOne('/catalogue-refresh-test').flush({ count: 24 }));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('24 products ready');
    expect(fixture.nativeElement.textContent).not.toContain('Finding');
    TestBed.inject(HttpTestingController).verify();
  });
});
