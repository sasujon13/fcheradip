import { EcommerceComingSoonComponent } from './ecommerce-coming-soon.component';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

describe('Marketplace browsing controls', () => {
  let component: EcommerceComingSoonComponent;
  beforeEach(() => {
    component = new EcommerceComingSoonComponent(null as any, null as any, null as any, null as any, null as any, null as any);
    component.categories = [
      { id: 1, name: 'Mobile Accessories', slug: 'mobile-accessories', product_count: 10 },
      { id: 2, name: 'Books & Stationery', slug: 'books', product_count: 12 },
    ];
  });

  it('searches departments case-insensitively without changing their data', () => {
    component.categorySearch = '  MOBILE  ';
    expect(component.visibleCategories.map(category => category.slug)).toEqual(['mobile-accessories']);
    expect(component.categories.length).toBe(2);
  });

  it('shows all departments for an empty search and none for no match', () => {
    expect(component.visibleCategories.length).toBe(2);
    component.categorySearch = 'no such department';
    expect(component.visibleCategories).toEqual([]);
  });

  it('shows the selected category name', () => {
    expect(component.selectedCategoryName).toBe('All products');
    component.selectedCategory = 'books';
    expect(component.selectedCategoryName).toBe('Books & Stationery');
  });

  it('selects a category, closes mobile filters and reloads page one', () => {
    const load = spyOn(component, 'loadProducts');
    component.filtersOpen = true;
    component.chooseCategory('books');
    expect(component.selectedCategory).toBe('books');
    expect(component.filtersOpen).toBeFalse();
    expect(load).toHaveBeenCalledOnceWith(1);
  });

  it('clears search, category and sorting when resetting filters', () => {
    const load = spyOn(component, 'loadProducts');
    component.search = 'Laptop';
    component.categorySearch = 'Mobile';
    component.selectedCategory = 'mobile-accessories';
    component.ordering = 'price';
    component.filtersOpen = true;
    component.resetCatalog();
    expect([component.search, component.categorySearch, component.selectedCategory]).toEqual(['', '', '']);
    expect(component.ordering).toBe('-created_at');
    expect(component.filtersOpen).toBeFalse();
    expect(load).toHaveBeenCalledOnceWith(1);
  });

  it('calculates savings only from valid comparison prices', () => {
    const product = { price: '80', compare_at_price: '100' } as any;
    expect(component.discountPercent(product)).toBe(20);
    expect(component.discountPercent({ ...product, compare_at_price: null })).toBe(0);
    expect(component.discountPercent({ ...product, compare_at_price: '50' })).toBe(0);
    expect(component.discountPercent({ ...product, price: 'invalid' })).toBe(0);
    expect(component.discountPercent({ ...product, price: '-10' })).toBe(0);
  });

  it('continues to count quantities, not just cart lines', () => {
    component.cart = { token: 'test-only', items: [{ quantity: 2 }, { quantity: 3 }], subtotal: 100 } as any;
    expect(component.cartCount).toBe(5);
  });

  it('does not activate hover magnification for touch input', () => {
    component.magnifiedProductId = 1;
    component.productMagnifierStyle = { width: '140px' };
    component.showProductMagnifier({ pointerType: 'touch' } as PointerEvent, 2);
    expect(component.magnifiedProductId).toBeNull();
    expect(component.productMagnifierStyle).toEqual({});
  });
});

