import { EcommerceComingSoonComponent } from './ecommerce-coming-soon.component';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { defer, NEVER, of, throwError } from 'rxjs';

function clearShopNavCache(): void {
  localStorage.removeItem('cheradip.ecommerce.taxonomy.v1');
  localStorage.removeItem('cheradip.ecommerce.last-listings.v1');
  sessionStorage.clear();
}

describe('Marketplace browsing controls', () => {
  let component: EcommerceComingSoonComponent;
  beforeEach(() => {
    clearShopNavCache();
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

  it('rotates every category through the inspiration cards', () => {
    component.categories = [
      {id: 1, name: 'Books', slug: 'books', product_count: 20},
      {id: 2, name: 'Clothing', slug: 'clothing', product_count: 200},
      {id: 3, name: 'Hoodies', slug: 'hoodies', parent_id: 2, product_count: 150},
      {id: 4, name: 'Electronics', slug: 'electronics', product_count: 100},
    ];
    expect(component.visibleInspiration.map(category => category.slug)).toEqual(['clothing', 'hoodies', 'electronics']);
    component.shiftInspiration(1, false);
    expect(component.visibleInspiration.map(category => category.slug)).toEqual(['hoodies', 'electronics', 'books']);
    component.shiftInspiration(1, false);
    component.shiftInspiration(1, false);
    expect(component.visibleInspiration.map(category => category.slug)).toEqual(['books', 'clothing', 'hoodies']);
    expect(component.categoryIcon('Women\'s Fashion')).toBe('fa-female');
    expect(component.categoryIcon('Electronics')).toBe('fa-laptop');
  });

  it('shows only up/down inspiration arrows in a stacked column', () => {
    component.categories = [
      {id: 1, name: 'Books', slug: 'books', product_count: 20},
      {id: 2, name: 'Clothing', slug: 'clothing', product_count: 200},
      {id: 3, name: 'Hoodies', slug: 'hoodies', parent_id: 2, product_count: 150},
      {id: 4, name: 'Electronics', slug: 'electronics', product_count: 100},
    ];
    component.inspirationLayout = 'column';
    expect(component.showInspirationNavVertical).toBeTrue();
    expect(component.showInspirationNavHorizontal).toBeFalse();
  });

  it('shows only left/right inspiration arrows in a single row', () => {
    component.categories = [
      {id: 1, name: 'Books', slug: 'books', product_count: 20},
      {id: 2, name: 'Clothing', slug: 'clothing', product_count: 200},
      {id: 3, name: 'Hoodies', slug: 'hoodies', parent_id: 2, product_count: 150},
      {id: 4, name: 'Electronics', slug: 'electronics', product_count: 100},
    ];
    component.inspirationLayout = 'row';
    expect(component.showInspirationNavVertical).toBeFalse();
    expect(component.showInspirationNavHorizontal).toBeTrue();
  });

  it('hides inspiration arrows when every category already fits', () => {
    component.categories = [
      {id: 1, name: 'Books', slug: 'books', product_count: 20},
      {id: 2, name: 'Clothing', slug: 'clothing', product_count: 200},
      {id: 3, name: 'Electronics', slug: 'electronics', product_count: 100},
    ];
    component.inspirationLayout = 'column';
    expect(component.showInspirationNavVertical).toBeFalse();
    expect(component.showInspirationNavHorizontal).toBeFalse();
    component.inspirationLayout = 'row';
    expect(component.showInspirationNavVertical).toBeFalse();
    expect(component.showInspirationNavHorizontal).toBeFalse();
  });

  it('detects a row or column inspiration track from card positions', () => {
    const track = document.createElement('div');
    const first = document.createElement('button');
    const second = document.createElement('button');
    Object.defineProperty(first, 'offsetTop', {configurable: true, get: () => 0});
    Object.defineProperty(second, 'offsetTop', {configurable: true, get: () => 0});
    track.append(first, second);
    (component as any).introTrackEl = track;
    (component as any).syncInspirationLayout();
    expect(component.inspirationLayout).toBe('row');
    Object.defineProperty(second, 'offsetTop', {configurable: true, get: () => 48});
    (component as any).syncInspirationLayout();
    expect(component.inspirationLayout).toBe('column');
  });

  const fourInspirationCategories = () => {
    component.categories = [
      {id: 1, name: 'Books', slug: 'books', product_count: 20},
      {id: 2, name: 'Clothing', slug: 'clothing', product_count: 200},
      {id: 3, name: 'Hoodies', slug: 'hoodies', parent_id: 2, product_count: 150},
      {id: 4, name: 'Electronics', slug: 'electronics', product_count: 100},
    ];
  };

  const mockInspirationTrack = (layout: 'row' | 'column') => {
    const viewport = document.createElement('div');
    const track = document.createElement('div');
    const card = document.createElement('button');
    Object.defineProperty(card, 'offsetWidth', {configurable: true, get: () => 100});
    Object.defineProperty(card, 'offsetHeight', {configurable: true, get: () => 50});
    Object.defineProperty(viewport, 'clientWidth', {configurable: true, get: () => 318});
    Object.defineProperty(viewport, 'clientHeight', {configurable: true, get: () => 168});
    viewport.appendChild(track);
    track.appendChild(card);
    (component as any).introTrackEl = track;
    component.inspirationLayout = layout;
    spyOn(window, 'matchMedia').and.returnValue({matches: false} as MediaQueryList);
  };

  const captureFrames = () => {
    const frames: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    return frames;
  };

  it('moves the row left on click-right so the next category enters from the right', fakeAsync(() => {
    fourInspirationCategories();
    mockInspirationTrack('row');
    const frames = captureFrames();
    const outgoing = component.visibleInspiration.map(category => category.slug);
    component.shiftInspiration(1, false);
    expect(outgoing).toEqual(['clothing', 'hoodies', 'electronics']);
    expect(component.slidingInspiration.map(category => category.slug)).toEqual([...outgoing, 'books']);
    expect(component.inspirationSlide).toBe(1);
    expect(component.inspirationTransform).toBe('translateX(0px)');
    frames.forEach(frame => frame(0));
    expect(component.inspirationTransform).toBe('translateX(-100px)');
    tick(500);
    expect(component.inspirationSlide).toBe(0);
    expect(component.visibleInspiration.map(category => category.slug)).toEqual(['hoodies', 'electronics', 'books']);
  }));

  it('moves the column up on click-down so the next category enters from the bottom', fakeAsync(() => {
    fourInspirationCategories();
    mockInspirationTrack('column');
    const frames = captureFrames();
    const outgoing = component.visibleInspiration.map(category => category.slug);
    component.shiftInspiration(1, false);
    expect(component.slidingInspiration.map(category => category.slug)).toEqual([...outgoing, 'books']);
    expect(component.inspirationSlide).toBe(1);
    expect(component.inspirationTransform).toBe('translateY(0px)');
    frames.forEach(frame => frame(0));
    expect(component.inspirationTransform).toBe('translateY(-50px)');
    tick(500);
    expect(component.inspirationSlide).toBe(0);
    expect(component.visibleInspiration.map(category => category.slug)).toEqual(['hoodies', 'electronics', 'books']);
  }));

  it('moves the row right on click-left so the previous category enters from the left', fakeAsync(() => {
    fourInspirationCategories();
    mockInspirationTrack('row');
    const frames = captureFrames();
    const outgoing = component.visibleInspiration.map(category => category.slug);
    component.shiftInspiration(-1, false);
    expect(component.slidingInspiration.map(category => category.slug)).toEqual(['books', ...outgoing]);
    expect(component.inspirationSlide).toBe(-1);
    expect(component.inspirationTransform).toBe('translateX(-100px)');
    frames.forEach(frame => frame(0));
    expect(component.inspirationTransform).toBe('translateX(0px)');
    tick(500);
    expect(component.visibleInspiration.map(category => category.slug)[0]).toBe('books');
  }));

  it('moves the column down on click-up so the previous category enters from the top', fakeAsync(() => {
    fourInspirationCategories();
    mockInspirationTrack('column');
    const frames = captureFrames();
    const outgoing = component.visibleInspiration.map(category => category.slug);
    component.shiftInspiration(-1, false);
    expect(component.slidingInspiration.map(category => category.slug)).toEqual(['books', ...outgoing]);
    expect(component.inspirationTransform).toBe('translateY(-50px)');
    frames.forEach(frame => frame(0));
    expect(component.inspirationTransform).toBe('translateY(0px)');
    tick(500);
    expect(component.visibleInspiration.map(category => category.slug)[0]).toBe('books');
  }));

  it('wraps from the first category then down without leftover transform', fakeAsync(() => {
    fourInspirationCategories();
    mockInspirationTrack('column');
    const frames = captureFrames();
    const flush = () => {
      while (frames.length) frames.splice(0).forEach(frame => frame(0));
    };
    component.shiftInspiration(-1, false);
    expect(component.slidingInspiration.map(category => category.slug))
      .toEqual(['books', 'clothing', 'hoodies', 'electronics']);
    flush();
    tick(500);
    flush();
    expect(component.inspirationSlide).toBe(0);
    expect(component.inspirationTransform).toBe('');
    expect(component.visibleInspiration.map(category => category.slug))
      .toEqual(['books', 'clothing', 'hoodies']);
    component.shiftInspiration(1, false);
    expect(component.slidingInspiration.map(category => category.slug))
      .toEqual(['books', 'clothing', 'hoodies', 'electronics']);
    expect(component.inspirationTransform).toBe('translateY(0px)');
    flush();
    expect(component.inspirationTransform).toBe('translateY(-50px)');
    tick(500);
    flush();
    expect(component.inspirationSlide).toBe(0);
    expect(component.inspirationTransform).toBe('');
    expect(component.visibleInspiration.map(category => category.slug))
      .toEqual(['clothing', 'hoodies', 'electronics']);
  }));

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

  it('hides the cart size selector unless there are multiple choosable options',()=>{
    const defaultUnavailable=[{id:1,title:'Default',is_active:true,stock:0,purchasable:false},{id:2,title:'Default',is_active:true,stock:0,purchasable:false}];
    expect(component.cartShowsVariantChoice({available_variants:defaultUnavailable} as any)).toBeFalse();
    expect(component.cartShowsVariantChoice({available_variants:[{id:1,title:'Default',is_active:true,stock:1}]} as any)).toBeFalse();
    expect(component.cartShowsVariantChoice({
      available_variants:[{id:1,title:'M',is_active:true,stock:1},{id:2,title:'L',is_active:true,stock:1}],
    } as any)).toBeTrue();
    expect(component.cartShowsVariantChoice({
      description_sizes:['M','L'],
      available_variants:[{id:1,title:'Default',is_active:true,stock:1},{id:2,title:'Default',is_active:true,stock:1}],
    } as any)).toBeFalse();
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

  it('keeps coupon and referral 1% copy on hover notes', () => {
    expect(component.couponHoverNote).toBe(
      'Only a registered Cheradip mobile number is accepted. That account gets 1% of this subtotal; they can spend it on products or other Cheradip services, or withdraw it. Signup bonus ৳50 can be spent here but cannot be withdrawn.',
    );
  });

  it('hides the round-up amount except as a total payable hover note', () => {
    expect(component.roundingHoverNote({rounding_adjustment: 0.12})).toBe('Round-up adjustment +৳0.12');
    expect(component.roundingHoverNote({rounding_adjustment: 0})).toBe('');
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

  it('keeps product text visible while a real photo is still loading', () => {
    const url = 'https://supplier.example/product-original.jpg';
    expect(component.productPhotoPending({id: 9, image_url: url} as any)).toBeTrue();
    component.markProductPhotoReady(9);
    expect(component.productPhotoPending({id: 9, image_url: url} as any)).toBeFalse();
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
  const flushSidecars = () => {
    http.match(req => req.url.includes('/categories/')).filter(req => !req.cancelled).forEach(req => req.flush([]));
    http.match(req => req.url.includes('/price-range/')).filter(req => !req.cancelled).forEach(req => req.flush({max_price: '0'}));
  };
  const batch = (offset: number, limit = 12, total = 200) => {
    const request = http.expectOne(req => req.url.endsWith('/products/') && req.params.get('offset') === String(offset) && !req.params.get('category'));
    expect(request.request.params.get('limit')).toBe(String(limit));
    if (offset === 0 && !component.productCount) expect(request.request.params.get('omit_count')).toBe('1');
    request.flush({ results: products(offset + 1, Math.min(limit, Math.max(0, total - offset))), count: total, next: offset + limit < total ? 'next' : null });
    flushSidecars();
  };
  beforeEach(() => {
    clearShopNavCache();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    http = TestBed.inject(HttpTestingController);
    component = new EcommerceComingSoonComponent(TestBed.inject(HttpClient), { snapshot: { data: {} } } as any, { navigate: () => Promise.resolve(true) } as any, null as any, null as any, null as any);
    spyOn<any>(component, 'nearCatalogEnd').and.returnValue(false);
  });
  afterEach(() => {
    component.ngOnDestroy();
    flushSidecars();
    http.verify();
  });

  it('shows the first 12 immediately and keeps the next 60 queued without revealing them', fakeAsync(() => {
    component.loadProducts();
    batch(0);
    expect(component.products.length).toBe(12);
    expect(component.catalogLoading).toBeFalse();
    for (let offset = 12; offset < 72; offset += 12) batch(offset);
    expect(component.products.length).toBe(12);
    expect((component as any).productBuffer.length).toBe(60);
    expect(component.productCount).toBe(200);
    http.expectNone(req => req.params.get('offset') === '72');
  }));

  it('reveals 12 queued products on scroll and refills the 60-product queue', fakeAsync(() => {
    component.loadProducts();
    batch(0);
    for (let offset = 12; offset < 72; offset += 12) batch(offset);
    (component as any).nearCatalogEnd.and.returnValue(true);
    component.onCatalogScroll();
    tick(17);
    (component as any).nearCatalogEnd.and.returnValue(false);
    expect(component.products.length).toBe(24);
    batch(72);
    expect((component as any).productBuffer.length).toBe(60);
    expect(new Set(component.products.map(product => product.id)).size).toBe(24);
  }));

  it('pauses queue filling in other views and resumes on returning to the shop', fakeAsync(() => {
    component.activeView = 'cart';
    component.loadProducts(); batch(0);
    http.expectNone(req => req.params.get('offset') === '12');
    component.setView('shop');
    const resumed = http.expectOne(req => req.params.get('offset') === '12' && !req.params.get('category'));
    component.activeView = 'cart';
    resumed.flush({ results: products(13, 12), count: 200, next: 'next' });
    flushSidecars();
    expect(component.products.length).toBe(12);
  }));

  it('keeps rendered products after a background failure and retries the same offset', fakeAsync(() => {
    component.loadProducts(); batch(0);
    http.expectOne(req => req.params.get('offset') === '12').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.products.length).toBe(12);
    expect(component.catalogError).toBeTruthy();
    component.loadMoreProducts();
    batch(12, 12, 36);
    batch(24, 12, 36);
    expect(component.products.length).toBe(12);
    expect(component.catalogError).toBe('');
    expect((component as any).productBuffer.length).toBe(24);
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
    flushSidecars();
    expect(component.products.map(product => product.id)).toEqual([80, 81]);
  });

  it('stops on empty and final short batches', fakeAsync(() => {
    component.loadProducts(); batch(0, 12, 5);
    expect(component.products.length).toBe(5);
    expect(component.hasMoreProducts).toBeFalse();
    component.loadProducts(); batch(0, 12, 0);
    expect(component.products.length).toBe(0);
    expect(component.loadingMore).toBeFalse();
  }));

  it('cancels background requests on destruction', fakeAsync(() => {
    component.loadProducts(); batch(0);
    const pending = http.expectOne(req => req.params.get('offset') === '12');
    component.ngOnDestroy(); tick(1000);
    expect(pending.cancelled).toBeTrue();
    expect(component.products.length).toBe(12);
  }));

  it('fills a 3-second first-paint progress bar without waiting for later batches', fakeAsync(() => {
    (component as any).startCatalogPaintProgress();
    expect(component.catalogPaintProgress).toBe(0);
    tick(1500);
    expect(component.catalogPaintProgress).toBeGreaterThan(40);
    expect(component.catalogPaintProgress).toBeLessThan(100);
    tick(1600);
    expect(component.catalogPaintProgress).toBe(100);
  }));

  it('shows warmed category products immediately and prefetches children from the down arrow', () => {
    (component as any).categoryWarm.set('clothing', products(1, 24));
    component.categories = [
      {id: 1, name: 'Clothing', slug: 'clothing', product_count: 4, hasChildren: true},
      {id: 2, name: 'Tops', slug: 'tops', parent_id: 1, product_count: 2},
    ];
    component.chooseCategory('clothing');
    expect(component.products.length).toBe(24);
    expect(component.catalogLoading).toBeFalse();
    http.expectOne(req => req.params.get('offset') === '0' && req.params.get('category') === 'clothing')
      .flush({results: products(1, 12), count: 40, next: 'next'});
    flushSidecars();
    http.expectOne(req => req.params.get('offset') === '24' && req.params.get('category') === 'clothing')
      .flush({results: products(25, 12), count: 40, next: 'next'});
    http.match(req => req.url.endsWith('/products/') && req.params.get('category') === 'clothing')
      .filter(req => !req.cancelled)
      .forEach(req => req.flush({results: products(Number(req.request.params.get('offset') || 0) + 1, 12), count: 40, next: 'next'}));
    const event = {preventDefault() {}, stopPropagation() {}} as any;
    component.toggleCategoryBranch(event, component.categories[0] as any);
    const child = http.expectOne(req => req.params.get('category') === 'tops');
    expect(child.request.params.get('limit')).toBe('24');
    child.flush({results: products(100, 24), next: 'next'});
    flushSidecars();
  });
});

describe('Marketplace last-used taxonomy cache', () => {
  let component: EcommerceComingSoonComponent;
  let http: HttpTestingController;
  const tree = [
    {id: 1, name: 'Clothing', slug: 'clothing', product_count: 4, parent_id: null as number | null},
    {id: 2, name: 'Tops', slug: 'tops', parent_id: 1, product_count: 2},
  ];
  beforeEach(() => {
    clearShopNavCache();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    http = TestBed.inject(HttpTestingController);
    component = new EcommerceComingSoonComponent(TestBed.inject(HttpClient), { snapshot: { data: {} } } as any, { navigate: () => Promise.resolve(true) } as any, null as any, null as any, null as any);
    spyOn<any>(component, 'nearCatalogEnd').and.returnValue(false);
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.match(() => true).filter(req => !req.cancelled).forEach(req => {
      req.flush(req.request.url.includes('price-range') ? {max_price: '0'} : []);
    });
    http.verify();
    clearShopNavCache();
  });

  it('paints reserved categories immediately then patches counts from the network', () => {
    localStorage.setItem('cheradip.ecommerce.taxonomy.v1', JSON.stringify({
      savedAt: Date.now(), categories: tree, lastUsedSlugs: ['clothing'],
    }));
    component.loadCategories();
    expect(component.categories.map(category => category.slug)).toEqual(['clothing', 'tops']);
    expect(component.categoriesLoading).toBeFalse();
    expect(component.expandedCategories.has(1)).toBeTrue();
    http.expectOne(req => req.url.includes('/categories/')).flush([
      {id: 1, name: 'Clothing', slug: 'clothing', product_count: 9, parent_id: null},
      {id: 2, name: 'Tops', slug: 'tops', parent_id: 1, product_count: 5},
    ]);
    expect(component.categories[0].product_count).toBe(9);
    expect(component.categories[1].product_count).toBe(5);
  });

  it('opens a cached category immediately and refreshes product links in the background', () => {
    const cached = Array.from({length: 12}, (_, index) => ({id: index + 1, name: `Cached ${index + 1}`, image_url: '', slug: `cached-${index + 1}`}));
    const listingKey = `cheradip.ecommerce.first-batch.v1:${new HttpParams().set('ordering', '-created_at').set('category', 'clothing').toString()}`;
    localStorage.setItem('cheradip.ecommerce.last-listings.v1', JSON.stringify({
      [listingKey]: { savedAt: Date.now(), products: cached, count: 40 },
    }));
    component.categories = tree as any;
    component.chooseCategory('clothing');
    expect(component.products.map(product => product.id)).toEqual(cached.map(product => product.id));
    expect(component.catalogLoading).toBeFalse();
    const refresh = http.expectOne(req => req.url.endsWith('/products/') && req.params.get('offset') === '0' && req.params.get('category') === 'clothing');
    refresh.flush({
      results: [{id: 1, name: 'Updated Shirt', image_url: '', slug: 'cached-1'}, ...cached.slice(1)],
      count: 40, next: 'next',
    });
    expect(component.products[0].name).toBe('Updated Shirt');
    http.match(req => req.url.endsWith('/products/'))
      .filter(req => !req.cancelled)
      .forEach(req => req.flush({results: [], count: 40, next: null}));
  });

  it('keeps cached categories when the background taxonomy refresh fails', fakeAsync(() => {
    localStorage.setItem('cheradip.ecommerce.taxonomy.v1', JSON.stringify({
      savedAt: Date.now(), categories: tree, lastUsedSlugs: ['tops'],
    }));
    component.loadCategories();
    expect(component.visibleCategories.some(category => category.slug === 'clothing')).toBeTrue();
    http.expectOne(req => req.url.includes('/categories/')).flush({}, {status: 500, statusText: 'Unavailable'});
    expect(component.categories.map(category => category.slug)).toEqual(['clothing', 'tops']);
    expect(component.categoriesLoadFailed).toBeFalse();
    component.ngOnDestroy();
    tick(180000);
  }));
});
