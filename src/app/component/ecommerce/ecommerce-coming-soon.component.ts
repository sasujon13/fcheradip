import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { finalize, retry, Subject, Subscription, takeUntil, timeout, timer } from 'rxjs';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../service/api.service';
import { AuthSessionService } from '../../service/auth-session.service';
import { getDashboardRouterLinkSegments } from '../../service/dashboard-route.util';
import { productImageMagnifier } from './product-image-magnifier';
import { localContact } from '../../shared/phone-display.pipe';

interface Category { id: number; name: string; slug: string; product_count: number; parent_id?: number | null; depth?: number; hasChildren?: boolean; }
interface Product {
  price_on_request?: boolean;
  id: number; name: string; slug: string; short_description: string; category_name: string;
  price: string | null; compare_at_price?: string | null; stock: number; image_url: string;
  default_variant_id: number | null; featured: boolean; is_sample: boolean;
  allow_backorder?: boolean;
  stock_confirmation_required?: boolean;
  quantity_unspecified?: boolean;
  discount_percent?: number;
  purchasable?: boolean;
}
interface ProductVariant {
  id: number; title: string; sku: string; price: string; compare_at_price?: string | null;
  stock: number; is_active: boolean; option1_name?: string; option1_value?: string;
  allow_backorder?: boolean;
  stock_confirmation_required?: boolean;
  quantity_unspecified?: boolean;
  discount_percent?: number;
  purchasable?: boolean;
  option2_name?: string; option2_value?: string; option3_name?: string; option3_value?: string;
}
interface ProductDetail extends Product {
  fulfilment_mode?: 'standard' | 'staff_confirmed_supplier_pilot' | 'manual_supplier_catalogue';
  delivery_dhaka_charge?: string | null;
  delivery_outside_dhaka_charge?: string | null;
  cod_percent?: string | null;
  description: string; brand_name?: string; variants: ProductVariant[];
  images: Array<{ id: number; url: string; alt_text: string; variant_id?: number }>;
  attributes?: Record<string, any>;
  specifications?: Array<{feature: string; value: string}>;
  description_html?: string;
  features_html?: string[];
  option_notice?: string;
  description_sizes?: string[];
  description_colors?: string[];
  approved_reviews?: Array<{customer_name: string; rating: number; title: string; body: string}>;
}
interface CartItem { id: number; variant_id: number; quantity: number; product_name: string; variant_title: string; sku: string; unit_price: string; image_url: string; line_total: number; stock_confirmation_required?: boolean; quantity_unspecified?: boolean; available_variants?: ProductVariant[]; product_slug?: string; requested_size?: string; requested_color?: string; description_sizes?: string[]; description_colors?: string[]; }
interface Cart { token: string; items: CartItem[]; subtotal: number; }

@Component({
  selector: 'app-ecommerce-coming-soon',
  templateUrl: './ecommerce-coming-soon.component.html',
  styleUrls: ['./ecommerce-coming-soon.component.css'],
  standalone: false,
})
export class EcommerceComingSoonComponent implements OnInit, OnDestroy {
  private readonly api = `${environment.apiUrl}/ecommerce`;
  categories: Category[] = [];
  categoriesLoading = false;
  categoriesLoadFailed = false;
  private categoryRequest?: Subscription;
  private categoryFailureMessage = '';
  products: Product[] = [];
  cart: Cart | null = null;
  cartLoading = false;
  cartError = '';
  readonly changingCartItems = new Set<number>();
  activeView: 'shop' | 'cart' | 'track' = 'shop';
  selectedCategory = '';
  search = '';
  brands: any[] = [];
  selectedBrand = '';
  minPrice: number | null = null;
  maxPrice: number | null = null;
  priceRangeMax = 0;
  priceLower = 0;
  priceUpper = 0;
  priceRangeLoading = true;
  priceRangeError = false;
  inStockOnly = false;
  categorySearch = '';
  filtersOpen = false;
  readonly skeletonCards = Array.from({ length: 8 });
  ordering = '-created_at';
  loading = false;
  message = '';
  error = '';
  productCount = 0;
  catalogLoading = false;
  loadingMore = false;
  catalogError = '';
  hasMoreProducts = false;
  private productBuffer: Product[] = [];
  private revealQueue: Product[] = [];
  private catalogOffset = 0;
  private catalogGeneration = 0;
  private catalogStarted = false;
  private catalogRequest?: Subscription;
  private revealTimer?: ReturnType<typeof setTimeout>;
  private scrollFrame?: number;
  private filterFrame?: number;
  private filterPanel?: HTMLElement;
  private filterResizeObserver?: ResizeObserver;
  private revealFilterPanel = false;
  private catalogObserver?: IntersectionObserver;
  private catalogSentinel?: HTMLElement;
  private preloadedImages: HTMLImageElement[] = [];
  private readonly destroyed = new Subject<void>();
  private catalogQuery = new HttpParams();

  @ViewChild('catalogFilters') set catalogFilterPanel(ref: ElementRef<HTMLElement> | undefined) {
    this.filterResizeObserver?.disconnect();
    this.filterPanel = ref?.nativeElement;
    if (!this.filterPanel) return;
    if (typeof ResizeObserver !== 'undefined') {
      this.filterResizeObserver = new ResizeObserver(() => this.scheduleFilterViewport());
      this.filterResizeObserver.observe(this.filterPanel);
      const intro = this.filterPanel.parentElement?.querySelector('.market-intro');
      if (intro) this.filterResizeObserver.observe(intro);
    }
    this.scheduleFilterViewport();
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
    if (this.filtersOpen) this.scheduleFilterViewport(true);
  }

  private scheduleFilterViewport(reveal = false): void {
    this.revealFilterPanel ||= reveal;
    if (this.filterFrame !== undefined) return;
    this.filterFrame = requestAnimationFrame(() => {
      this.filterFrame = undefined;
      if (this.revealFilterPanel && this.filtersOpen) this.filterPanel?.scrollIntoView({block:'start',behavior:'instant'});
      this.revealFilterPanel = false;
      this.updateFilterViewport();
    });
  }

  private updateFilterViewport(): void {
    if (!this.filterPanel) return;
    const box = this.filterPanel.getBoundingClientRect();
    if (!box.width) return;
    // The requested viewport-minus-160 cap also needs to respect the panel's
    // initial position below the introduction, before sticky positioning starts.
    const height = Math.max(48, Math.min(window.innerHeight - 160, window.innerHeight - Math.max(0,box.top) - 32));
    const value = `${Math.floor(height)}px`;
    if (this.filterPanel.style.getPropertyValue('--filter-available-height') !== value)
      this.filterPanel.style.setProperty('--filter-available-height',value);
  }

  @HostListener('window:resize') onCatalogResize(): void { this.scheduleFilterViewport(); }

