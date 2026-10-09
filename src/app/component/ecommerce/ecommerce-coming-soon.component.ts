import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ActivatedRoute } from '@angular/router';

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
  activeView: 'shop' | 'cart' | 'track' | 'admin' = 'shop';
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
  adminDashboard: any = null;
  adminOrders: any[] = [];
  adminPayments: any[] = [];
  importResult: any = null;
  uploadFile: File | null = null;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const requestedView = this.route.snapshot.queryParamMap.get('view');
    if (requestedView === 'cart' || requestedView === 'track' || requestedView === 'admin') {
      this.activeView = requestedView;
    }
    this.loadCategories();
    this.loadProducts();
    this.loadCart(localStorage.getItem('cheradipEcommerceCart') || undefined);
  }

  setView(view: 'shop' | 'cart' | 'track' | 'admin'): void {
    this.activeView = view;
    this.clearFeedback();
    if (view === 'admin') this.loadAdmin();
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
    };
    this.loading = true;
    this.http.post<any>(`${this.api}/checkout/`, payload).subscribe({
      next: order => {
        this.completedOrder = order; this.loading = false; this.trackNumber = order.number;
        this.trackToken = order.tracking_token; localStorage.removeItem('cheradipEcommerceCart'); this.cart = null;
        if (this.checkout.payment_method !== 'cod') this.submitPayment(order);
        this.message = `Order ${order.number} placed successfully.`;
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

  loadAdmin(): void {
    this.clearFeedback();
    this.http.get(`${this.api}/admin/dashboard/`).subscribe({ next: data => this.adminDashboard = data, error: err => this.showError(err, 'Sign in as an administrator to manage commerce.') });
    this.http.get<any>(`${this.api}/admin/orders/`).subscribe({ next: data => this.adminOrders = Array.isArray(data) ? data : (data.results || []), error: () => this.adminOrders = [] });
    this.http.get<any>(`${this.api}/admin/payments/`).subscribe({ next: data => this.adminPayments = Array.isArray(data) ? data : (data.results || []), error: () => this.adminPayments = [] });
  }

  updateOrder(order: any, newStatus: string): void {
    this.http.patch<any>(`${this.api}/admin/orders/${order.number}/`, { status: newStatus }).subscribe({
      next: updated => { Object.assign(order, updated); this.message = `Order ${order.number} updated.`; this.loadAdmin(); },
      error: err => this.showError(err, 'Could not update order.'),
    });
  }

  confirmPayment(payment: any): void {
    this.http.patch<any>(`${this.api}/admin/payments/${payment.id}/`, { status: 'confirmed' }).subscribe({
      next: updated => { Object.assign(payment, updated); this.message = 'Payment confirmed.'; this.loadAdmin(); },
      error: err => this.showError(err, 'Could not confirm payment.'),
    });
  }

  selectCsv(event: Event): void { this.uploadFile = (event.target as HTMLInputElement).files?.[0] || null; }

  importCsv(): void {
    if (!this.uploadFile) return;
    const body = new FormData(); body.append('file', this.uploadFile);
    this.http.post(`${this.api}/admin/import/products/`, body).subscribe({
      next: result => { this.importResult = result; this.message = 'CSV import completed.'; this.loadProducts(); this.loadCategories(); },
      error: err => this.showError(err, 'CSV import failed.'),
    });
  }

  get cartCount(): number { return (this.cart?.items || []).reduce((sum, item) => sum + item.quantity, 0); }
  get sampleCsvUrl(): string { return `${this.api}/admin/import/sample.csv`; }
  private rememberCart(cart: Cart): void { this.cart = cart; localStorage.setItem('cheradipEcommerceCart', cart.token); }
  private clearFeedback(): void { this.message = ''; this.error = ''; }
  private showError(error: HttpErrorResponse, fallback: string): void { this.error = error.error?.detail || fallback; }
}
