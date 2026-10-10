import { Component, HostListener, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../service/api.service';
import { AuthSessionService } from '../../service/auth-session.service';
import { getDashboardRouterLinkSegments } from '../../service/dashboard-route.util';

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
export class EcommerceComingSoonComponent implements OnInit {
  private readonly api = `${environment.apiUrl}/ecommerce`;
  categories: Category[] = [];
  products: Product[] = [];
  cart: Cart | null = null;
  activeView: 'shop' | 'cart' | 'track' = 'shop';
  selectedCategory = '';
  search = '';
  ordering = '-created_at';
  loading = false;
  message = '';
  error = '';
  productCount = 0;
  currentPage = 1;
  nextPageAvailable = false;
  previousPageAvailable = false;
  selectedProduct: ProductDetail | null = null;
  selectedVariantId: number | null = null;
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

  get dashboardRouterSegments(): string[] { return getDashboardRouterLinkSegments(); }

  ngOnInit(): void {
    const requestedView = this.route.snapshot.queryParamMap.get('view');
    if (requestedView === 'cart' || requestedView === 'track') {
      this.activeView = requestedView;
    }
    this.loadCategories();
    this.loadProducts();
    this.loadCart(localStorage.getItem('cheradipEcommerceCart') || undefined);
    if (this.loginStatus) this.loadAccountSummary();
  }

  setView(view: 'shop' | 'cart' | 'track'): void {
    this.activeView = view;
    this.clearFeedback();
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

  loadProducts(page = 1): void {
    this.loading = true;
    let params = new HttpParams().set('ordering', this.ordering).set('page', page);
    if (this.selectedCategory) params = params.set('category', this.selectedCategory);
    if (this.search.trim()) params = params.set('search', this.search.trim());
    this.http.get<any>(`${this.api}/products/`, { params }).subscribe({
      next: data => {
        this.products = Array.isArray(data) ? data : (data.results || []);
        this.productCount = Array.isArray(data) ? data.length : (data.count || this.products.length);
        this.currentPage = page;
        this.nextPageAvailable = Boolean(!Array.isArray(data) && data.next);
        this.previousPageAvailable = Boolean(!Array.isArray(data) && data.previous);
        this.loading = false;
      },
      error: err => { this.loading = false; this.showError(err, 'Could not load products.'); },
    });
  }

  chooseCategory(slug: string): void { this.selectedCategory = slug; this.loadProducts(1); }

  openProduct(product: Product): void {
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

  get selectedVariant(): ProductVariant | null {
    return this.selectedProduct?.variants.find(variant => variant.id === this.selectedVariantId) || null;
  }

  loadCart(token?: string): void {
    const url = token ? `${this.api}/cart/${encodeURIComponent(token)}/` : `${this.api}/cart/`;
    this.http.get<Cart>(url).subscribe({
      next: cart => this.rememberCart(cart),
      error: () => { localStorage.removeItem('cheradipEcommerceCart'); if (token) this.loadCart(); },
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
    this.http.post<Cart>(`${this.api}/cart/${this.cart.token}/`, { variant_id: item.variant_id, quantity }).subscribe({
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
        if (order.walletBalanceTaka !== undefined) this.walletTaka = Number(order.walletBalanceTaka);
        if (order.referenceBalanceTaka !== undefined) this.referenceBalanceTaka = Number(order.referenceBalanceTaka);
        if (!['cod', 'wallet'].includes(this.checkout.payment_method)) this.submitPayment(order);
        const referenceUsed = Number(order.referenceUsedTaka || 0);
        this.message = referenceUsed > 0
          ? `Order ${order.number} placed successfully. ৳${referenceUsed.toFixed(2)} was used from your reference balance first.`
          : `Order ${order.number} placed successfully.`;
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
    if (!this.trackNumber.trim() || !this.trackToken.trim()) return;
    const params = new HttpParams().set('tracking_token', this.trackToken.trim());
    this.http.get<any>(`${this.api}/orders/${encodeURIComponent(this.trackNumber.trim())}/`, { params }).subscribe({
      next: order => { this.trackedOrder = order; this.error = ''; this.loadDigitalLibrary(); },
      error: err => { this.trackedOrder = null; this.showError(err, 'Order not found or tracking token is incorrect.'); },
    });
  }

  loadDigitalLibrary(): void {
    this.digitalLibrary = [];
    if (!this.trackedOrder || this.trackedOrder.payment_status !== 'paid') return;
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
    if ((event.target as HTMLElement).closest('.commerce-account')) return;
    this.accountMenuOpen = false;
    this.profilePictureMenuOpen = false;
  }

  get cartCount(): number { return (this.cart?.items || []).reduce((sum, item) => sum + item.quantity, 0); }
  private rememberCart(cart: Cart): void { this.cart = cart; localStorage.setItem('cheradipEcommerceCart', cart.token); }
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