  @ViewChild('catalogSentinel') set productSentinel(ref: ElementRef<HTMLElement> | undefined) {
    this.catalogObserver?.disconnect();
    this.catalogSentinel = ref?.nativeElement;
    if (this.catalogSentinel && typeof IntersectionObserver !== 'undefined') {
      this.catalogObserver = new IntersectionObserver(() => this.advanceCatalog(), { rootMargin: '800px' });
      this.catalogObserver.observe(this.catalogSentinel);
    }
  }
  selectedProduct: ProductDetail | null = null;
  selectedVariantId: number | null = null;
  selectedDescriptionSize = '';
  selectedDescriptionColor = '';
  selectedOptionValues: Record<string, string> = {};
  productDetailLoading = false;
  productDetailError = '';
  sourceCheckedAt: string | null = null;
  sourceRefreshState = '';
  private sourceRefreshTimer?: ReturnType<typeof setTimeout>;
  magnifiedProductId: number | null = null;
  productMagnifierStyle: Record<string, string> = {};
  checkout = {
    customer_name: '', email: '', phone: '', address: '', city: '', district: '', postal_code: '',
    country_code: 'BD', division: '', thana: '', zone: '', phone_alternate: '',
    payment_method: 'cod', transaction_id: '', customer_note: '', coupon_code: '',
  };
  completedOrder: any = null;
  trackNumber = '';
  trackToken = '';
  trackedOrder: any = null;
  digitalLibrary: any[] = [];
  accountMenuOpen = false;
  profilePictureMenuOpen = false;
  profilePictureBusy = false;
  profileImageUrl: string | null = null;
  profileBadge = 'None';
  walletTaka = 0;
  referenceBalanceTaka = 0;
  divisions: string[] = [];
  districts: string[] = [];
  thanas: string[] = [];
  policy: any = {dhaka_charge: 80, outside_dhaka_charge: 120, cod_percent: 1};
  quote: any = null;
  quoteLoading = false;
  quoteError = '';
  activeImage = '';
  readonly failedProductImages = new Set<string>();

