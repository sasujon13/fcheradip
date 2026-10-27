import { EcommerceComingSoonComponent } from './ecommerce-coming-soon.component';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { defer, NEVER, of, throwError } from 'rxjs';

describe('Marketplace browsing controls', () => {
  let component: EcommerceComingSoonComponent;
  beforeEach(() => {
    component = new EcommerceComingSoonComponent(null as any, null as any, null as any, null as any, null as any, null as any);
    component.categories = [
      { id: 1, name: 'Mobile Accessories', slug: 'mobile-accessories', product_count: 10 },
      { id: 2, name: 'Books & Stationery', slug: 'books', product_count: 12 },
    ];
  });

  it('previews two price handles without fetching until released and prevents crossing', () => {
    const load = spyOn(component,'loadProducts');
    component.priceRangeLoading=false; component.priceRangeMax=1000; component.priceUpper=1000;
    const event=(value:number)=>({target:{value:String(value)}} as unknown as Event);
    component.movePriceHandle(event(600),'upper');
    expect(component.priceLower).toBe(0); expect(component.priceUpper).toBe(600);
    expect(load).not.toHaveBeenCalled(); expect(component.maxPrice).toBeNull();
    component.applyPriceRange();
    expect(component.maxPrice).toBe(600); expect(load).toHaveBeenCalledTimes(1);
    component.movePriceHandle(event(200),'lower');
    expect(load).toHaveBeenCalledTimes(1);
    component.applyPriceRange(); expect(component.minPrice).toBe(200);
    component.movePriceHandle(event(900),'lower'); expect(component.priceLower).toBe(600);
    component.movePriceHandle(event(50),'upper'); expect(component.priceUpper).toBe(600);
  });

  it('restores the full slider range when filters reset', () => {
    spyOn(component,'loadProducts'); component.priceRangeMax=1000;
    component.priceLower=200; component.priceUpper=600; component.minPrice=200; component.maxPrice=600;
    component.resetCatalog();
    expect(component.priceLower).toBe(0); expect(component.priceUpper).toBe(1000);
    expect(component.minPrice).toBeNull(); expect(component.maxPrice).toBeNull();
  });

  it('searches departments case-insensitively without changing their data', () => {
    component.categorySearch = '  MOBILE  ';
    expect(component.visibleCategories.map(category => category.slug)).toEqual(['mobile-accessories']);
    expect(component.categories.length).toBe(2);
  });

  it('features the most populated top-level departments instead of API order', () => {
    component.categories = [
      {id: 1, name: 'Books', slug: 'books', product_count: 20},
      {id: 2, name: 'Clothing', slug: 'clothing', product_count: 200},
      {id: 3, name: 'Hoodies', slug: 'hoodies', parent_id: 2, product_count: 150},
      {id: 4, name: 'Electronics', slug: 'electronics', product_count: 100},
    ];
    expect(component.featuredCategories.map(category => category.slug)).toEqual(['clothing', 'electronics', 'books']);
  });

  it('limits filter height to available viewport space before and after sticky positioning', () => {
    const panel=document.createElement('aside');
    const box=spyOn(panel,'getBoundingClientRect').and.returnValue({width:220,top:window.innerHeight-220} as DOMRect);
    (component as any).filterPanel=panel;
    (component as any).updateFilterViewport();
    expect(panel.style.getPropertyValue('--filter-available-height')).toBe('188px');
    box.and.returnValue({width:220,top:128} as DOMRect);
    (component as any).updateFilterViewport();
    expect(panel.style.getPropertyValue('--filter-available-height')).toBe(`${Math.floor(window.innerHeight-160)}px`);
  });

  it('keeps matching subcategories with their ancestors and nesting depth', () => {
    component.categories = [
      {id: 1, name: 'Clothing', slug: 'clothing', product_count: 4},
      {id: 2, name: 'Tops', slug: 'clothing-tops', parent_id: 1, product_count: 4},
      {id: 3, name: 'Hoodies', slug: 'clothing-tops-hoodies', parent_id: 2, product_count: 4},
    ];
    component.categorySearch = 'hoodies';
    expect(component.visibleCategories.map(c => c.name)).toEqual(['Clothing','Tops','Hoodies']);
    expect(component.visibleCategories.map(c => c.depth)).toEqual([0,1,2]);
  });

  it('collapses descendants, filters parents, and hides a single redundant leaf', () => {
    spyOn(component,'loadProducts');
    component.categories=[
      {id:1,name:'Automotive',slug:'auto',product_count:2},
      {id:2,name:'Accessories',slug:'accessories',parent_id:1,product_count:2},
      {id:3,name:'Clothing',slug:'clothing',product_count:4},
      {id:4,name:'Tops',slug:'tops',parent_id:3,product_count:2},
      {id:5,name:'Bottoms',slug:'bottoms',parent_id:3,product_count:2}];
    expect(component.visibleCategories.map(c=>c.slug)).toEqual(['auto','clothing']);
    expect(component.visibleCategories[0].hasChildren).toBeFalse();
    component.selectCategoryNode(component.visibleCategories[1]);
    expect(component.selectedCategory).toBe('clothing');
    expect(component.visibleCategories.map(c=>c.slug)).toEqual(['auto','clothing','bottoms','tops']);
    component.selectCategoryNode(component.visibleCategories[1]);
    expect(component.visibleCategories.length).toBe(2);
    expect(component.loadProducts).toHaveBeenCalledTimes(2);
  });

  it('suppresses blank descriptions including markup and nonbreaking spaces',()=>{
    expect(component.meaningfulText('<p> &nbsp; </p>')).toBe('');
    expect(component.meaningfulText('Cotton')).toBe('Cotton');
  });

  it('waits for a cart size change before accepting order submission',()=>{
    component.cart={token:'test',items:[{id:1}]} as any;
    component.changingCartItems.add(1);
    const notify=spyOn(component as any,'notify');
    component.placeOrder();
    expect(notify).toHaveBeenCalledWith('Please wait for your size or option change to finish.',true);
  });

  it('does not change cart options after order submission has begun',()=>{
    component.cart={token:'test',items:[{id:1}]} as any;
    component.loading=true;
    component.changeCartSize({id:1,requested_size:'M'} as any,'L');
    component.changeCartVariant({id:1,variant_id:2} as any,3);
    expect(component.changingCartItems.size).toBe(0);
  });

  it('changes the exact cart variant atomically and refreshes totals from the response', () => {
    const updated = {token: 'cart-token', items: [], subtotal: 120};
    const http = {patch: jasmine.createSpy('patch').and.returnValue(of(updated))};
    const c = new EcommerceComingSoonComponent(http as any,null as any,null as any,null as any,null as any,null as any);
    c.cart = {token:'cart-token',items:[],subtotal:100};
    const remember = spyOn(c as any,'rememberCart'); spyOn(c as any,'notify');
    c.changeCartVariant({id:4,variant_id:10} as any,11);
    expect(http.patch).toHaveBeenCalledWith(jasmine.stringMatching(/\/cart\/cart-token\/$/),{item_id:4,variant_id:11});
    expect(remember).toHaveBeenCalledWith(updated);
    expect(c.changingCartItems.size).toBe(0);
  });

  it('hides only a single default variant, preserving named or multiple options',()=>{
    component.selectedProduct={variants:[{id:1,title:'Default',is_active:true,stock:1}]} as any;
    expect(component.showVariantChoice).toBeFalse();
    component.selectedProduct={variants:[{id:1,title:'Red / Large',is_active:true,stock:1}]} as any;
    expect(component.showVariantChoice).toBeTrue();
    component.selectedProduct={variants:[{id:1,title:'Default',is_active:true,stock:1},{id:2,title:'Blue',is_active:true,stock:1}]} as any;
    expect(component.showVariantChoice).toBeTrue();
  });

  it('uses local editable contact numbers and omits removed address fields',()=>{
    const http={get:()=>of({phone:'1722710298',phone_alternate:'1822710298',country_code:'+880',
      city:'Old city',postal_code:'5200',district:'Dinajpur',address:'Sadar'})};
    const c=new EcommerceComingSoonComponent(http as any,null as any,null as any,null as any,null as any,null as any);
    spyOnProperty(c,'loginStatus','get').and.returnValue(true);spyOn(c,'loadAddressDistricts');spyOn(c,'loadAddressThanas');spyOn(c,'requestQuote');
    c.loadCheckoutProfile();expect(c.checkout.phone).toBe('01722710298');
    expect(c.checkout.phone_alternate).toBe('01822710298');
    const address=(c as any).shippingAddress();expect(address.country_code).toBe('BD');
    expect(address.district).toBe('Dinajpur');expect(address.city).toBeUndefined();expect(address.postal_code).toBeUndefined();
  });

  it('keeps COD selected for a confirmation-only cart', () => {
    const quote=spyOn(component,'requestQuote');
    component.checkout.payment_method='cod';
    (component as any).rememberCart({token:'synthetic',items:[{stock_confirmation_required:true,quantity:1}]} as any);
    expect(component.cartNeedsConfirmation).toBeTrue();
    expect(component.checkout.payment_method).toBe('cod');
    expect(quote).toHaveBeenCalledTimes(1);
    localStorage.removeItem('cheradipEcommerceCart');
  });

  it('requires an exact structured color and size combination', () => {
    component.selectedProduct = {variants: [
      {id: 1, title: 'Red / M', is_active: true, stock: 2, option1_name: 'Color', option1_value: 'Red', option2_name: 'Size', option2_value: 'M'},
      {id: 2, title: 'Blue / L', is_active: true, stock: 1, option1_name: 'Color', option1_value: 'Blue', option2_name: 'Size', option2_value: 'L'},
    ]} as any;
    expect(component.structuredOptionGroups.map(group => group.name)).toEqual(['Color', 'Size']);
    component.selectStructuredOption('Color', 'Red');
    expect(component.structuredValueAvailable('Size', 'L')).toBeFalse();
    expect(component.structuredValueAvailable('Size', 'M')).toBeTrue();
    component.selectStructuredOption('Size', 'L');
    expect(component.selectedVariantId).toBeNull();
    component.selectStructuredOption('Size', 'M');
    expect(component.selectedVariantId).toBe(1);
    component.selectStructuredOption('Color', 'Blue');
    expect(component.selectedOptionValues['Size']).toBe('');
    expect(component.selectedVariantId).toBeNull();
  });

  it('starts checkout with Cash on Delivery selected', () => {
    expect(component.checkout.payment_method).toBe('cod');
  });

  it('opens details without destroying the filtered catalog', () => {
    const route = {snapshot: {paramMap: {get: () => null}}};
    const router = {navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true))};
    const detail = {slug: 'sample-item', name: 'Sample item', variants: [], images: [], approved_reviews: []};
    const http = {get: () => of(detail), post: () => of({state: 'not_applicable'})};
    const c = new EcommerceComingSoonComponent(http as any, route as any, router as any, null as any, null as any, null as any);
    c.openProduct({slug: 'sample-item', name: 'Sample item'} as any);
    expect(router.navigate).toHaveBeenCalledWith([], {queryParams: {product: 'sample-item'}, queryParamsHandling: 'merge'});
    expect(c.selectedProduct?.slug).toBe('sample-item');
  });

  it('loads details for the product route slug', () => {
    const detail = {id: 7, slug: 'sample-item', name: 'Full product', variants: [], images: [], approved_reviews: []};
    const http = {
      get: jasmine.createSpy('get').and.returnValue(of(detail)),
      post: jasmine.createSpy('post').and.returnValue(of({state: 'recently_checked', last_checked_at: '2026-10-25T14:00:00Z'})),
    };
    const route = {snapshot: {paramMap: {get: () => 'sample-item'}}};
    const c = new EcommerceComingSoonComponent(http as any, route as any, null as any, null as any, null as any, null as any);
    c.openProduct({slug: 'sample-item'} as any);
    expect(http.get).toHaveBeenCalledWith(jasmine.stringMatching(/\/products\/sample-item\/$/));
    expect(http.post).toHaveBeenCalledWith(jasmine.stringMatching(/\/products\/sample-item\/source-refresh\/$/), {});
    expect(c.selectedProduct?.name).toBe('Full product');
    expect(c.productDetailLoading).toBeFalse();
  });

  it('keeps the chosen payment method for available products with unspecified quantity', () => {
    spyOn(component,'requestQuote');
    component.checkout.payment_method='wallet';
    (component as any).rememberCart({token:'synthetic',items:[{stock_confirmation_required:false,quantity_unspecified:true,quantity:1}]} as any);
    expect(component.cartQuantityUnspecified).toBeTrue();
    expect(component.cartNeedsConfirmation).toBeFalse();
    expect(component.checkout.payment_method).toBe('wallet');
    localStorage.removeItem('cheradipEcommerceCart');
  });

  it('does not silently switch payment methods for a confirmation cart', () => {
    const quote=spyOn(component,'requestQuote');
    spyOn(component as any,'notify');
    component.cart={token:'synthetic',items:[{stock_confirmation_required:true}]} as any;
    component.checkout.payment_method='bank';component.quote={grand_total:'200'} as any;
    component.placeOrder();
    expect(component.checkout.payment_method).toBe('bank');expect(quote).not.toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('never represents company artwork or a missing/broken image as a product photo', () => {
    expect(component.hasProductPhoto('')).toBeFalse();
    expect(component.hasProductPhoto('assets/images/cheradip.svg')).toBeFalse();
    expect(component.hasProductPhoto('https://cheradip.com/assets/cheradip/cheradip-avatar.png')).toBeFalse();
    const url = 'https://supplier.example/product-original.jpg';
    expect(component.hasProductPhoto(url)).toBeTrue();
    component.productPhotoFailed(url);
    expect(component.hasProductPhoto(url)).toBeFalse();
  });

  it('does not fall back to another colour or the logo when a selected variant has no photo', () => {
    component.selectedVariantId = 2;
    component.selectedProduct = {images: [{id: 1, variant_id: 1, url: 'https://supplier.example/red.jpg', alt_text: 'Red'}]} as any;
    component.selectVariantImage();
    expect(component.activeImage).toBe('');
  });

  it('shows all departments for an empty search and none for no match', () => {
    expect(component.visibleCategories.length).toBe(2);
    component.categorySearch = 'no such department';
    expect(component.visibleCategories).toEqual([]);
  });
  it('hides explicitly empty collections from customer browsing without changing the source response', () => {
    const data = [{id:1,name:'Empty',slug:'empty',product_count:0},
      {id:2,name:'Available',slug:'available',product_count:2}];
    const http = {get: jasmine.createSpy('get').and.returnValue(of(data))};
    const c = new EcommerceComingSoonComponent(http as any,null as any,null as any,null as any,null as any,null as any);
    c.loadCategories();
    expect(c.categories.map(x=>x.slug)).toEqual(['available']);
    expect(data.length).toBe(2);
  });

  it('retries category failures silently and shows the error only at three minutes', fakeAsync(() => {
    let attempts=0;
    const http={get:()=>defer(()=>{attempts++; return throwError(()=>new HttpErrorResponse({status:500}));})};
    const c=new EcommerceComingSoonComponent(http as any,null as any,null as any,null as any,null as any,null as any);
    const notify=spyOn(c as any,'notify');c.loadCategories();
    tick(179999);
    expect(attempts).toBeGreaterThan(3); expect(c.error).toBe('');expect(notify).not.toHaveBeenCalled();
    expect(c.categoriesLoading).toBeTrue();
    tick(1);
    expect(c.error).toContain('after 3 minutes');expect(c.error).toContain('HTTP 500');
    expect(c.categoriesLoading).toBeFalse();expect(c.categoriesLoadFailed).toBeTrue();
    expect(notify).toHaveBeenCalledTimes(1);
    const ended=attempts;tick(60000);expect(attempts).toBe(ended);
  }));

  it('recovers categories during retries without a later error notification', fakeAsync(() => {
    let attempts=0;
    const http={get:()=>defer(()=>++attempts<3 ? throwError(()=>new HttpErrorResponse({status:500})) : of([{id:1,name:'Books',slug:'books',product_count:2}]))};
    const c=new EcommerceComingSoonComponent(http as any,null as any,null as any,null as any,null as any,null as any);
    const notify=spyOn(c as any,'notify');c.loadCategories();tick(6000);
    expect(c.categories[0].slug).toBe('books');expect(c.categoriesLoading).toBeFalse();
    tick(180000);expect(notify).not.toHaveBeenCalled();expect(c.categoriesLoadFailed).toBeFalse();
  }));

  it('cancels category retries when leaving the page, even for hung requests', fakeAsync(() => {
    let attempts=0;const http={get:()=>defer(()=>{attempts++;return NEVER;})};
    const c=new EcommerceComingSoonComponent(http as any,null as any,null as any,null as any,null as any,null as any);
    const notify=spyOn(c as any,'notify');c.loadCategories();tick(23000);
    expect(attempts).toBe(2);c.ngOnDestroy();tick(180000);
    expect(attempts).toBe(2);expect(notify).not.toHaveBeenCalled();
  }));

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
    expect(component.discountPercent({price:'7',compare_at_price:'8'} as any)).toBe(12);
    expect(component.discountPercent({price:'63',compare_at_price:'70',discount_percent:10} as any)).toBe(10);
    expect(component.discountPercent({ ...product, compare_at_price: null })).toBe(0);
    expect(component.discountPercent({ ...product, compare_at_price: '50' })).toBe(0);
    expect(component.discountPercent({ ...product, price: 'invalid' })).toBe(0);
    expect(component.discountPercent({ ...product, price: '-10' })).toBe(0);
  });

  it('continues to count quantities, not just cart lines', () => {
    component.cart = { token: 'test-only', items: [{ quantity: 2 }, { quantity: 3 }], subtotal: 100 } as any;
    expect(component.cartCount).toBe(5);
  });

  it('slides relevant photos without showing another variant and honours manual pause', fakeAsync(() => {
    component.selectedVariantId = 1;
    component.selectedProduct = {images:[{url:'one'},{url:'two',variant_id:1},{url:'other',variant_id:2},{url:'one'}]} as any;
    component.activeImage='one';
    spyOn(window,'matchMedia').and.returnValue({matches:false} as MediaQueryList);
    expect(component.galleryImages.map(i=>i.url)).toEqual(['one','two']);
    component.startGallery();tick(5000);expect(component.activeImage).toBe('two');
    component.galleryHover=true;tick(5000);expect(component.activeImage).toBe('two');
    component.galleryHover=false;component.chooseGalleryImage('one');tick(5000);expect(component.activeImage).toBe('one');
    component.stopGallery();tick(5000);expect(component.activeImage).toBe('one');
  }));

  it('does not start automatic slides for reduced motion', fakeAsync(() => {
    component.selectedProduct={images:[{url:'one'},{url:'two'}]} as any;component.activeImage='one';
    spyOn(window,'matchMedia').and.returnValue({matches:true} as MediaQueryList);
    component.startGallery();tick(10000);expect(component.activeImage).toBe('one');
  }));

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
    component = new EcommerceComingSoonComponent(TestBed.inject(HttpClient), { snapshot: { data: {} } } as any, { navigate: () => Promise.resolve(true) } as any, null as any, null as any, null as any);
    spyOn<any>(component, 'nearCatalogEnd').and.returnValue(false);
  });
  afterEach(() => { component.ngOnDestroy(); http.verify(); });


  it('shows 4 first, builds through 8 and 12, then loads 12 at a time and holds one batch in reserve', fakeAsync(() => {
    component.loadProducts();
    batch(0, 4);
    expect(component.products.length).toBe(4);
    expect(component.catalogLoading).toBeFalse();
    expect(component.productCount).toBe(200);
    batch(4, 8); tick(450);
    expect(component.products.length).toBe(12);
    for (let offset = 12; offset < 120; offset += 12) {
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
    batch(0, 4);
    batch(4, 8); tick(450);
    for (let offset = 12; offset < 120; offset += 12) { batch(offset, 12); tick(450); }
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
    component.loadProducts(); batch(0, 4);
    http.expectNone(req => req.params.get('offset') === '4');
    component.setView('shop'); batch(4, 8);
    component.setView('cart'); tick(500);
    expect(component.products.length).toBe(5);
    batch(12, 12, 48);
    component.setView('shop'); tick(1000);
    batch(24, 12, 48); tick(500);
    batch(36, 12, 48); tick(500);
    expect(component.products.length).toBe(48);
  }));

  it('keeps rendered products after a background failure and retries the same offset', fakeAsync(() => {
    component.loadProducts(); batch(0, 4);
    http.expectOne(req => req.params.get('offset') === '4').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.products.length).toBe(4);
    expect(component.catalogError).toBeTruthy();
    component.loadMoreProducts(); batch(4, 8, 36); tick(450);
    batch(12, 12, 36); tick(450);
    batch(24, 12, 36); tick(450);
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

  it('stops on empty and final short batches', fakeAsync(() => {
    component.loadProducts(); batch(0, 4, 5); batch(4, 8, 5); tick(50);
    expect(component.products.length).toBe(5);
    expect(component.hasMoreProducts).toBeFalse();
    component.loadProducts(); batch(0, 4, 0);
    expect(component.products.length).toBe(0);
    expect(component.loadingMore).toBeFalse();
  }));

  it('cancels background requests and reveal timers on destruction', fakeAsync(() => {
    component.loadProducts(); batch(0, 4); batch(4, 8);
    const pending = http.expectOne(req => req.params.get('offset') === '12');
    component.ngOnDestroy(); tick(1000);
    expect(pending.cancelled).toBeTrue();
    expect(component.products.length).toBe(5);
  }));
});
