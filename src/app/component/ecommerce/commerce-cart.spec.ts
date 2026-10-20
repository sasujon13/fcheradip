import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { ApiService } from '../../service/api.service';
import { AuthSessionService } from '../../service/auth-session.service';
import { EcommerceComingSoonComponent } from './ecommerce-coming-soon.component';

describe('One shared marketplace cart', () => {
  let fixture: ComponentFixture<EcommerceComingSoonComponent>;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let route: any;
  let originalToken: string | null;
  let originalName: string | null;
  const cartRequest = () => http.expectOne(req => req.url.endsWith('/cart/test-cart/'));

  beforeEach(async () => {
    originalToken = localStorage.getItem('cheradipEcommerceCart');
    originalName = localStorage.getItem('fullName');
    localStorage.setItem('cheradipEcommerceCart', 'test-cart');
    router = jasmine.createSpyObj('Router', ['navigate', 'getCurrentNavigation']);
    router.navigate.and.returnValue(Promise.resolve(true));
    router.getCurrentNavigation.and.returnValue(null);
    route = { snapshot: { data: { view: 'cart' }, queryParamMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap({})) };
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, HttpClientTestingModule],
      declarations: [EcommerceComingSoonComponent],
      providers: [
        { provide: ActivatedRoute, useValue: route }, { provide: Router, useValue: router },
        { provide: ApiService, useValue: { getCommerceHistory: () => of({}), getDivisionsByCountry: () => of([]), getDistrictsByCountry: () => of([]), getThanasByCountry: () => of([]) } },
        { provide: AuthSessionService, useValue: {} }, { provide: MatSnackBar, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EcommerceComingSoonComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(req => req.url.endsWith('/store-policy/') || req.url.endsWith('/checkout/profile/') || req.url.endsWith('/brands/')).forEach(req => req.flush(req.request.url.endsWith('/brands/') ? [] : {}));
    fixture.destroy(); http.verify();
    if (originalToken === null) localStorage.removeItem('cheradipEcommerceCart');
    else localStorage.setItem('cheradipEcommerceCart', originalToken);
    if (originalName === null) localStorage.removeItem('fullName');
    else localStorage.setItem('fullName', originalName);
  });

  it('shows the signed-in full name as the cart heading', () => {
    spyOnProperty(fixture.componentInstance, 'loginStatus', 'get').and.returnValue(true);
    localStorage.setItem('fullName', '  MD. Shafikul Islam  ');
    fixture.detectChanges();
    cartRequest().flush({ token: 'test-cart', items: [], subtotal: 0 }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.workspace-heading h1').textContent).toBe("MD. Shafikul Islam's Cart");
  });

  it('keeps a generic heading for guests even if an old name remains in storage', () => {
    spyOnProperty(fixture.componentInstance, 'loginStatus', 'get').and.returnValue(false);
    localStorage.setItem('fullName', 'Old account');
    expect(fixture.componentInstance.cartTitle).toBe('Your cart');
  });

  it('keeps a generic heading when the signed-in name is unavailable', () => {
    spyOnProperty(fixture.componentInstance, 'loginStatus', 'get').and.returnValue(true);
    localStorage.setItem('fullName', '  ');
    expect(fixture.componentInstance.cartTitle).toBe('Your cart');
  });

  it('opens /cart with the saved marketplace cart, without downloading the catalog', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.activeView).toBe('cart');
    expect(fixture.nativeElement.textContent).toContain('Loading your cart');
    expect(fixture.nativeElement.textContent).not.toContain('Your cart is empty');
    http.expectNone(req => req.url.endsWith('/products/') || req.url.endsWith('/categories/'));
    cartRequest().flush({ token: 'test-cart', items: [], subtotal: 0 }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your cart is empty');
    expect(fixture.nativeElement.querySelector('.empty-cart-image').getAttribute('src')).toBe('assets/images/fish.png');
    expect(fixture.nativeElement.querySelector('.commerce-search')).toBeNull();
    fixture.nativeElement.querySelector('.empty-state button').click();
    expect(router.navigate).toHaveBeenCalledWith(['/ecommerce'], { queryParams: {}, state: undefined });
  });

  it('displays items, quantities, subtotal and checkout from the same saved cart', () => {
    const count = jasmine.createSpy('cart count');
    const listen = (event: Event) => count((event as CustomEvent).detail);
    window.addEventListener('cheradip-ecommerce-cart-count', listen);
    try {
      fixture.detectChanges();
      cartRequest().flush({ token: 'test-cart', subtotal: 800, items: [{ id: 1, variant_id: 2, quantity: 2, product_name: 'Test book', variant_title: 'Soft copy', sku: 'BOOK-1', unit_price: '400', image_url: '', line_total: 800 }] });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.cart-items article').length).toBe(1);
      expect(fixture.nativeElement.textContent).toContain('Test book');
      expect(fixture.nativeElement.querySelector('.checkout-total').textContent).toContain('800');
      expect(fixture.nativeElement.querySelector('.checkout-card')).not.toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Your cart is empty');
      expect(count).toHaveBeenCalledWith(2);
    } finally { window.removeEventListener('cheradip-ecommerce-cart-count', listen); }
  });

  it('redirects the old ?view=cart URL to /cart without replacing its saved cart', () => {
    route.snapshot.data = {};
    route.queryParamMap = of(convertToParamMap({ view: 'cart' }));
    fixture.detectChanges();
    cartRequest().flush({ token: 'test-cart', items: [], subtotal: 0 });
    expect(router.navigate).toHaveBeenCalledWith(['/cart'], { queryParams: { from: 'ecommerce' }, replaceUrl: true });
    expect(localStorage.getItem('cheradipEcommerceCart')).toBe('test-cart');
  });

  it('recalculates delivery when the destination thana changes and shows area with weight', fakeAsync(() => {
    fixture.detectChanges();
    cartRequest().flush({token:'test-cart',subtotal:500,items:[{id:1,variant_id:2,quantity:1,product_name:'Parcel',unit_price:'500',line_total:500}]});
    fixture.detectChanges(); tick();
    const component = fixture.componentInstance;
    component.checkout.district = 'Dhaka'; component.checkout.thana = 'Dhanmondi';
    component.requestQuote(); tick(301);
    const metro = http.expectOne(req => req.url.endsWith('/checkout/quote/'));
    expect(metro.request.body.shipping_address).toEqual(jasmine.objectContaining({district:'Dhaka',thana:'Dhanmondi'}));
    metro.flush({subtotal:500,discount_total:0,shipping_total:75,cod_total:5,grand_total:580,delivery_details:{zone:'dhaka',weight_grams:1000,minimum:'70',maximum:'80'}});
    fixture.detectChanges();
    const thana = fixture.nativeElement.querySelector('input[name="thana"]') as HTMLInputElement;
    thana.value = 'Savar'; thana.dispatchEvent(new Event('input')); fixture.detectChanges(); tick(301);
    const suburb = http.expectOne(req => req.url.endsWith('/checkout/quote/'));
    expect(suburb.request.body.shipping_address.thana).toBe('Savar');
    expect(component.quote).toBeNull();
    suburb.flush({subtotal:500,discount_total:0,shipping_total:100,cod_total:5,grand_total:605,delivery_details:{zone:'suburbs',weight_grams:1000,minimum:'100',maximum:'100'}});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Delivery area: Dhaka suburbs');
    expect(fixture.nativeElement.textContent).toContain('Known parcel weight: 1000 g');
  }));

  it('keeps a saved cart on network failure and retries it instead of showing empty', () => {
    fixture.detectChanges();
    cartRequest().flush({}, { status: 503, statusText: 'Unavailable' }); fixture.detectChanges();
    expect(localStorage.getItem('cheradipEcommerceCart')).toBe('test-cart');
    expect(fixture.nativeElement.textContent).toContain('Cart unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Your cart is empty');
    fixture.nativeElement.querySelector('.empty-state button').click();
    cartRequest().flush({ token: 'test-cart', items: [], subtotal: 0 }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your cart is empty');
  });

  it('recovers a cart that no longer exists, but only after a 404', () => {
    fixture.detectChanges();
    cartRequest().flush({}, { status: 404, statusText: 'Not found' });
    expect(localStorage.getItem('cheradipEcommerceCart')).toBeNull();
    http.expectOne(req => req.url.endsWith('/ecommerce/cart/')).flush({ token: 'replacement', items: [], subtotal: 0 });
    expect(localStorage.getItem('cheradipEcommerceCart')).toBe('replacement');
  });

  it('keeps /cart in cart view even when a different view query is supplied', () => {
    route.queryParamMap = of(convertToParamMap({ view: 'shop' }));
    fixture.detectChanges();
    cartRequest().flush({ token: 'test-cart', items: [], subtotal: 0 });
    expect(fixture.componentInstance.activeView).toBe('cart');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('marks a cart opened from marketplace to preserve its menu', () => {
    route.snapshot.data = {};
    fixture.componentInstance.setView('cart');
    expect(router.navigate).toHaveBeenCalledWith(['/cart'], { queryParams: { from: 'ecommerce' } });
  });
});