  hasProductPhoto(url: string | null | undefined): boolean {
    return !!url && !this.failedProductImages.has(url)
      && !/(?:^|\/)assets\/(?:images\/cheradip\.svg|cheradip\/cheradip-avatar\.png)(?:[?#]|$)/i.test(url);
  }

  hasProductAttributes(attributes: Record<string, any> | null | undefined): boolean {
    return !!attributes && Object.entries(attributes).some(([key, value]) =>
      String(key).trim().length > 0 && value != null && String(value).trim().length > 0,
    );
  }

  productPhotoFailed(url: string): void {
    if (url) this.failedProductImages.add(url);
    this.hideProductMagnifier();
  }
  galleryPaused = false;
  galleryHover = false;
  private galleryTimer?: ReturnType<typeof setInterval>;
  review = {rating: 5, title: '', body: ''};
  paymentRetryOrder: any = null;
  private quoteVersion = 0;
  private accountVersion = 0;
  private readonly accountChanged = new Subject<void>();
  private quoteTimer?: ReturnType<typeof setTimeout>;
  private productVersion = 0;
  private listingScrollY = 0;
  private detailRequestSlug = '';
  private lastProductTrigger: HTMLElement | null = null;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private authSession: AuthSessionService,
    private snackBar: MatSnackBar,
  ) {}

  get loginStatus(): boolean {
    return localStorage.getItem('isLoggedIn') === 'true' && Boolean(localStorage.getItem('authToken'));
  }

  get cartTitle(): string {
    const name = this.loginStatus ? (localStorage.getItem('fullName') || '').trim() : '';
    return name ? `${name}'s Cart` : 'Your cart';
  }

  get dashboardRouterSegments(): string[] { return getDashboardRouterLinkSegments(); }

  ngOnInit(): void {
    const requestedOrder = this.route.snapshot.queryParamMap.get('order');
    this.trackToken = this.router.getCurrentNavigation()?.extras.state?.['trackingToken'] || '';
    this.route.paramMap.pipe(takeUntil(this.destroyed)).subscribe(params => {
      const slug = params.get('slug');
      if (slug && this.detailRequestSlug !== slug) this.loadProductDetails(slug);
      else if (!slug && this.detailRequestSlug && !this.route.snapshot.queryParamMap.get('product')) {
        this.stopGallery();
        this.selectedProduct = null; this.selectedVariantId = null; this.productDetailLoading = false; this.productDetailError = '';
        this.detailRequestSlug = '';
      }
    });
    this.route.queryParamMap.pipe(takeUntil(this.destroyed)).subscribe(params => {
      const requestedView = params.get('view');
      const cartRoute = this.route.snapshot.data['view'] === 'cart';
      this.activeView = cartRoute ? 'cart' : requestedView === 'cart' || requestedView === 'track' ? requestedView : 'shop';
      if (!cartRoute && requestedView === 'cart') {
        // Keep published cart URLs working, but use one canonical shopping cart.
        void this.router.navigate(['/cart'], { queryParams: { from: 'ecommerce' }, replaceUrl: true });
      }
      const order = params.get('order');
      if (order) this.trackNumber = order;
      const queryProduct = params.get('product');
      if (queryProduct && this.selectedProduct?.slug !== queryProduct) this.loadProductDetails(queryProduct);
      this.ensureCatalogLoaded();
      this.advanceCatalog();
    });
    const cartOwner = localStorage.getItem('cheradipEcommerceCartOwner') || '';
    const currentOwner = this.loginStatus ? (localStorage.getItem('username') || '') : '';
    if (cartOwner && cartOwner !== currentOwner) localStorage.removeItem('cheradipEcommerceCart');
    this.loadCart(localStorage.getItem('cheradipEcommerceCart') || undefined);
    if (this.loginStatus) this.loadAccountSummary();
    this.loadCheckoutProfile();
    this.http.get<any>(`${this.api}/store-policy/`).pipe(takeUntil(this.destroyed)).subscribe({next: value => this.policy = value, error: () => {}});
    this.apiService.getDivisionsByCountry('BD').pipe(takeUntil(this.destroyed)).subscribe({next: rows => this.divisions = rows, error: () => {}});
    this.loadAddressDistricts();
    this.http.get<any[]>(`${this.api}/brands/`).pipe(takeUntil(this.destroyed)).subscribe({next: rows => this.brands = rows, error: () => {}});
    if (requestedOrder && (this.loginStatus || this.trackToken)) this.trackOrder();
  }

  private ensureCatalogLoaded(): void {
    if (this.activeView !== 'shop' || this.catalogStarted) return;
    this.catalogStarted = true;
    this.loadCategories();
    this.loadPriceRange();
    this.loadProducts();
  }

  setView(view: 'shop' | 'cart' | 'track'): void {
    this.clearFeedback();
    this.activeView = view;
    if (view === 'cart') void this.router.navigate(['/cart'], { queryParams: { from: 'ecommerce' } });
    else if (this.route.snapshot.data['view'] === 'cart') void this.router.navigate(['/ecommerce'], {
      queryParams: view === 'track' ? { view: 'track', order: this.trackNumber || null } : {},
      state: view === 'track' ? { trackingToken: this.trackToken } : undefined,
    });
    else {
      this.activeView = view;
      this.ensureCatalogLoaded();
      this.advanceCatalog();
    }
  }

  @HostListener('window:cheradip-session-changed') sessionChanged(): void {
    ++this.accountVersion; ++this.quoteVersion;
    this.accountChanged.next();
    this.cart = this.completedOrder = this.trackedOrder = this.quote = this.paymentRetryOrder = null;
    this.digitalLibrary = []; this.walletTaka = this.referenceBalanceTaka = 0;
    this.profileImageUrl = null; this.trackToken = ''; this.loading = false;
    for (const key of Object.keys(this.checkout)) (this.checkout as any)[key] = '';
    this.checkout.country_code = 'BD'; this.checkout.payment_method = 'cod';
    localStorage.removeItem('cheradipEcommerceCart');
    this.loadCart();
    if (this.loginStatus) { this.loadAccountSummary(); this.loadCheckoutProfile(); }
  }

  loadCheckoutProfile(): void {
    if (!this.loginStatus) return;
    const version = this.accountVersion;
    const original = {...this.checkout};
    this.http.get<any>(`${this.api}/checkout/profile/`).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({next: data => {
      if (version !== this.accountVersion) return;
      for (const key of Object.keys(data)) {
        if (key === 'country_code' || key === 'city' || key === 'postal_code') continue;
        if (key in this.checkout && (this.checkout as any)[key] === (original as any)[key]) {
          (this.checkout as any)[key] = key === 'phone' || key === 'phone_alternate' ? localContact(data[key],data.country_code || 'BD') : data[key] || '';
        }
      }
      this.loadAddressDistricts(); this.loadAddressThanas(); this.requestQuote();
    }, error: () => {}});
  }

  loadAddressDistricts(): void {
    const division = this.checkout.division;
    const version = this.accountVersion;
    this.apiService.getDistrictsByCountry('BD', division).pipe(takeUntil(this.destroyed)).subscribe({
      next: rows => { if (version === this.accountVersion && division === this.checkout.division) this.districts = rows; }, error: () => {},
    });
  }
  loadAddressThanas(): void {
    const {division, district} = this.checkout; const version = this.accountVersion;
    this.apiService.getThanasByCountry('BD', division, district).pipe(takeUntil(this.destroyed)).subscribe({
      next: rows => { if (version === this.accountVersion && district === this.checkout.district) this.thanas = rows; }, error: () => {},
    });
  }
  divisionChanged(): void { this.checkout.district = this.checkout.thana = ''; this.loadAddressDistricts(); this.requestQuote(); }
  districtChanged(): void { this.checkout.thana = ''; this.loadAddressThanas(); this.requestQuote(); }
  private shippingAddress() {
    const c = this.checkout;
    return {country_code:'BD', division: c.division, district: c.district,
      thana: c.thana, zone: c.zone, address: c.address};
  }
  requestQuote(): void {
    this.quote = null; this.quoteError = '';
    const version = ++this.quoteVersion;
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    if (!this.cart?.items.length || !this.checkout.district || !this.checkout.payment_method) { this.quoteLoading = false; return; }
    this.quoteLoading = true;
    this.quoteTimer = setTimeout(() => {
      this.http.post<any>(`${this.api}/checkout/quote/`, {cart_token: this.cart?.token,
        shipping_address: this.shippingAddress(), coupon_code: this.checkout.coupon_code, payment_method: this.checkout.payment_method})
        .pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
          next: quote => { if (version === this.quoteVersion) { this.quote = quote; this.quoteLoading = false; } },
          error: err => { if (version === this.quoteVersion) { this.quoteLoading = false; this.quoteError = this.errorText(err, 'Could not calculate the final total.'); } },
        });
    }, 300);
  }

  downloadReceipt(order: any): void {
    const text = `Cheradip Order Receipt\nOrder ID: ${order.number}\nProducts: BDT ${order.subtotal}\nDiscount: BDT ${order.discount_total}\nDelivery: BDT ${order.shipping_total}\nCOD: BDT ${order.cod_total || 0}\nTotal: BDT ${order.grand_total}\nStatus: ${order.status}\nTrack: ${location.origin}/ecommerce?view=track&order=${encodeURIComponent(order.number)}\nPrivate tracking token (keep private): ${order.tracking_token}\n`;
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `${order.number}-receipt.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  loadAccountSummary(): void {
    const version = this.accountVersion;
    this.apiService.getCommerceHistory().pipe(takeUntil(this.destroyed)).subscribe({
      next: value => {
        if (version !== this.accountVersion) return;
        this.profileImageUrl = value?.profile?.profileImageUrl || null;
        this.profileBadge = value?.profile?.badge || 'None';
        this.walletTaka = Number(value?.wallet?.balanceTaka || 0);
        this.referenceBalanceTaka = Number(value?.wallet?.referenceBalanceTaka || 0);
      },
      error: () => {},
    });
  }

  loadCategories(): void {
    this.categoryRequest?.unsubscribe();
    this.categoriesLoading = true;
    this.categoriesLoadFailed = false;
    if (this.error === this.categoryFailureMessage) this.error = '';
    let lastFailure: HttpErrorResponse | undefined;
    this.categoryRequest = this.http.get<Category[]>(`${this.api}/categories/`).pipe(
      // Bound each hung attempt, then retry quietly with capped backoff. The
      // outer deadline includes requests and delays: errors appear only at 3m.
      timeout(20000),
      retry({delay: (error, attempt) => {
        lastFailure = error instanceof HttpErrorResponse ? error : new HttpErrorResponse({status: 0});
        return timer(Math.min(15000, 2000 * 2 ** Math.min(attempt - 1, 3)));
      }}),
      timeout(180000),
      takeUntil(this.destroyed),
      finalize(() => this.categoriesLoading = false),
    ).subscribe({
      // Keep empty supplier taxonomy in administration, not in customer filters
      // or the featured-collection cards. Preserve responses without counts.
      next: data => this.categories = data.filter(category =>
        category.product_count == null || Number(category.product_count) > 0),
      error: () => {
        this.categoriesLoadFailed = true;
        this.showError(lastFailure || new HttpErrorResponse({status: 0}), 'Could not load categories after 3 minutes.');
        this.categoryFailureMessage = this.error;
      },
    });
  }

  loadPriceRange(): void {
    this.priceRangeLoading = true;
    this.priceRangeError = false;
    this.http.get<{max_price: string}>(`${this.api}/products/price-range/`)
      .pipe(takeUntil(this.destroyed)).subscribe({
        next: data => {
          const maximum = Number(data.max_price);
          this.priceRangeMax = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
          this.priceLower = Math.min(this.minPrice ?? 0, this.priceRangeMax);
          this.priceUpper = Math.min(this.maxPrice ?? this.priceRangeMax, this.priceRangeMax);
          this.priceRangeLoading = false;
        },
        error: () => { this.priceRangeLoading = false; this.priceRangeError = true; },
      });
  }

  movePriceHandle(event: Event, handle: 'lower' | 'upper'): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const value = Math.max(0, Math.min(this.priceRangeMax, Math.round(raw)));
    if (handle === 'lower') this.priceLower = Math.min(value, this.priceUpper);
    else this.priceUpper = Math.max(value, this.priceLower);
    (event.target as HTMLInputElement).value = String(handle === 'lower' ? this.priceLower : this.priceUpper);
  }

  applyPriceRange(): void {
    if (this.priceRangeLoading || this.priceRangeError || !this.priceRangeMax) return;
    const lower = this.priceLower > 0 ? this.priceLower : null;
    const upper = this.priceUpper < this.priceRangeMax ? this.priceUpper : null;
    if (lower === this.minPrice && upper === this.maxPrice) return;
    this.minPrice = lower;
    this.maxPrice = upper;
    this.loadProducts(1);
  }

  get priceRangeStart(): number { return this.priceRangeMax ? this.priceLower / this.priceRangeMax * 100 : 0; }
  get priceRangeEnd(): number { return this.priceRangeMax ? this.priceUpper / this.priceRangeMax * 100 : 100; }

  loadProducts(_page = 1): void {
    this.catalogStarted = true;
    this.hideProductMagnifier();
    ++this.catalogGeneration;
    this.catalogRequest?.unsubscribe();
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    this.revealTimer = undefined;
    this.products = [];
    this.productBuffer = [];
    this.revealQueue = [];
    this.preloadedImages = [];
    this.catalogOffset = 0;
    this.productCount = 0;
    this.catalogError = '';
    this.catalogLoading = true;
    this.loadingMore = false;
    this.hasMoreProducts = true;
    let params = new HttpParams().set('ordering', this.ordering);
    if (this.selectedCategory) params = params.set('category', this.selectedCategory);
    if (this.search.trim()) params = params.set('search', this.search.trim());
    if (this.selectedBrand) params = params.set('brand', this.selectedBrand);
    if (this.minPrice != null) params = params.set('min_price', this.minPrice);
    if (this.maxPrice != null) params = params.set('max_price', this.maxPrice);
    if (this.inStockOnly) params = params.set('in_stock', 'true');
    this.catalogQuery = params;
    const cached = this.readFirstBatchCache();
    if (cached) {
      // Repaint the last first-page cards immediately on reload, then replace
      // them with the live response before requesting the next page.
      this.products = cached.products;
      this.productCount = cached.count;
      this.catalogOffset = cached.products.length;
      this.hasMoreProducts = cached.products.length > 0;
      this.fetchProductBatch(true);
    } else this.fetchProductBatch();
  }

  private catalogCacheKey(): string {
    return `cheradip.ecommerce.first-batch.v1:${this.catalogQuery.toString()}`;
  }

  private readFirstBatchCache(): { products: Product[]; count: number } | null {
    try {
      const raw = sessionStorage.getItem(this.catalogCacheKey());
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - Number(cached.savedAt) > 60_000 || !Array.isArray(cached.products) ||
          !cached.products.length || !Number.isFinite(Number(cached.count))) return null;
      return { products: cached.products, count: Number(cached.count) };
    } catch { return null; }
  }

  private cacheFirstBatch(products: Product[], count: number): void {
    try {
      sessionStorage.setItem(this.catalogCacheKey(), JSON.stringify({ savedAt: Date.now(), products, count }));
    } catch { /* Storage can be unavailable or full; network loading still works. */ }
  }

  private fetchProductBatch(refreshFirst = false): void {
    if (this.loadingMore || !this.hasMoreProducts || this.catalogError) return;
    const generation = this.catalogGeneration;
    const offset = refreshFirst ? 0 : this.catalogOffset;
    this.loadingMore = true;
    // Show a tiny first group quickly, fill the first 12, then stream 12 at a time.
    const limit = offset === 0 ? 4 : offset === 4 ? 8 : 12;
    const params = this.catalogQuery.set('limit', limit).set('offset', offset);
    this.catalogRequest = this.http.get<any>(`${this.api}/products/`, { params }).subscribe({
      next: data => {
        if (generation !== this.catalogGeneration) return;
        const batch: Product[] = Array.isArray(data) ? data : (data.results || []);
        this.productCount = Array.isArray(data) ? data.length : Number(data.count || 0);
        this.catalogOffset = Math.max(this.catalogOffset, offset + batch.length);
        this.hasMoreProducts = !Array.isArray(data) && Boolean(data.next) && batch.length > 0;
        const known = new Set([...(refreshFirst ? [] : this.products), ...this.productBuffer, ...this.revealQueue].map(product => product.id));
        const unique = batch.filter(product => !known.has(product.id) && Boolean(known.add(product.id)));
        if (refreshFirst || offset === 0) this.products = unique;
        else this.productBuffer.push(...unique);
        if (offset === 0 && !Array.isArray(data)) this.cacheFirstBatch(unique, this.productCount);
        this.catalogLoading = false;
        this.loadingMore = false;
        this.preloadBufferedImages();
        this.advanceCatalog();
      },
      error: () => {
        if (generation !== this.catalogGeneration) return;
        this.catalogLoading = false;
        this.loadingMore = false;
        this.catalogError = 'Could not load more products. Your loaded products are still available.';
      },
    });
  }

  private preloadBufferedImages(): void {
    this.preloadedImages = this.productBuffer.slice(0, 12).filter(product => product.image_url).map(product => {
      const image = new Image();
      image.src = product.image_url;
      return image;
    });
  }

  private nearCatalogEnd(): boolean {
    return !!this.catalogSentinel && this.catalogSentinel.getBoundingClientRect().top <= window.innerHeight + 800;
  }

  private advanceCatalog(force = false): void {
    if (this.activeView !== 'shop' || this.catalogLoading) return;
    if (this.revealQueue.length && this.revealTimer === undefined) this.revealProduct();
    if (!this.revealQueue.length && this.productBuffer.length && (force || this.products.length < 120 || this.nearCatalogEnd())) {
      this.revealQueue = this.productBuffer.splice(0, 12);
      this.revealProduct();
    }
    // Keep only one unrevealed batch in reserve; the current reveal can run while it downloads.
    if (!this.productBuffer.length) this.fetchProductBatch();
  }

  private revealProduct(): void {
    this.revealTimer = undefined;
    if (this.activeView !== 'shop') return;
    const product = this.revealQueue.shift();
    if (product) this.products.push(product);
    if (this.revealQueue.length) {
      // Accelerate the previous batch once the following batch is ready.
      this.revealTimer = setTimeout(() => this.revealProduct(), this.productBuffer.length ? 8 : 35);
    } else this.advanceCatalog();
  }

  loadMoreProducts(): void {
    if (this.catalogError) {
      this.catalogError = '';
      this.fetchProductBatch();
    } else this.advanceCatalog(true);
  }

  get catalogProgress(): number {
    const target = Math.min(120, this.productCount);
    return target ? Math.min(100, Math.round(this.products.length / target * 100)) : 0;
  }

  trackProduct(_index: number, product: Product): number { return product.id; }

  @HostListener('window:scroll') onCatalogScroll(): void {
    if (this.scrollFrame !== undefined || this.activeView !== 'shop') return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      this.updateFilterViewport();
      this.advanceCatalog();
    });
  }

  ngOnDestroy(): void {
    this.stopSourceRefresh();
    this.stopGallery();
    ++this.catalogGeneration;
    this.catalogRequest?.unsubscribe();
    this.catalogObserver?.disconnect();
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame);
    if (this.filterFrame !== undefined) cancelAnimationFrame(this.filterFrame);
    this.filterResizeObserver?.disconnect();
    this.destroyed.next();
    this.destroyed.complete();
    this.preloadedImages = [];
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.accountChanged.next(); this.accountChanged.complete();
  }

  get visibleCategories(): Category[] {
    const query = this.categorySearch.trim().toLowerCase();
    const byId = new Map(this.categories.map(c => [c.id, c]));
    const path = (category: Category): Category[] => {
      const result = [category]; const seen = new Set([category.id]); let parent = category.parent_id;
      while (parent && byId.has(parent) && !seen.has(parent)) {
        seen.add(parent); const next = byId.get(parent)!; result.unshift(next); parent = next.parent_id;
      }
      return result;
    };
    const matching = new Set<number>();
    for (const category of this.categories) {
      const chain = path(category);
      if (chain.some(c => c.name.toLowerCase().includes(query))) chain.forEach(c => matching.add(c.id));
    }
    const children = (id: number | null) => this.categories.filter(c => (c.parent_id || null) === id)
      .sort((a,b) => a.name.localeCompare(b.name));
    const displayedChildren = (id: number, seen = new Set<number>()): Category[] => {
      if (seen.has(id)) return [];
      const rows = children(id); const nextSeen = new Set(seen).add(id);
      // Omit a redundant single child, but retain its meaningful descendants.
      return rows.length === 1 ? displayedChildren(rows[0].id, nextSeen) : rows;
    };
    const result: Category[] = [];
    const visit = (category: Category, depth: number, seen: Set<number>) => {
      if (seen.has(category.id) || !matching.has(category.id)) return;
      const nextSeen = new Set(seen).add(category.id);
      const next = query ? children(category.id) : displayedChildren(category.id);
      result.push({...category, depth, hasChildren: next.length > 0});
      if (query || this.expandedCategories.has(category.id)) next.forEach(c => visit(c, depth + 1, nextSeen));
    };
    children(null).forEach(c => visit(c,0,new Set()));
    return result;
  }

  get featuredCategories(): Category[] {
    return this.categories.filter(category => !category.parent_id)
      .sort((left, right) => right.product_count - left.product_count || left.name.localeCompare(right.name));
  }

  expandedCategories = new Set<number>();
  trackCategory(_index: number, category: Category): number { return category.id; }

  selectCategoryNode(category: Category): void {
    if (category.hasChildren) {
      if (this.expandedCategories.has(category.id)) this.expandedCategories.delete(category.id);
      else this.expandedCategories.add(category.id);
    }
    this.selectedCategory = category.slug;
    this.loadProducts(1);
  }

  meaningfulText(value: string | null | undefined): string {
    return (value || '').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').trim();
  }

  openCartProduct(item: CartItem): void {
    if (item.product_slug) this.openProduct({slug:item.product_slug,name:item.product_name} as Product);
  }

  get selectedCategoryName(): string {
    return this.categories.find(category => category.slug === this.selectedCategory)?.name || 'All products';
  }

  chooseCategory(slug: string): void {
    this.selectedCategory = slug;
    this.filtersOpen = false;
    this.loadProducts(1);
  }

  resetCatalog(): void {
    this.search = '';
    this.selectedCategory = '';
    this.categorySearch = '';
    this.selectedBrand = ''; this.minPrice = this.maxPrice = null; this.inStockOnly = false;
    this.priceLower = 0; this.priceUpper = this.priceRangeMax;
    this.ordering = '-created_at';
    this.filtersOpen = false;
    this.loadProducts(1);
  }

  discountPercent(product: Product): number {
    if (product.price == null) return 0;
    if (Number.isFinite(Number(product.discount_percent)) && Number(product.discount_percent) > 0) {
      return Number(product.discount_percent);
    }
    const original = Number(product.compare_at_price);
    const price = Number(product.price);
    if (!Number.isFinite(original) || !Number.isFinite(price) || original <= price || price < 0) return 0;
    // Never round up the advertised percentage beyond the actual saving.
    return Math.floor(((original - price) * 100 / original) + 1e-9);
  }

  categoryIcon(name: string): string {
    if (/cloth|fashion|shoe|bag|jewelry/i.test(name)) return 'fa-shopping-bag';
    if (/phone|mobile|tablet|gadget/i.test(name)) return 'fa-mobile';
    if (/computer|laptop|network/i.test(name)) return 'fa-laptop';
    if (/beauty|fragrance|health/i.test(name)) return 'fa-leaf';
    if (/book|stationery|office/i.test(name)) return 'fa-book';
    if (/home|kitchen|garden|appliance/i.test(name)) return 'fa-home';
    if (/sport|game|toy/i.test(name)) return 'fa-futbol-o';
    if (/auto|motor|travel/i.test(name)) return 'fa-car';
    if (/camera/i.test(name)) return 'fa-camera';
    if (/audio|music/i.test(name)) return 'fa-headphones';
    return 'fa-th-large';
  }

  openProduct(product: Product): void {
    const slug = String(product?.slug || '').trim();
    if (!slug) { this.notify('This product is missing its page address.', true); return; }
    this.hideProductMagnifier();
    this.lastProductTrigger = document.activeElement as HTMLElement;
    this.listingScrollY = window.scrollY;
    if (this.route.snapshot.paramMap?.get('slug') !== slug) {
      // Keep the catalog component alive so filters, loaded batches and scroll
      // position survive opening and closing the product dialog.
      this.loadProductDetails(slug, product);
      void this.router.navigate([], {queryParams: {product: slug}, queryParamsHandling: 'merge'});
      return;
    }
    this.loadProductDetails(slug, product);
  }

  private loadProductDetails(slug: string, fallback?: Partial<Product>): void {
    this.stopSourceRefresh();
    this.sourceCheckedAt = null;
    this.sourceRefreshState = '';
    this.selectedDescriptionSize = '';
    this.selectedDescriptionColor = '';
    this.selectedOptionValues = {};
    const version = ++this.productVersion;
    this.detailRequestSlug = slug;
    this.productDetailLoading = true;
    this.productDetailError = '';
    this.selectedProduct = {...fallback, slug, name: fallback?.name || 'Product details', description: '', variants: [], images: []} as ProductDetail;
    this.selectedVariantId = null;
    this.http.get<ProductDetail>(`${this.api}/products/${encodeURIComponent(slug)}/`).pipe(takeUntil(this.destroyed)).subscribe({
      next: detail => {
        if (version !== this.productVersion) return;
        this.selectedProduct = detail;
        this.productDetailLoading = false;
        const available = detail.variants.filter(variant => variant.is_active &&
          (variant.stock > 0 || variant.quantity_unspecified || variant.allow_backorder));
        const preferred = available.find(variant => variant.id === fallback?.default_variant_id) || available[0] || null;
        this.selectedVariantId = this.showVariantChoice ? null : preferred?.id || detail.variants[0]?.id || null;
        this.selectVariantImage();
        this.startGallery();
        this.refreshProductSource(slug, version);
      },
      error: err => {
        if (version !== this.productVersion) return;
        this.productDetailLoading = false;
        this.productDetailError = this.errorText(err, 'Could not load product details.');
      },
    });
  }

  private stopSourceRefresh(): void {
    if (this.sourceRefreshTimer) clearTimeout(this.sourceRefreshTimer);
    this.sourceRefreshTimer = undefined;
  }

  private refreshProductSource(slug: string, version: number): void {
    const url = `${this.api}/products/${encodeURIComponent(slug)}/source-refresh/`;
    this.http.post<any>(url, {}).pipe(takeUntil(this.destroyed)).subscribe({
      next: state => {
        if (version !== this.productVersion) return;
        this.sourceCheckedAt = state.last_checked_at || null;
        this.sourceRefreshState = state.state || '';
        if (state.job_id && ['queued', 'checking'].includes(state.state)) this.pollProductSource(url, slug, version, state.job_id, this.sourceCheckedAt, 0);
      },
      error: () => { if (version === this.productVersion) this.sourceRefreshState = 'check_unavailable'; },
    });
  }

  private pollProductSource(url: string, slug: string, version: number, jobId: string, previousCheck: string | null, attempts: number): void {
    if (attempts >= 40 || version !== this.productVersion) return;
    this.sourceRefreshTimer = setTimeout(() => {
      this.http.get<any>(`${url}?job_id=${encodeURIComponent(jobId)}`).pipe(takeUntil(this.destroyed)).subscribe({
        next: state => {
          if (version !== this.productVersion) return;
          this.sourceCheckedAt = state.last_checked_at || null;
          if (state.last_checked_at && state.last_checked_at !== previousCheck) {
            this.sourceRefreshState = 'updated';
            const chosenVariant = this.selectedVariantId;
            this.http.get<ProductDetail>(`${this.api}/products/${encodeURIComponent(slug)}/`).pipe(takeUntil(this.destroyed)).subscribe({
              next: detail => { if (version === this.productVersion) { this.selectedProduct = detail; this.selectedVariantId = chosenVariant; this.selectVariantImage(); } },
              error: () => { if (version === this.productVersion) { this.sourceRefreshState = 'unavailable'; this.notify('This product is no longer available.', true); } },
            });
          } else if (['failed', 'completed_with_errors', 'cancelled'].includes(state.job_status)) {
            this.sourceRefreshState = 'check_unavailable';
          } else if (state.job_status === 'completed') {
            this.sourceRefreshState = 'not_updated';
          } else {
            this.sourceRefreshState = 'checking';
            this.pollProductSource(url, slug, version, jobId, previousCheck, attempts + 1);
          }
        },
        error: () => { if (version === this.productVersion) this.sourceRefreshState = 'check_unavailable'; },
      });
    }, 3000);
  }

  retryProductDetails(): void {
    if (this.selectedProduct?.slug) this.loadProductDetails(this.selectedProduct.slug, this.selectedProduct);
  }

  closeProduct(): void {
    this.stopSourceRefresh();
    this.stopGallery();
    ++this.productVersion; this.selectedProduct = null; this.selectedVariantId = null; this.productDetailLoading = false; this.productDetailError = '';
    this.detailRequestSlug = '';
    if (!this.route.snapshot.paramMap?.get('slug')) {
      void this.router.navigate([], {queryParams: {product: null}, queryParamsHandling: 'merge', replaceUrl: true}).then(() => {
        this.lastProductTrigger?.focus({preventScroll: true});
        window.scrollTo({top: this.listingScrollY, behavior: 'instant'});
      });
    } else void this.router.navigate(['/ecommerce']);
  }

  @HostListener('document:keydown.escape') closeDialog(): void { if (this.selectedProduct) this.closeProduct(); this.filtersOpen = false; }
  selectVariantImage(): void {
    this.activeImage = this.galleryImages.find(i => i.variant_id === this.selectedVariantId)?.url
      || this.galleryImages[0]?.url || '';
  }
  startGallery(): void {
    this.stopGallery(); this.galleryPaused = false; this.galleryHover = false;
    if (this.galleryImages.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.galleryTimer = setInterval(() => {
      if (!this.galleryPaused && !this.galleryHover && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.moveGallery(1);
    }, 5000);
  }
  stopGallery(): void { if (this.galleryTimer) clearInterval(this.galleryTimer); this.galleryTimer = undefined; }
  get galleryImages() {
    const urls = new Set<string>();
    return (this.selectedProduct?.images || []).filter(i => !i.variant_id || i.variant_id === this.selectedVariantId)
      .filter(i => this.hasProductPhoto(i.url) && !urls.has(i.url) && !!urls.add(i.url));
  }
  moveGallery(step: number): void {
    const images = this.galleryImages;
    if (images.length) this.activeImage = images[(Math.max(0, images.findIndex(i => i.url === this.activeImage)) + step + images.length) % images.length].url;
  }
  chooseGalleryImage(url: string): void { this.activeImage = url; this.galleryPaused = true; }

  submitReview(): void {
    if (!this.selectedProduct) return;
    this.http.post(`${this.api}/products/${this.selectedProduct.id}/reviews/`, this.review).pipe(takeUntil(this.destroyed)).subscribe({
      next: () => this.notify('Thank you. Your verified-purchase review is awaiting moderation.'),
      error: err => this.showError(err, 'Could not submit your review.'),
    });
  }

  showProductMagnifier(event: PointerEvent, productId: number): void {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches) {
      this.hideProductMagnifier();
      return;
    }
    const button = event.currentTarget as HTMLElement;
    const image = button.querySelector('img');
    if (!image || !image.complete) { this.hideProductMagnifier(); return; }
    const rect = image.getBoundingClientRect();
    const container = button.getBoundingClientRect();
    const lens = productImageMagnifier({
      width: rect.width, height: rect.height,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    }, event.clientX - rect.left, event.clientY - rect.top, container.width);
    if (!lens) { this.hideProductMagnifier(); return; }
    this.magnifiedProductId = productId;
    this.productMagnifierStyle = {
      width: `${lens.diameter}px`, height: `${lens.diameter}px`,
      left: `${rect.left - container.left + lens.left}px`,
      top: `${rect.top - container.top + lens.top}px`,
      'background-image': `url(${JSON.stringify(image.currentSrc || image.src)})`,
      'background-size': `${lens.backgroundWidth}px ${lens.backgroundHeight}px`,
      'background-position': `${lens.backgroundX}px ${lens.backgroundY}px`,
    };
  }

  hideProductMagnifier(): void {
    this.magnifiedProductId = null;
    this.productMagnifierStyle = {};
  }

  get selectedVariant(): ProductVariant | null {
    return this.selectedProduct?.variants.find(variant => variant.id === this.selectedVariantId) || null;
  }

  loadCart(token: string | undefined = localStorage.getItem('cheradipEcommerceCart') || undefined): void {
    const version = this.accountVersion;
    this.cartLoading = true;
    this.cartError = '';
    const url = token ? `${this.api}/cart/${encodeURIComponent(token)}/` : `${this.api}/cart/`;
    this.http.get<Cart>(url).pipe(takeUntil(this.destroyed)).subscribe({
      next: cart => { if (version !== this.accountVersion) return; this.rememberCart(cart); this.cartLoading = false; },
      error: err => {
        if (version !== this.accountVersion) return;
        this.cartLoading = false;
        if (token && err.status === 404) {
          localStorage.removeItem('cheradipEcommerceCart');
          this.loadCart();
        } else this.cartError = 'Your cart could not be loaded. Please try again.';
      },
    });
  }

  addToCart(product: Product): void {
    if (product.stock < 1 && !product.quantity_unspecified && !product.allow_backorder) return;
    this.openProduct(product);
  }

  addSelectedVariantToCart(): void {
    if (this.sourceRefreshState === 'unavailable') return;
    const variant = this.selectedVariant;
    if (!variant || !this.canAddVariant(variant) || !this.selectedProduct) return;
    if (this.selectedProduct.description_sizes?.length && !this.selectedDescriptionSize) {
      this.notify('Choose a size before adding this product to Cart.', true); return;
    }
    if (this.selectedProduct.description_colors?.length && !this.selectedDescriptionColor) {
      this.notify('Choose a color before adding this product to Cart.', true); return;
    }
    this.addVariantToCart(variant.id, this.selectedProduct.name, true);
  }

  private addVariantToCart(variantId: number, productName: string, closeDetailsOnSuccess = false): void {
    const url = this.cart?.token ? `${this.api}/cart/${this.cart.token}/` : `${this.api}/cart/`;
    this.http.post<Cart>(url, { variant_id: variantId, quantity: 1, requested_size: this.selectedDescriptionSize, requested_color: this.selectedDescriptionColor }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: cart => { this.rememberCart(cart); this.notify(`${productName} added to Cart.`); if (closeDetailsOnSuccess) this.closeProduct(); },
      error: err => this.showError(err, 'Could not add this product.'),
    });
  }

  updateCartItem(item: CartItem, quantity: number): void {
    if (!this.cart) return;
    if (quantity <= 0) {
      const params = new HttpParams().set('item_id', item.id);
      this.http.delete<Cart>(`${this.api}/cart/${this.cart.token}/`, { params }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
        next: cart => this.rememberCart(cart), error: err => this.showError(err, 'Could not remove item.'),
      });
      return;
    }
    this.http.post<Cart>(`${this.api}/cart/${this.cart.token}/`, { variant_id: item.variant_id, quantity, operation: 'set', requested_size: item.requested_size || '', requested_color: item.requested_color || '' }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: cart => this.rememberCart(cart), error: err => this.showError(err, 'Could not update quantity.'),
    });
  }

  changeCartVariant(item: CartItem, variantId: number): void {
    if (!this.cart || this.loading || variantId === item.variant_id || this.changingCartItems.has(item.id)) return;
    this.changingCartItems.add(item.id);
    this.http.patch<Cart>(`${this.api}/cart/${this.cart.token}/`, {item_id: item.id, variant_id: variantId})
      .pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
        next: cart => { this.changingCartItems.delete(item.id); this.rememberCart(cart); this.notify('Product option updated.'); },
        error: err => { this.changingCartItems.delete(item.id); this.showError(err, 'Could not change this product option.'); },
      });
  }

  changeCartSize(item: CartItem, size: string): void {
    if (!this.cart || this.loading || size === item.requested_size || this.changingCartItems.has(item.id)) return;
    this.changingCartItems.add(item.id);
    this.http.patch<Cart>(`${this.api}/cart/${this.cart.token}/`, {item_id:item.id, variant_id:item.variant_id, requested_size:size})
      .pipe(takeUntil(this.accountChanged),takeUntil(this.destroyed)).subscribe({
        next:cart=>{this.changingCartItems.delete(item.id);this.rememberCart(cart);this.notify('Size updated.');},
        error:err=>{this.changingCartItems.delete(item.id);this.showError(err,'Could not change this size.');},
      });
  }

  changeCartColor(item: CartItem, color: string): void {
    if (!this.cart || this.loading || color === item.requested_color || this.changingCartItems.has(item.id)) return;
    this.changingCartItems.add(item.id);
    this.http.patch<Cart>(`${this.api}/cart/${this.cart.token}/`, {item_id:item.id, variant_id:item.variant_id, requested_color:color})
      .pipe(takeUntil(this.accountChanged),takeUntil(this.destroyed)).subscribe({
        next:cart=>{this.changingCartItems.delete(item.id);this.rememberCart(cart);this.notify('Color updated.');},
        error:err=>{this.changingCartItems.delete(item.id);this.showError(err,'Could not change this color.');},
      });
  }

  placeOrder(): void {
    if (!this.cart?.items?.length || this.loading) return;
    if (this.changingCartItems.size) { this.notify('Please wait for your size or option change to finish.', true); return; }
    if (this.cartNeedsConfirmation && this.checkout.payment_method !== 'cod') {
      this.notify('Choose Cash on Delivery for this order awaiting stock confirmation. No payment is collected before confirmation.',true); return;
    }
    if (!this.checkout.payment_method) { this.notify('Choose a payment method before placing your order.', true); return; }
    if (!this.quote || this.quoteLoading) { this.notify('Select your district and review the final total before ordering.', true); return; }
    this.clearFeedback();
    const walletOwner = localStorage.getItem('username') || '';
    const payload = {
      cart_token: this.cart.token, customer_name: this.checkout.customer_name,
      email: this.checkout.email, phone: this.checkout.phone,
      shipping_address: this.shippingAddress(), phone_alternate: this.checkout.phone_alternate,
      customer_note: this.checkout.customer_note, coupon_code: this.checkout.coupon_code,
      payment_method: this.checkout.payment_method,
      transaction_id: this.checkout.transaction_id, quoted_total: this.quote.grand_total,
    };
    this.loading = true;
    this.http.post<any>(`${this.api}/checkout/`, payload).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: order => {
        this.completedOrder = order; this.loading = false; this.trackNumber = order.number;
        this.trackToken = order.tracking_token; localStorage.removeItem('cheradipEcommerceCart'); this.cart = null;
        window.dispatchEvent(new CustomEvent<number>('cheradip-ecommerce-cart-count', { detail: 0 }));
        if (order.walletBalanceTaka !== undefined) this.walletTaka = Number(order.walletBalanceTaka);
        if (order.referenceBalanceTaka !== undefined) this.referenceBalanceTaka = Number(order.referenceBalanceTaka);
        if (order.walletBalanceTaka !== undefined) window.dispatchEvent(new CustomEvent('cheradip-wallet-updated', {
          detail: {owner: walletOwner, coins: Math.round(this.walletTaka * 100), referenceTaka: this.referenceBalanceTaka},
        }));
        const referenceUsed = Number(order.referenceUsedTaka || 0);
        const balanceNote = referenceUsed > 0
          ? ` ৳${referenceUsed.toFixed(2)} was used from your reference balance first.`
          : '';
        this.message = order.stock_confirmation_pending
          ? `Order ID ${order.number} is pending supplier stock and delivery confirmation. Do not pay yet; no wallet balance was deducted.`
          : order.status === 'confirmed' ? `Order ID ${order.number} is confirmed. Delivery is subject to supplier fulfilment; we will contact you if an item cannot be supplied.${balanceNote}`
          : `Order ID ${order.number} is Pending until administration marks it Order Completed.${balanceNote}`;
      },
      error: err => { this.loading = false; this.showError(err, 'Could not place the order.'); this.requestQuote(); },
    });
  }

  submitPayment(order: any): void {
    this.http.post(`${this.api}/orders/${order.number}/payments/`, {
      tracking_token: order.tracking_token, method: this.checkout.payment_method,
      transaction_id: this.checkout.transaction_id, payer_phone: this.checkout.phone, amount: order.grand_total,
    }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({ error: err => this.showError(err, 'Order placed, but payment information was not submitted.') });
  }

  trackOrder(): void {
    if (!this.trackNumber.trim() || (!this.loginStatus && !this.trackToken.trim())) return;
    let params = new HttpParams();
    if (this.trackToken.trim()) params = params.set('tracking_token', this.trackToken.trim());
    this.http.get<any>(`${this.api}/track/${encodeURIComponent(this.trackNumber.trim())}/`, { params }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: order => { this.trackedOrder = order; this.trackToken = order.tracking_token || this.trackToken; this.error = ''; this.loadDigitalLibrary(); },
      error: err => { this.trackedOrder = null; this.showError(err, 'Order ID was not found or does not belong to this account.'); },
    });
  }

  loadDigitalLibrary(): void {
    this.digitalLibrary = [];
    if (!this.trackedOrder || this.trackedOrder.kind !== 'commerce' || this.trackedOrder.payment_status !== 'paid' || this.trackedOrder.status !== 'completed') return;
    const params = new HttpParams().set('order_number', this.trackNumber.trim()).set('tracking_token', this.trackToken.trim());
    this.http.get<any[]>(`${this.api}/digital-library/`, { params }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: books => this.digitalLibrary = books,
      error: () => this.digitalLibrary = [],
    });
  }

  toggleAccountMenu(event: Event): void {
    event.preventDefault(); event.stopPropagation();
    this.profilePictureMenuOpen = false;
    this.accountMenuOpen = !this.accountMenuOpen;
  }

  openProfilePictureMenu(event: MouseEvent): void {
    event.preventDefault(); event.stopPropagation();
    this.accountMenuOpen = false;
    this.profilePictureMenuOpen = true;
  }

  chooseProfilePicture(event: Event, input: HTMLInputElement): void {
    event.preventDefault(); event.stopPropagation();
    this.profilePictureMenuOpen = false;
    input.click();
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.notify('Use a JPG, PNG, or WebP image up to 5 MB.', true);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(image.src); this.notify('Profile picture could not be prepared.', true); return; }
      context.beginPath(); context.arc(256, 256, 256, 0, Math.PI * 2); context.clip();
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
      URL.revokeObjectURL(image.src);
      canvas.toBlob(blob => {
        if (!blob) { this.notify('Profile picture could not be prepared.', true); return; }
        this.profilePictureBusy = true;
        this.apiService.uploadProfilePicture(blob).subscribe({
          next: value => { this.profilePictureBusy = false; this.profileImageUrl = value?.profileImageUrl || null; this.notify('Profile picture updated.'); },
          error: error => { this.profilePictureBusy = false; this.notify(error?.error?.error || 'Profile picture could not be updated.', true); },
        });
      }, 'image/webp', .9);
    };
    image.onerror = () => { URL.revokeObjectURL(image.src); this.notify('The selected image could not be opened.', true); };
    image.src = URL.createObjectURL(file);
  }

  clearProfilePicture(event: Event): void {
    event.preventDefault(); event.stopPropagation();
    this.profilePictureMenuOpen = false;
    this.profilePictureBusy = true;
    this.apiService.removeProfilePicture().subscribe({
      next: () => { this.profilePictureBusy = false; this.profileImageUrl = null; this.notify('Profile picture cleared.'); },
      error: () => { this.profilePictureBusy = false; this.notify('Profile picture could not be cleared.', true); },
    });
  }

  logout(): void {
    this.authSession.stopSessionMonitor();
    this.authSession.clearStoredSession();
    window.location.assign('/login');
  }

  @HostListener('document:click', ['$event'])
  closeAccountMenus(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.commerce-account')) return;
    this.accountMenuOpen = false;
    this.profilePictureMenuOpen = false;
  }

  get cartCount(): number { return (this.cart?.items || []).reduce((sum, item) => sum + item.quantity, 0); }
  get showVariantChoice(): boolean {
    const variants=(this.selectedProduct?.variants || []).filter(variant => variant.is_active &&
      (variant.stock > 0 || variant.quantity_unspecified || variant.allow_backorder));
    if (variants.length > 1) return true;
    if (variants.length !== 1) return false;
    const variant = variants[0];
    const hasNamedOption = [variant.option1_name, variant.option1_value, variant.option2_name,
      variant.option2_value, variant.option3_name, variant.option3_value].some(value => !!String(value || '').trim());
    return hasNamedOption || !/^(default|standard|one size|single option)$/i.test(String(variant.title || '').trim());
  }
  get variantChoiceLabel(): string {
    const variants=this.selectedProduct?.variants || [];
    const names = [...new Set(variants.flatMap(v => [v.option1_name, v.option2_name, v.option3_name])
      .filter((name): name is string => !!name?.trim()))];
    return names.length ? names.join(' / ') : 'Choose an option';
  }
  private variantOptionValue(variant: ProductVariant, name: string): string {
    for (const n of [1, 2, 3] as const) if (String(variant[`option${n}_name`] || '').trim() === name)
      return String(variant[`option${n}_value`] || '').trim();
    return '';
  }
  get structuredOptionGroups(): Array<{name: string; values: string[]}> {
    const variants = this.selectedProduct?.variants || [];
    if (variants.length < 2) return [];
    const names = [...new Set(variants.flatMap(v => [v.option1_name, v.option2_name, v.option3_name])
      .map(value => String(value || '').trim()).filter(Boolean))];
    if (names.length < 2) return [];
    return names.sort((a, b) => (/(?:color|colour|রঙ)/i.test(b) ? 1 : /(?:color|colour|রঙ)/i.test(a) ? -1 :
      /(?:size|সাইজ)/i.test(b) ? 1 : /(?:size|সাইজ)/i.test(a) ? -1 : 0))
      .map(name => ({name, values: [...new Set(variants.map(v => this.variantOptionValue(v, name)).filter(Boolean))]}))
      .filter(group => group.values.length > 1);
  }
  structuredValueAvailable(name: string, value: string): boolean {
    const groups = this.structuredOptionGroups;
    const index = groups.findIndex(group => group.name === name);
    return (this.selectedProduct?.variants || []).some(variant => this.canAddVariant(variant) &&
      this.variantOptionValue(variant, name) === value && groups.slice(0, index).every(group =>
        !this.selectedOptionValues[group.name] || this.variantOptionValue(variant, group.name) === this.selectedOptionValues[group.name]));
  }
  selectStructuredOption(name: string, value: string): void {
    this.selectedOptionValues = {...this.selectedOptionValues, [name]: value};
    const groups = this.structuredOptionGroups;
    const changedIndex = groups.findIndex(group => group.name === name);
    for (const group of groups.slice(changedIndex + 1)) {
      const current = this.selectedOptionValues[group.name];
      if (current && !this.structuredValueAvailable(group.name, current)) {
        this.selectedOptionValues = {...this.selectedOptionValues, [group.name]: ''};
      }
    }
    const complete = groups.every(group => this.selectedOptionValues[group.name]);
    const matching = complete ? this.selectedProduct?.variants.find(variant => groups.every(group =>
      this.variantOptionValue(variant, group.name) === this.selectedOptionValues[group.name])) : null;
    this.selectedVariantId = matching && this.canAddVariant(matching) ? matching.id : null;
    this.selectVariantImage();
  }
  canAddVariant(variant: ProductVariant | null): boolean {
    return !!variant && variant.purchasable !== false && !!variant.is_active && !!(variant.stock > 0 || variant.quantity_unspecified || variant.allow_backorder);
  }
  private rememberCart(cart: Cart): void {
    this.cart = cart;
    if (cart.token) localStorage.setItem('cheradipEcommerceCart', cart.token);
    else localStorage.removeItem('cheradipEcommerceCart');
    localStorage.setItem('cheradipEcommerceCartOwner', this.loginStatus ? (localStorage.getItem('username') || '') : '');
    window.dispatchEvent(new CustomEvent<number>('cheradip-ecommerce-cart-count', { detail: this.cartCount }));
    this.requestQuote();
  }

  get cartNeedsConfirmation(): boolean {
    return !!this.cart?.items?.some(item=>item.stock_confirmation_required);
  }
  get cartQuantityUnspecified(): boolean {
    return !!this.cart?.items?.some(item=>item.quantity_unspecified);
  }
  private clearFeedback(): void { this.message = ''; this.error = ''; }
  private errorText(error: HttpErrorResponse, fallback: string): string {
    const data = error.error;
    if (typeof data?.detail === 'string') return data.detail;
    if (data && typeof data === 'object') return Object.entries(data).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ');
    if (error.status === 0) return `${fallback} Check your connection and try again.`;
    if (error.status >= 500) return `${fallback} The server could not complete the request (HTTP ${error.status}); please retry shortly.`;
    return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
  }
  private showError(error: HttpErrorResponse, fallback: string): void { this.error = this.errorText(error, fallback); this.notify(this.error, true); }
  private notify(message: string, error = false): void {
    this.snackBar.open(message, 'Close', {
      duration: error ? 7000 : 4500,
      horizontalPosition: 'center', verticalPosition: 'top',
      panelClass: ['package-center-snackbar', error ? 'error-snackbar' : 'success-snackbar'],
    });
  }
}
