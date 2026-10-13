import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { ApiService } from '../../../service/api.service';
import { HistoryComponent } from './history.component';

describe('Purchase history section ordering', () => {
  let fixture: ComponentFixture<HistoryComponent>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let api: jasmine.SpyObj<ApiService>;
  const headings = () => Array.from(fixture.nativeElement.querySelectorAll('.history-section h2'))
    .map((heading: any) => heading.textContent.trim());

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({}));
    api = jasmine.createSpyObj('ApiService', ['getCommerceHistory']);
    api.getCommerceHistory.and.returnValue(of({ packages: [], orders: [], wallet: {}, profile: {} } as any));
    await TestBed.configureTestingModule({
      declarations: [HistoryComponent], imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HistoryComponent);
  });

  it('renders product and book orders first for the ecommerce entry point', () => {
    params.next(convertToParamMap({ from: 'ecommerce' }));
    fixture.detectChanges();
    expect(headings()).toEqual(['Product and book orders', 'Package activations']);
  });

  it('preserves package-first ordering when no source is specified', () => {
    fixture.detectChanges();
    expect(headings()).toEqual(['Package activations', 'Product and book orders']);
  });

  it('preserves package-first ordering for other sources', () => {
    params.next(convertToParamMap({ from: 'cheradip' }));
    fixture.detectChanges();
    expect(headings()).toEqual(['Package activations', 'Product and book orders']);
  });

  it('updates the actual section order when the source changes without refetching history', () => {
    fixture.detectChanges();
    params.next(convertToParamMap({ from: 'ECOMMERCE' })); fixture.detectChanges();
    expect(headings()[0]).toBe('Product and book orders');
    params.next(convertToParamMap({})); fixture.detectChanges();
    expect(headings()[0]).toBe('Package activations');
    expect(api.getCommerceHistory).toHaveBeenCalledTimes(1);
  });
});