describe('Marketplace progressive loading', () => {
  let component: EcommerceComingSoonComponent;
  let http: HttpTestingController;
  const products = (start: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: start + i, name: `Product ${start + i}`, image_url: '' }));
  const batch = (offset: number, limit: number, total = 200) => {
    const request = http.expectOne(req => req.url.endsWith('/products/') && req.params.get('offset') === String(offset));
    expect(request.request.params.get('limit')).toBe(String(limit));
    request.flush({ results: products(offset + 1, Math.min(limit, total - offset)), count: total, next: offset + limit < total ? 'next' : null });
  };
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    http = TestBed.inject(HttpTestingController);
    component = new EcommerceComingSoonComponent(TestBed.inject(HttpClient), null as any, null as any, null as any, null as any, null as any);
    spyOn<any>(component, 'nearCatalogEnd').and.returnValue(false);
  });
  afterEach(() => { component.ngOnDestroy(); http.verify(); });

  it('shows 24 first, builds to 120 sequentially, then holds 12 in reserve', fakeAsync(() => {
    component.loadProducts();
    batch(0, 24);
    expect(component.products.length).toBe(24);
    expect(component.catalogLoading).toBeFalse();
    for (let offset = 24; offset < 120; offset += 12) {
      batch(offset, 12);
      tick(450);
    }
    batch(120, 12);
    tick(1000);
    expect(component.products.length).toBe(120);
    expect((component as any).productBuffer.length).toBe(12);
    expect(component.catalogProgress).toBe(100);
    http.expectNone(req => req.params.get('offset') === '132');
  }));

  it('reveals buffered cards one by one while prefetching the following 12', fakeAsync(() => {
    component.loadProducts();
    batch(0, 24);
    for (let offset = 24; offset < 120; offset += 12) { batch(offset, 12); tick(450); }
    batch(120, 12);
    (component as any).nearCatalogEnd.and.returnValue(true);
    component.onCatalogScroll();
    tick(17);
    (component as any).nearCatalogEnd.and.returnValue(false);
    expect(component.products.length).toBe(121);
    batch(132, 12);
    tick(150);
    expect(component.products.length).toBe(132);
    expect((component as any).productBuffer.length).toBe(12);
    expect(new Set(component.products.map(product => product.id)).size).toBe(132);
  }));

  it('pauses batch revelation in other views and resumes on returning to the shop', fakeAsync(() => {
    component.activeView = 'cart';
    component.loadProducts(); batch(0, 24);
    http.expectNone(req => req.params.get('offset') === '24');
    component.setView('shop'); batch(24, 12);
    component.setView('cart'); tick(500);
    expect(component.products.length).toBe(25);
    batch(36, 12, 48);
    component.setView('shop'); tick(1000);
    expect(component.products.length).toBe(48);
  }));

  it('keeps rendered products after a background failure and retries the same offset', fakeAsync(() => {
    component.loadProducts(); batch(0, 24);
    http.expectOne(req => req.params.get('offset') === '24').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.products.length).toBe(24);
    expect(component.catalogError).toBeTruthy();
    component.loadMoreProducts(); batch(24, 12, 36); tick(450);
    expect(component.products.length).toBe(36);
    expect(component.catalogError).toBe('');
    expect(component.hasMoreProducts).toBeFalse();
  }));

  it('cancels stale requests when filters change and captures new query parameters', () => {
    component.loadProducts();
    const old = http.expectOne(req => req.params.get('offset') === '0');
    component.search = 'keyboard'; component.selectedCategory = 'computer'; component.ordering = 'price';
    component.loadProducts();
    expect(old.cancelled).toBeTrue();
    const latest = http.expectOne(req => req.params.get('offset') === '0');
    expect(latest.request.params.get('search')).toBe('keyboard');
    expect(latest.request.params.get('category')).toBe('computer');
    expect(latest.request.params.get('ordering')).toBe('price');
    latest.flush({ results: products(80, 2), count: 2, next: null });
    expect(component.products.map(product => product.id)).toEqual([80, 81]);
  });

  it('stops on empty and final short batches', () => {
    component.loadProducts(); batch(0, 24, 5);
    expect(component.products.length).toBe(5);
    expect(component.hasMoreProducts).toBeFalse();
    component.loadProducts(); batch(0, 24, 0);
    expect(component.products.length).toBe(0);
    expect(component.loadingMore).toBeFalse();
  });

  it('cancels background requests and reveal timers on destruction', fakeAsync(() => {
    component.loadProducts(); batch(0, 24); batch(24, 12);
    const pending = http.expectOne(req => req.params.get('offset') === '36');
    component.ngOnDestroy(); tick(1000);
    expect(pending.cancelled).toBeTrue();
    expect(component.products.length).toBe(25);
  }));
});
