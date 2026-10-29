import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { EcommerceComingSoonComponent } from './ecommerce-coming-soon.component';

describe('District-based commerce checkout', () => {
  let component: EcommerceComingSoonComponent;
  let http: HttpTestingController;
  let snack: any;
  let savedCart: string | null;
  let savedOwner: string | null;

  beforeEach(() => {
    savedCart = localStorage.getItem('cheradipEcommerceCart');
    savedOwner = localStorage.getItem('cheradipEcommerceCartOwner');
    localStorage.removeItem('cheradipEcommerceCart');
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    http = TestBed.inject(HttpTestingController);
    snack = {open: jasmine.createSpy('open')};
    component = new EcommerceComingSoonComponent(TestBed.inject(HttpClient),
      {snapshot: {data: {view: 'cart'}, paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({})}, queryParamMap: of(convertToParamMap({}))} as any,
      {navigate: () => Promise.resolve(true), getCurrentNavigation: () => null} as any,
      {getDivisionsByCountry: () => of(['Dhaka']), getDivisionByDistrict: (_c: string, district: string) => of(district === 'Cumilla' ? ['Chattogram'] : district ? ['Dhaka'] : []), getDistrictsByCountry: (_c: string, division?: string) => of(division ? (division === 'Chattogram' ? ['Cumilla', 'Chattogram'] : ['Dhaka', 'Gazipur']) : Array.from({length: 64}, (_, i) => `District ${i + 1}`)), getThanasByCountry: () => of(['Savar']), getCommerceHistory: () => of({})} as any,
      {} as any, snack);
  });
  afterEach(() => {
    component.ngOnDestroy(); http.verify();
    for (const [key, value] of [['cheradipEcommerceCart', savedCart], ['cheradipEcommerceCartOwner', savedOwner]]) {
      if (value == null) localStorage.removeItem(key!); else localStorage.setItem(key!, value);
    }
  });
  const cart = {token: 'test', subtotal: 1000, items: [{id: 1, variant_id: 1, quantity: 1, product_name: 'Test'}]} as any;

  it('prefills account address without overwriting contact edits made while loading', () => {
    spyOnProperty(component, 'loginStatus', 'get').and.returnValue(true);
    component.loadCheckoutProfile();
    component.checkout.phone = '01812345678';
    http.expectOne(r => r.url.endsWith('/checkout/profile/')).flush({customer_name: 'Test User', phone: '01712345678', district: 'Dhaka', thana: 'Savar', zone: 'Zone 1'});
    expect(component.checkout.phone).toBe('01812345678');
    expect(component.checkout.district).toBe('Dhaka');
    expect(component.checkout.zone).toBe('Zone 1');
  });

  it('requests a new authoritative quote when district changes and ignores an older quote', fakeAsync(() => {
    component.cart = cart; component.checkout.payment_method = 'cod'; component.checkout.district = 'Dhaka'; component.requestQuote(); tick(300);
    const old = http.expectOne(r => r.url.endsWith('/checkout/quote/'));
    component.checkout.district = 'Cumilla'; component.districtChanged(); tick(300);
    const latest = http.expectOne(r => r.url.endsWith('/checkout/quote/'));
    expect(latest.request.body.shipping_address.district).toBe('Cumilla');
    latest.flush({grand_total: '1120.00', shipping_total: '120.00'});
    old.flush({grand_total: '1080.00', shipping_total: '80.00'});
    expect(component.quote.shipping_total).toBe('120.00');
  }));

  it('requotes payment methods without retaining a COD fee on prepaid orders', fakeAsync(() => {
    component.cart = cart; component.checkout.district = 'Dhaka'; component.checkout.payment_method = 'cod';
    component.requestQuote(); tick(300);
    const cod = http.expectOne(r => r.url.endsWith('/checkout/quote/'));
    expect(cod.request.body.payment_method).toBe('cod');
    expect(cod.request.body.phone).toBe(component.checkout.phone);
    cod.flush({grand_total: '1090.00', shipping_total: '80.00', cod_total: '10.00'});
    component.checkout.payment_method = 'wallet'; component.requestQuote(); tick(300);
    const wallet = http.expectOne(r => r.url.endsWith('/checkout/quote/'));
    expect(wallet.request.body.payment_method).toBe('wallet');
    wallet.flush({grand_total: '1080.00', shipping_total: '80.00', cod_total: '0.00'});
    expect(component.quote.cod_total).toBe('0.00');
    expect(component.quote.grand_total).toBe('1080.00');
  }));

  it('sends edited delivery fields and quoted total in one checkout request', () => {
    component.cart = cart; component.quote = {grand_total: '1120.00'};
    Object.assign(component.checkout, {customer_name: 'Receiver', district: 'Cumilla', thana: 'Sadar', zone: 'Zone 2', address: 'House 5', phone: '01712345678', phone_alternate: '01812345678', payment_method: 'bkash', transaction_id: 'ABC12345'});
    component.placeOrder();
    const request = http.expectOne(r => r.url.endsWith('/checkout/'));
    expect(request.request.body.shipping_address.zone).toBe('Zone 2');
    expect(request.request.body.phone_alternate).toBe('01812345678');
    expect(request.request.body.quoted_total).toBe('1120.00');
    expect(request.request.body.transaction_id).toBe('ABC12345');
    request.flush({number: 'CH-TEST', tracking_token: 'private', grand_total: '1120', status: 'pending'});
    http.expectNone(r => r.url.includes('/payments/'));
    expect(component.completedOrder.number).toBe('CH-TEST');
  });

  it('does not place an order without a reviewed final quote', () => {
    component.cart = cart; component.placeOrder();
    http.expectNone(r => r.url.endsWith('/checkout/'));
    expect(snack.open).toHaveBeenCalled();
  });

  it('ignores a previous account cart response after the session changes', () => {
    spyOnProperty(component, 'loginStatus', 'get').and.returnValue(false);
    component.loadCart('old-cart');
    const old = http.expectOne(r => r.url.endsWith('/cart/old-cart/'));
    component.sessionChanged();
    http.expectOne(r => r.url.endsWith('/ecommerce/cart/')).flush({token: null, items: [], subtotal: 0});
    old.flush(cart);
    expect(component.cart?.items.length).toBe(0);
    expect(localStorage.getItem('cheradipEcommerceCart')).toBeNull();
  });

  it('sends brand, price and availability filters and clears them together', () => {
    component.selectedBrand = 'test'; component.minPrice = 10; component.maxPrice = 200; component.inStockOnly = true;
    component.loadProducts();
    const request = http.expectOne(r => r.url.endsWith('/products/'));
    expect(request.request.params.get('brand')).toBe('test');
    expect(request.request.params.get('in_stock')).toBe('true');
    expect(request.request.params.get('min_price')).toBe('10');
    request.flush({count: 0, results: []});
    http.match(r => r.url.includes('/categories/') || r.url.includes('/price-range/')).forEach(r => r.flush(r.request.url.includes('categories') ? [] : {max_price: '0'}));
    component.resetCatalog();
    const reset = http.expectOne(r => r.url.endsWith('/products/'));
    expect(reset.request.params.has('brand')).toBeFalse();
    expect(reset.request.params.has('min_price')).toBeFalse();
    reset.flush({count: 0, results: []});
    http.match(r => r.url.includes('/categories/') || r.url.includes('/price-range/')).forEach(r => r.flush(r.request.url.includes('categories') ? [] : {max_price: '0'}));
  });

  it('lists all 64 districts when division is empty and fills division from a chosen district', () => {
    component.checkout.division = '';
    component.loadAddressDistricts();
    expect(component.districts.length).toBe(64);
    component.checkout.district = 'Cumilla';
    component.districtChanged();
    expect(component.checkout.division).toBe('Chattogram');
    expect(component.districts).toEqual(['Cumilla', 'Chattogram']);
  });

  it('filters districts after a division is chosen and restores all 64 when it is cleared', () => {
    component.checkout.division = 'Dhaka';
    component.divisionChanged();
    expect(component.checkout.district).toBe('');
    expect(component.districts).toEqual(['Dhaka', 'Gazipur']);
    component.checkout.division = '';
    component.divisionChanged();
    expect(component.districts.length).toBe(64);
  });

  it('keeps round-up off the quote lines and exposes the signed amount on total hover', () => {
    expect(component.roundingHoverNote({rounding_adjustment: 0.12})).toBe('Round-up adjustment +৳0.12');
    expect(component.roundingHoverNote({rounding_adjustment: '0.90'})).toBe('Round-up adjustment +৳0.90');
    expect(component.roundingHoverNote({rounding_adjustment: 0})).toBe('');
  });
});
