import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../service/api.service';
import { AuthSessionService } from '../../service/auth-session.service';
import { getDashboardRouterLinkSegments } from '../../service/dashboard-route.util';
import { productImageMagnifier } from './product-image-magnifier';

interface Category { id: number; name: string; slug: string; product_count: number; }
interface Product {
  id: number; name: string; slug: string; short_description: string; category_name: string;
  price: string; compare_at_price?: string | null; stock: number; image_url: string;
  default_variant_id: number; featured: boolean; is_sample: boolean;
}
interface ProductVariant {
  id: number; title: string; sku: string; price: string; compare_at_price?: string | null;
  stock: number; is_active: boolean; option1_name?: string; option1_value?: string;
  option2_name?: string; option2_value?: string; option3_name?: string; option3_value?: string;
}
interface ProductDetail extends Product {
  delivery_dhaka_charge?: string | null;
  delivery_outside_dhaka_charge?: string | null;
  cod_percent?: string | null;
  description: string; brand_name?: string; variants: ProductVariant[];
  images: Array<{ id: number; url: string; alt_text: string; variant_id?: number }>;
  attributes?: Record<string, any>;
  approved_reviews?: Array<{customer_name: string; rating: number; title: string; body: string}>;
}
interface CartItem { id: number; variant_id: number; quantity: number; product_name: string; variant_title: string; sku: string; unit_price: string; image_url: string; line_total: number; }
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
  products: Product[] = [];
  cart: Cart | null = null;
  cartLoading = false;
  cartError = '';
  activeView: 'shop' | 'cart' | 'track' = 'shop';
  selectedCategory = '';
  search = '';
  brands: any[] = [];
  selectedBrand = '';
  minPrice: number | null = null;
  maxPrice: number | null = null;
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
  private catalogObserver?: IntersectionObserver;
  private catalogSentinel?: HTMLElement;
  private preloadedImages: HTMLImageElement[] = [];
  private readonly destroyed = new Subject<void>();
  private catalogQuery = new HttpParams();

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
  review = {rating: 5, title: '', body: ''};
  paymentRetryOrder: any = null;
  private quoteVersion = 0;
  private accountVersion = 0;
  private readonly accountChanged = new Subject<void>();
  private quoteTimer?: ReturnType<typeof setTimeout>;
  private productVersion = 0;
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
      const slug = params.get('product') || this.route.snapshot.paramMap?.get('slug');
      if (slug && this.selectedProduct?.slug !== slug) this.openProduct({slug} as Product);
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
        if (key in this.checkout && (this.checkout as any)[key] === (original as any)[key]) (this.checkout as any)[key] = data[key] || '';
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
    return {country_code: c.country_code || 'BD', division: c.division, district: c.district,
      thana: c.thana, zone: c.zone, address: c.address, city: c.city, postal_code: c.postal_code};
  }
  requestQuote(): void {
    this.quote = null; this.quoteError = '';
    const version = ++this.quoteVersion;
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    if (!this.cart?.items.length || !this.checkout.district) { this.quoteLoading = false; return; }
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
        if (this.checkout.payment_method === 'cod') { this.checkout.payment_method = 'wallet'; this.requestQuote(); }
      },
      error: () => {},
    });
  }

  loadCategories(): void {
    this.http.get<Category[]>(`${this.api}/categories/`).subscribe({
      next: data => this.categories = data,
      error: err => this.showError(err, 'Could not load categories.'),
    });
  }

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
    this.fetchProductBatch(true);
  }

  private fetchProductBatch(initial = false): void {
    if (this.loadingMore || !this.hasMoreProducts || this.catalogError) return;
    const generation = this.catalogGeneration;
    this.loadingMore = true;
    const params = this.catalogQuery.set('limit', initial ? 24 : 12).set('offset', this.catalogOffset);
    this.catalogRequest = this.http.get<any>(`${this.api}/products/`, { params }).subscribe({
      next: data => {
        if (generation !== this.catalogGeneration) return;
        const batch: Product[] = Array.isArray(data) ? data : (data.results || []);
        this.productCount = Array.isArray(data) ? data.length : Number(data.count || 0);
        this.catalogOffset += batch.length;
        this.hasMoreProducts = !Array.isArray(data) && Boolean(data.next) && batch.length > 0;
        const known = new Set([...this.products, ...this.productBuffer, ...this.revealQueue].map(product => product.id));
        const unique = batch.filter(product => !known.has(product.id) && Boolean(known.add(product.id)));
        if (initial) this.products = unique;
        else this.productBuffer.push(...unique);
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
      this.fetchProductBatch(!this.products.length);
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
      this.advanceCatalog();
    });
  }

  ngOnDestroy(): void {
    ++this.catalogGeneration;
    this.catalogRequest?.unsubscribe();
    this.catalogObserver?.disconnect();
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame);
    this.destroyed.next();
    this.destroyed.complete();
    this.preloadedImages = [];
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.accountChanged.next(); this.accountChanged.complete();
  }

  get visibleCategories(): Category[] {
    const query = this.categorySearch.trim().toLowerCase();
    return this.categories.filter(category => category.name.toLowerCase().includes(query));
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
    this.ordering = '-created_at';
    this.filtersOpen = false;
    this.loadProducts(1);
  }

  discountPercent(product: Product): number {
    const original = Number(product.compare_at_price);
    const price = Number(product.price);
    if (!Number.isFinite(original) || !Number.isFinite(price) || original <= price || price < 0) return 0;
    return Math.round((1 - price / original) * 100);
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
    this.hideProductMagnifier();
    const version = ++this.productVersion;
    this.lastProductTrigger = document.activeElement as HTMLElement;
    this.http.get<ProductDetail>(`${this.api}/products/${encodeURIComponent(product.slug)}/`).pipe(takeUntil(this.destroyed)).subscribe({
      next: detail => {
        if (version !== this.productVersion) return;
        this.selectedProduct = detail;
        const preferred = detail.variants.find(variant => variant.id === product.default_variant_id && variant.is_active && variant.stock > 0)
          || detail.variants.find(variant => variant.is_active && variant.stock > 0) || detail.variants[0] || null;
        this.selectedVariantId = preferred?.id || null;
        this.selectVariantImage();
        if (!this.route.snapshot.paramMap?.get('slug')) void this.router.navigate([], {queryParams: {product: detail.slug}, queryParamsHandling: 'merge', replaceUrl: true});
      },
      error: err => this.showError(err, 'Could not load product details.'),
    });
  }

  closeProduct(): void {
    ++this.productVersion; this.selectedProduct = null; this.selectedVariantId = null;
    this.lastProductTrigger?.focus();
    if (!this.route.snapshot.paramMap?.get('slug')) void this.router.navigate([], {queryParams: {product: null}, queryParamsHandling: 'merge', replaceUrl: true});
    else void this.router.navigate(['/ecommerce']);
  }

  @HostListener('document:keydown.escape') closeDialog(): void { if (this.selectedProduct) this.closeProduct(); this.filtersOpen = false; }
  selectVariantImage(): void {
    this.activeImage = this.selectedProduct?.images.find(i => i.variant_id === this.selectedVariantId)?.url
      || this.selectedProduct?.images[0]?.url || 'assets/images/cheradip.svg';
  }

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
    if (!product.default_variant_id || product.stock < 1) return;
    this.addVariantToCart(product.default_variant_id, product.name);
  }

  addSelectedVariantToCart(): void {
    const variant = this.selectedVariant;
    if (!variant || variant.stock < 1 || !this.selectedProduct) return;
    this.addVariantToCart(variant.id, this.selectedProduct.name);
    this.closeProduct();
  }

  private addVariantToCart(variantId: number, productName: string): void {
    const url = this.cart?.token ? `${this.api}/cart/${this.cart.token}/` : `${this.api}/cart/`;
    this.http.post<Cart>(url, { variant_id: variantId, quantity: 1 }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: cart => { this.rememberCart(cart); this.message = `${productName} added to cart.`; },
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
    this.http.post<Cart>(`${this.api}/cart/${this.cart.token}/`, { variant_id: item.variant_id, quantity, operation: 'set' }).pipe(takeUntil(this.accountChanged), takeUntil(this.destroyed)).subscribe({
      next: cart => this.rememberCart(cart), error: err => this.showError(err, 'Could not update quantity.'),
    });
  }

  placeOrder(): void {
    if (!this.cart?.items?.length || this.loading) return;
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
        this.message = `Order ID ${order.number} is Pending until administration marks it Order Completed.${balanceNote}`;
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
  private rememberCart(cart: Cart): void {
    this.cart = cart;
    if (cart.token) localStorage.setItem('cheradipEcommerceCart', cart.token);
    else localStorage.removeItem('cheradipEcommerceCart');
    localStorage.setItem('cheradipEcommerceCartOwner', this.loginStatus ? (localStorage.getItem('username') || '') : '');
    window.dispatchEvent(new CustomEvent<number>('cheradip-ecommerce-cart-count', { detail: this.cartCount }));
    this.requestQuote();
  }
  private clearFeedback(): void { this.message = ''; this.error = ''; }
  private errorText(error: HttpErrorResponse, fallback: string): string {
    const data = error.error;
    if (typeof data?.detail === 'string') return data.detail;
    if (data && typeof data === 'object') return Object.entries(data).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ');
    return fallback;
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
