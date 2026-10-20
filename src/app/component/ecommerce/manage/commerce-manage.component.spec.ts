import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError, Subject, NEVER } from 'rxjs';
import { CommerceManageComponent } from './commerce-manage.component';
import { CommerceManagementGuard, CommerceManagementService } from '../../../service/commerce-management.service';

describe('marketplace business manager', () => {
  const allPermissions = Object.fromEntries(['product','productvariant','productimage','category','brand','order','payment',
    'inventorymovement','shipment','coupon','review','commercenotification','importjob','book','deliverysettings'].map(name =>
      [name, {view: true, add: true, change: true, delete: true}]));
  let service: any; let router: any;
  beforeEach(async () => {
    service = {url: '/api/ecommerce/admin', access: () => of({allowed: true, permissions: allPermissions}), http: {
      get: jasmine.createSpy('get').and.callFake((url: string) => of(url.endsWith('/dashboard/') ? {products: 12, revenue: '50.00'} : {results: [], count: 0, next: null})),
      post: jasmine.createSpy('post').and.returnValue(of({})), patch: jasmine.createSpy('patch').and.returnValue(of({})),
    }};
    router = {url: '/ecommerce/manage', parseUrl: () => ({queryParams: {}}), navigate: jasmine.createSpy('navigate').and.resolveTo(true),
      createUrlTree: jasmine.createSpy('tree').and.returnValue({redirect: true}), createUrlTreeFromSnapshot: () => ({})};
    await TestBed.configureTestingModule({imports: [CommerceManageComponent, RouterTestingModule], providers: [
      {provide: CommerceManagementService, useValue: service},
      {provide: MatSnackBar, useValue: {open: () => ({})}},
    ]}).compileComponents();
  });

  it('compiles the complete staff template and shows available business sections', async () => {
    const fixture = TestBed.createComponent(CommerceManageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Business Manager');
    expect(fixture.componentInstance.visibleSections.map(s => s.key)).toContain('products');
    expect(fixture.componentInstance.visibleSections.map(s => s.key)).toContain('books');
    expect(fixture.componentInstance.canAddProduct).toBeTrue();
    fixture.componentInstance.editProduct();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="product-name"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="delivery-dhaka"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="delivery-outside"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="cod-percent"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeTrue();
    fixture.destroy();
  });

  it('does not expose sections or write actions without assigned permissions', () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.access = {allowed: true, permissions: {product: {view: true}}};
    expect(component.visibleSections.map(s => s.key)).toEqual(['products']);
    expect(component.canAddProduct).toBeFalse();
    expect(component.canAdjustStock).toBeFalse();
  });

  it('keeps variants and specifications, but does not rewrite unchanged images', () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.access = {allowed: true, permissions: allPermissions};
    component.editProduct({id: 1, name: 'Own product', slug: 'own', category: 1, variants: [{id: 4, sku: 'SKU', price: '10', stock: 8}],
      images: [{id: 2, url: 'https://example.com/image.png'}], attributes: {Warranty: '1 year', dimensions: {width: 20}, reusable: true}});
    const payload = (component as any).productPayload();
    expect(payload.variants[0].id).toBe(4);
    expect(payload.variants[0].stock).toBeUndefined();
    expect(payload.attributes.Warranty).toBe('1 year');
    expect(payload.attributes.dimensions).toEqual({width: 20});
    expect(payload.attributes.reusable).toBeTrue();
    expect(payload.images).toBeUndefined();
    component.editor.images.push({url: 'https://example.com/new.png'});
    expect((component as any).productPayload().images.length).toBe(2);
    component.editor.variants[0].stock = 9;
    expect((component as any).productPayload().variants[0]).toEqual(jasmine.objectContaining({stock: 9, expected_stock: 8}));
  });

  it('preserves zero overrides and sends blanks as inherited central defaults', () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.access = {allowed: true, permissions: allPermissions};
    component.editProduct();
    let payload = (component as any).productPayload();
    expect(payload.cod_percent).toBeNull(); expect(payload.delivery_dhaka_charge).toBeNull();
    component.editor.cod_percent = 0; component.editor.delivery_dhaka_charge = '0';
    component.editor.delivery_outside_dhaka_charge = '175.00';
    payload = (component as any).productPayload();
    expect(payload.cod_percent).toBe(0); expect(payload.delivery_dhaka_charge).toBe('0');
    expect(payload.delivery_outside_dhaka_charge).toBe('175.00');
    component.editor.cod_percent = ''; component.editor.delivery_dhaka_charge = null;
    payload = (component as any).productPayload();
    expect(payload.cod_percent).toBeNull(); expect(payload.delivery_dhaka_charge).toBeNull();
    component.section = component.sections.find(s => s.key === 'delivery-settings')!;
    component.editRecord({id: 1, dhaka_charge: '80.00', outside_dhaka_charge: '120.00', cod_percent: '1.00'});
    expect(component.fields.map(f => f.key)).toContain('cod_percent');
  });

  it('waits for explicit confirmation before changing an order or payment', async () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.load = async () => {};
    component.requestUpdate('orders', 'CH-TEST', {status: 'completed'}, 'Complete?', 'Review this order.');
    expect(service.http.patch).not.toHaveBeenCalled();
    await component.confirmAction();
    expect(service.http.patch).toHaveBeenCalledWith('/api/ecommerce/admin/orders/CH-TEST/', {status: 'completed'});
  });

  it('previews all listing costs without changing the price until applied', async () => {
    const changeDetector = {detectChanges: jasmine.createSpy('detectChanges')};
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any, changeDetector as any);
    component.access = {allowed: true, permissions: allPermissions}; component.editProduct();
    const variant = component.editor.variants[0];
    variant._use_default_costs = false;
    variant.cost_price = 500; variant.price = '700.00'; variant.pricing_inputs.ads_cost = 100;
    expect(variant.pricing_inputs.customer_delivery_charge).toBe(75);
    service.http.post.and.returnValue(of({suggested_price: '690.00', total_cost: '600.00', markup_percent: '15'}));
    await component.calculatePricing(variant);
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/pricing/preview/', {source_cost:500, costs:variant.pricing_inputs, use_defaults:false, weight_grams:0});
    expect(variant.price).toBe('700.00'); expect(component.pricingReady(variant)).toBeTrue();
    expect(changeDetector.detectChanges).toHaveBeenCalled();
    component.applyPricing(variant); expect(variant.price).toBe('690.00');
    variant.pricing_inputs.ads_cost = 200;
    expect(component.pricingReady(variant)).toBeFalse(); component.applyPricing(variant);
    expect(variant.price).toBe('690.00');
    expect((component as any).productPayload().variants[0].pricing_inputs.ads_cost).toBe(200);
  });

  it('inherits central costs and sends actual weight without persisting draft-only controls', async () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.access = {allowed: true, permissions: allPermissions}; component.editProduct();
    const variant = component.editor.variants[0]; variant.cost_price = 500; variant.weight_grams = 1000;
    expect(variant._use_default_costs).toBeTrue();
    const costs = {supplier_delivery_max:'160.00',customer_delivery_charge:'75.00',ads_cost:'275.00',packaging_cost:'11.00',returns_allowance:'48.75',other_costs:'0.00'};
    service.http.post.and.returnValue(of({costs, suggested_price:'1020.92',estimated_weight:false}));
    await component.calculatePricing(variant);
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/pricing/preview/',jasmine.objectContaining({source_cost:500,use_defaults:true,weight_grams:1000}));
    expect(variant.pricing_inputs).toEqual(costs); expect(component.pricingReady(variant)).toBeTrue();
    component.applyPricing(variant);
    const payload = (component as any).productPayload().variants[0];
    expect(payload.price).toBe('1020.92'); expect(payload.pricing_inputs).toEqual({});
    expect(payload._use_default_costs).toBeUndefined();
    variant.weight_grams = 1500; expect(component.pricingReady(variant)).toBeFalse();
  });

  it('renders and submits editable central cost and courier bands without private UI fields', async () => {
    const fixture = TestBed.createComponent(CommerceManageComponent);
    const component = fixture.componentInstance;
    component.ngOnInit = async () => {};
    component.access = {allowed:true,permissions:allPermissions};
    component.section = component.sections.find(s => s.key === 'delivery-settings')!;
    component.editRecord({id:1,dhaka_charge:'80.00',outside_dhaka_charge:'120.00',cod_percent:'1.00',unpaid_reservation_hours:24,
      cost_defaults:{ads_cost:'250.00',packaging_cost:'11.00',returns_allowance:'48.75',other_costs:'0.00'},
      courier_profiles:[{name:'Test Courier',source_url:'https://example.com/rates',reviewed_on:'2026-10-20',zones:{dhaka:{bands:[{up_to_grams:1000,charge:'70.00'}],extra_per_kg:'15.00',max_weight_grams:2000}}}]});
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('label')) as HTMLLabelElement[];
    expect(Number(labels.find(label => label.textContent?.includes('Ads Cost'))?.querySelector('input')?.value)).toBe(250);
    expect(labels.find(label => label.textContent?.includes('Up to weight'))?.querySelector('input')?.value).toBe('1000');
    const payload = (component as any).recordPayload();
    expect(Object.keys(payload.cost_defaults).sort()).toEqual(['ads_cost','other_costs','packaging_cost','returns_allowance']);
    expect(payload.cost_defaults.ads_cost).toBe('250.00');
    expect(payload.courier_profiles[0].zones.dhaka.bands[0].charge).toBe('70.00');
    fixture.destroy();
  });

  it('ignores a calculator reply if costs or the open product changed', async () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.access = {allowed: true, permissions: allPermissions}; component.editProduct();
    const variant = component.editor.variants[0]; variant.cost_price = 100;
    const result = new Subject<any>(); service.http.post.and.returnValue(result);
    const pending = component.calculatePricing(variant);
    variant.cost_price = 200;
    result.next({suggested_price:'109.50'}); result.complete(); await pending;
    expect(component.pricingReady(variant)).toBeFalse();
    const result2 = new Subject<any>(); service.http.post.and.returnValue(result2);
    const pending2 = component.calculatePricing(variant); component.closeEditor();
    result2.next({suggested_price:'218.00'}); result2.complete(); await pending2;
    expect(component.pricingPreviews.size).toBe(0);
  });

  it('ends a stalled calculation after fifteen seconds with a clear retry message', fakeAsync(() => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.editProduct(); const variant = component.editor.variants[0]; variant.cost_price = 100;
    service.http.post.and.returnValue(NEVER);
    component.calculatePricing(variant); expect(component.pricingLoading.has(variant)).toBeTrue();
    tick(15001); flushMicrotasks();
    expect(component.pricingLoading.has(variant)).toBeFalse();
    expect(component.pricingErrors.get(variant)).toContain('timed out');
  }));

  it('clears private records immediately when the signed-in account changes', () => {
    const component = new CommerceManageComponent(service, router, {open: () => {}} as any);
    component.records = [{customer_name: 'Private customer'}]; component.stats = {revenue: 50};
    component.sessionChanged();
    expect(component.records).toEqual([]);
    expect(component.access.allowed).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/ecommerce']);
  });

  it('guards direct URLs using server permissions, including failure', async () => {
    const guard = new CommerceManagementGuard(service, router);
    service.access = () => of({allowed: false, permissions: {}});
    let result: any;
    guard.canActivate({} as any, {url: '/ecommerce/manage'} as any).subscribe(value => result = value);
    expect(result).toEqual({redirect: true});
    service.access = () => throwError(() => ({status: 401}));
    guard.canActivate({} as any, {url: '/ecommerce/manage'} as any).subscribe(value => result = value);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {queryParams: {returnUrl: '/ecommerce/manage'}});
    router.createUrlTree.calls.reset();
    service.access = () => of({allowed: false, authenticated: false, permissions: {}});
    guard.canActivate({} as any, {url: '/ecommerce/manage'} as any).subscribe();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {queryParams: {returnUrl: '/ecommerce/manage'}});
  });
});
