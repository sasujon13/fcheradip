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
  description: string; brand_name?: string; variants: ProductVariant[];
  images: Array<{ id: number; url: string; alt_text: string }>;
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
      this.ensureCatalogLoaded();
      this.advanceCatalog();
    });
    const cartOwner = localStorage.getItem('cheradipEcommerceCartOwner') || '';
    const currentOwner = this.loginStatus ? (localStorage.getItem('username') || '') : '';
    if (cartOwner && cartOwner !== currentOwner) localStorage.removeItem('cheradipEcommerceCart');
    this.loadCart(localStorage.getItem('cheradipEcommerceCart') || undefined);
    if (this.loginStatus) this.loadAccountSummary();
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

  loadAccountSummary(): void {
    this.apiService.getCommerceHistory().subscribe({
      next: value => {
        this.profileImageUrl = value?.profile?.profileImageUrl || null;
        this.profileBadge = value?.profile?.badge || 'None';
        this.walletTaka = Number(value?.wallet?.balanceTaka || 0);
        this.referenceBalanceTaka = Number(value?.wallet?.referenceBalanceTaka || 0);
        if (this.checkout.payment_method === 'cod') this.checkout.payment_method = 'wallet';
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
    this.http.get<ProductDetail>(`${this.api}/products/${encodeURIComponent(product.slug)}/`).subscribe({
      next: detail => {
        this.selectedProduct = detail;
        const preferred = detail.variants.find(variant => variant.id === product.default_variant_id && variant.is_active)
          || detail.variants.find(variant => variant.is_active) || null;
        this.selectedVariantId = preferred?.id || null;
      },
      error: err => this.showError(err, 'Could not load product details.'),
    });
  }

  closeProduct(): void { this.selectedProduct = null; this.selectedVariantId = null; }

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
    this.cartLoading = true;
    this.cartError = '';
    const url = token ? `${this.api}/cart/${encodeURIComponent(token)}/` : `${this.api}/cart/`;
    this.http.get<Cart>(url).subscribe({
      next: cart => { this.rememberCart(cart); this.cartLoading = false; },
      error: err => {
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
    this.http.post<Cart>(url, { variant_id: variantId, quantity: 1 }).subscribe({
      next: cart => { this.rememberCart(cart); this.message = `${productName} added to cart.`; },
      error: err => this.showError(err, 'Could not add this product.'),
    });
  }

  updateCartItem(item: CartItem, quantity: number): void {
    if (!this.cart) return;
    if (quantity <= 0) {
      const params = new HttpParams().set('item_id', item.id);
      this.http.delete<Cart>(`${this.api}/cart/${this.cart.token}/`, { params }).subscribe({
        next: cart => this.rememberCart(cart), error: err => this.showError(err, 'Could not remove item.'),
      });
      return;
    }
    this.http.post<Cart>(`${this.api}/cart/${this.cart.token}/`, { variant_id: item.variant_id, quantity, operation: 'set' }).subscribe({
      next: cart => this.rememberCart(cart), error: err => this.showError(err, 'Could not update quantity.'),
    });
  }

  placeOrder(): void {
    if (!this.cart?.items?.length) return;
    this.clearFeedback();
    const payload = {
      cart_token: this.cart.token, customer_name: this.checkout.customer_name,
      email: this.checkout.email, phone: this.checkout.phone,
      shipping_address: { address: this.checkout.address, city: this.checkout.city, district: this.checkout.district, postal_code: this.checkout.postal_code },
      customer_note: this.checkout.customer_note, coupon_code: this.checkout.coupon_code,
      payment_method: this.checkout.payment_method,
    };
    this.loading = true;
    this.http.post<any>(`${this.api}/checkout/`, payload).subscribe({
      next: order => {
        this.completedOrder = order; this.loading = false; this.trackNumber = order.number;
        this.trackToken = order.tracking_token; localStorage.removeItem('cheradipEcommerceCart'); this.cart = null;
        window.dispatchEvent(new CustomEvent<number>('cheradip-ecommerce-cart-count', { detail: 0 }));
        if (order.walletBalanceTaka !== undefined) this.walletTaka = Number(order.walletBalanceTaka);
        if (order.referenceBalanceTaka !== undefined) this.referenceBalanceTaka = Number(order.referenceBalanceTaka);
        if (!['cod', 'wallet'].includes(this.checkout.payment_method)) this.submitPayment(order);
        const referenceUsed = Number(order.referenceUsedTaka || 0);
        const balanceNote = referenceUsed > 0
          ? ` ৳${referenceUsed.toFixed(2)} was used from your reference balance first.`
          : '';
        this.message = `Order ID ${order.number} is Pending until administration marks it Order Completed.${balanceNote}`;
      },
      error: err => { this.loading = false; this.showError(err, 'Could not place the order.'); },
    });
  }

  submitPayment(order: any): void {
    this.http.post(`${this.api}/orders/${order.number}/payments/`, {
      tracking_token: order.tracking_token, method: this.checkout.payment_method,
      transaction_id: this.checkout.transaction_id, payer_phone: this.checkout.phone, amount: order.grand_total,
    }).subscribe({ error: err => this.showError(err, 'Order placed, but payment information was not submitted.') });
  }

  trackOrder(): void {
    if (!this.trackNumber.trim() || (!this.loginStatus && !this.trackToken.trim())) return;
    let params = new HttpParams();
    if (this.trackToken.trim()) params = params.set('tracking_token', this.trackToken.trim());
    this.http.get<any>(`${this.api}/track/${encodeURIComponent(this.trackNumber.trim())}/`, { params }).subscribe({
      next: order => { this.trackedOrder = order; this.trackToken = order.tracking_token || this.trackToken; this.error = ''; this.loadDigitalLibrary(); },
      error: err => { this.trackedOrder = null; this.showError(err, 'Order ID was not found or does not belong to this account.'); },
    });
  }

  loadDigitalLibrary(): void {
    this.digitalLibrary = [];
    if (!this.trackedOrder || this.trackedOrder.kind !== 'commerce' || this.trackedOrder.payment_status !== 'paid' || this.trackedOrder.status !== 'completed') return;
    const params = new HttpParams().set('order_number', this.trackNumber.trim()).set('tracking_token', this.trackToken.trim());
    this.http.get<any[]>(`${this.api}/digital-library/`, { params }).subscribe({
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
    localStorage.setItem('cheradipEcommerceCart', cart.token);
    localStorage.setItem('cheradipEcommerceCartOwner', this.loginStatus ? (localStorage.getItem('username') || '') : '');
    window.dispatchEvent(new CustomEvent<number>('cheradip-ecommerce-cart-count', { detail: this.cartCount }));
  }
  private clearFeedback(): void { this.message = ''; this.error = ''; }
  private showError(error: HttpErrorResponse, fallback: string): void { this.error = error.error?.detail || fallback; }
  private notify(message: string, error = false): void {
    this.snackBar.open(message, 'Close', {
      duration: error ? 7000 : 4500,
      horizontalPosition: 'center', verticalPosition: 'top',
      panelClass: ['package-center-snackbar', error ? 'error-snackbar' : 'success-snackbar'],
    });
  }
}
