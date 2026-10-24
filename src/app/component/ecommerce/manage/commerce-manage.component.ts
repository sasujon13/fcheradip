import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, timeout } from 'rxjs';
import { CommerceAccess, CommerceManagementService } from '../../../service/commerce-management.service';
import { environment } from '../../../../environments/environment';
import { SuppliersComponent } from './suppliers/suppliers.component';
import { PricingRulesComponent } from './pricing-rules.component';

interface Section { key: string; label: string; icon: string; model: string; endpoint: string; description: string; }
interface Field { key: string; label: string; type?: string; required?: boolean; options?: {value: any; label: string}[]; }

@Component({
  selector: 'app-commerce-manage', standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, A11yModule, SuppliersComponent,PricingRulesComponent],
  templateUrl: './commerce-manage.component.html', styleUrls: ['./commerce-manage.component.css'],
})
export class CommerceManageComponent implements OnInit, OnDestroy {
  readonly pricingFields = [
    {key: 'supplier_delivery_max', label: 'Maximum supplier delivery (Tk)'},
    {key: 'customer_delivery_charge', label: 'Customer delivery budget (Tk)'},
    {key: 'ads_cost', label: 'Ads cost per item (Tk)'},
    {key: 'packaging_cost', label: 'Packaging per item (Tk)'},
    {key: 'returns_allowance', label: 'Return / failed-delivery allowance (Tk)'},
    {key: 'other_costs', label: 'Other costs per item (Tk)'},
  ];
  pricingDefaultDelivery = 80;
  readonly courierZones = ['dhaka','suburbs','outside'];
  readonly sharedCostFields = ['ads_cost','packaging_cost','returns_allowance','other_costs'];
  pricingDefaults: any = {supplier_delivery_max:160, customer_delivery_charge:75, ads_cost:20, packaging_cost:11, returns_allowance:48.75, other_costs:0};
  pricingResearch: any = null;
  pricingPreviews = new Map<any, {fingerprint: string; result: any}>();
  pricingLoading = new Set<any>();
  pricingErrors = new Map<any, string>();
  readonly sections: Section[] = [
    {key: 'overview', label: 'Overview', icon: 'fa-line-chart', model: 'order', endpoint: 'dashboard', description: 'Sales, pending work, stock alerts, and business shortcuts.'},
    {key: 'suppliers', label: 'Suppliers', icon: 'fa-truck', model: 'supplier', endpoint: 'suppliers', description: 'Private sourcing, exact matches, market evidence, blacklist review and selective draft imports.'},
    {key: 'products', label: 'Products', icon: 'fa-shopping-bag', model: 'product', endpoint: 'products', description: 'Create products, upload photos, set prices, manage variants, and publish your catalog.'},
    {key:'pricing',label:'Pricing rules',icon:'fa-percent',model:'deliverysettings',endpoint:'',description:'Edit central profit bands and automatic sale discount; preview and apply generated supplier prices safely.'},
    {key: 'orders', label: 'Orders', icon: 'fa-shopping-cart', model: 'order', endpoint: 'orders', description: 'Review purchases and update fulfillment using the existing order rules.'},
    {key: 'payments', label: 'Payments', icon: 'fa-credit-card', model: 'payment', endpoint: 'payments', description: 'Review payment details before confirming or updating a payment.'},
    {key: 'inventory', label: 'Inventory', icon: 'fa-cubes', model: 'productvariant', endpoint: 'variants', description: 'Search SKUs, check available stock, and record stock adjustments.'},
    {key: 'imports', label: 'CSV imports', icon: 'fa-upload', model: 'importjob', endpoint: 'imports', description: 'Download the sample CSV, upload your catalog, and review failed rows.'},
    {key: 'categories', label: 'Categories', icon: 'fa-sitemap', model: 'category', endpoint: 'categories', description: 'Organize your products into departments and subcategories.'},
    {key: 'brands', label: 'Brands', icon: 'fa-tag', model: 'brand', endpoint: 'brands', description: 'Manage brand names and logos.'},
    {key: 'books', label: 'Books & ebooks', icon: 'fa-book', model: 'book', endpoint: 'books', description: 'Manage uploaded books, create books from questions, and maintain covers, files, and prices in Django.'},
    {key: 'shipments', label: 'Shipping', icon: 'fa-truck', model: 'shipment', endpoint: 'shipments', description: 'Manage carrier details and validated shipping status. Fulfilment updates also update the order.'},
    {key: 'delivery-settings', label: 'Delivery & policy', icon: 'fa-cogs', model: 'deliverysettings', endpoint: 'delivery-settings', description: 'Manage courier weight bands, fallback delivery fees, COD and private listing-cost defaults.'},
    {key: 'coupons', label: 'Discounts', icon: 'fa-ticket', model: 'coupon', endpoint: 'coupons', description: 'Create coupons with spending limits, expiry dates, and usage limits.'},
    {key: 'reviews', label: 'Reviews', icon: 'fa-star', model: 'review', endpoint: 'reviews', description: 'Approve or hide customer reviews without changing their words or ratings.'},
    {key: 'notifications', label: 'Notifications', icon: 'fa-bell', model: 'commercenotification', endpoint: 'notifications', description: 'Follow business alerts and mark reviewed notifications as read.'},
  ];
  readonly orderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned', 'refunded'];
  access: CommerceAccess = {allowed: false, permissions: {}};
  section = this.sections.find(s => s.key === 'overview')!;
  records: any[] = [];
  stats: any = {};
  showContribution = false;
  categories: any[] = [];
  brands: any[] = [];
  loading = true;
  busy = false;
  error = '';
  search = '';
  filter = '';
  offset = 0;
  count = 0;
  readonly pageSize = 25;
  editor: any = null;
  editorKind = '';
  fields: Field[] = [];
  detail: any = null;
  pendingAction: {title: string; message: string; run: () => Promise<void>} | null = null;
  csvFile: File | null = null;
  importResult: any = null;
  importProgress = '';
  private generation = 0;
  private destroyed = false;
  private originalImages = '';
  private originalVariants: any[] = [];
  private accessVersion = 0;

  constructor(public service: CommerceManagementService, private router: Router, private snack: MatSnackBar,
    private changeDetector?: ChangeDetectorRef) {}

  get visibleSections() { return this.sections.filter(s => this.can(s.model, 'view') || (s.key === 'imports' && this.canImport)); }
  get canImport() { return this.can('product', 'add') && this.can('product', 'change'); }
  get canAddProduct() { return this.can('product', 'add') && this.can('productvariant', 'add'); }
  get canEditProduct() { return this.can('product', 'change') && this.can('productvariant', 'change'); }
  get canAdjustStock() { return this.can('inventorymovement', 'add') && this.can('productvariant', 'change'); }
  get pageEnd() { return Math.min(this.offset + this.records.length, this.count); }
  get productForm() { return this.editorKind === 'product'; }
  can(model: string, action: 'view' | 'add' | 'change' | 'delete') { return !!this.access.permissions[model]?.[action]; }
  label(value: string) { return (value || '').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase()); }

  async ngOnInit() {
    const version = ++this.accessVersion;
    try {
      const access = await firstValueFrom(this.service.access());
      if (version !== this.accessVersion || this.destroyed) return;
      this.access = access;
      if (!this.access.allowed) { await this.router.navigate(['/ecommerce']); return; }
      const requested = this.router.parseUrl(this.router.url).queryParams['section'];
      this.section = this.visibleSections.find(s => s.key === requested) || this.visibleSections[0] || this.sections[0];
      await Promise.all([this.load(), this.lookups()]);
    } catch (err) { this.showError(err); }
    finally { this.loading = false; }
  }

  @HostListener('window:cheradip-session-changed') sessionChanged() {
    ++this.accessVersion; ++this.generation;
    this.records = []; this.stats = {}; this.editor = this.detail = this.pendingAction = null;
    this.access = {allowed: false, permissions: {}};
    void this.router.navigate(['/ecommerce']);
  }
  @HostListener('document:keydown.escape') closeOnEscape() { if (!this.busy) this.closeEditor(); }
  ngOnDestroy() { this.destroyed = true; ++this.generation; ++this.accessVersion; }

  async select(section: Section) {
    if (!this.visibleSections.includes(section)) return;
    this.section = section; this.search = this.filter = ''; this.offset = 0; this.detail = null;
    void this.router.navigate([], {queryParams: {section: section.key}, queryParamsHandling: 'merge', replaceUrl: true});
    await this.load();
  }

  async load(reset = false) {
    if (reset) this.offset = 0;
    const version = ++this.generation;
    this.loading = true; this.error = ''; this.records = [];
    try {
      if (this.section.key === 'overview') {
        if (this.can('order', 'view')) {
          const value = await firstValueFrom(this.service.http.get<any>(`${this.service.url}/dashboard/`));
          if (version === this.generation && !this.destroyed) this.stats = value;
        }
      } else if (this.can(this.section.model, 'view') && !['books','suppliers','pricing'].includes(this.section.key)) {
        const data = await firstValueFrom(this.service.http.get<any>(`${this.service.url}/${this.section.endpoint}/`, {
          params: {limit: this.pageSize, offset: this.offset, search: this.search, ...(this.filter ? {status: this.filter} : {})},
        }));
        if (version === this.generation && !this.destroyed) {
          this.records = this.section.key === 'delivery-settings' ? [data] : Array.isArray(data) ? data : data.results || [];
          this.count = Array.isArray(data) ? data.length : data.count || 0;
        }
      }
    } catch (err) { if (version === this.generation) this.showError(err); }
    finally { if (version === this.generation) this.loading = false; }
  }

  async page(delta: number) { this.offset = Math.max(0, this.offset + delta * this.pageSize); await this.load(); }

  private async allLookup(endpoint: string, publicEndpoint: string) {
    const url = this.can(endpoint === 'categories' ? 'category' : 'brand', 'view')
      ? `${this.service.url}/${endpoint}/` : `${environment.apiUrl}/ecommerce/${publicEndpoint}/`;
    let offset = 0; const records: any[] = [];
    while (!this.destroyed) {
      const page = await firstValueFrom(this.service.http.get<any>(url, {params: {limit: 100, offset}}));
      records.push(...(Array.isArray(page) ? page : page.results || []));
      if (Array.isArray(page) || !page.next) return records;
      offset += 100;
    }
    return records;
  }
  private async lookups() {
    try { [this.categories, this.brands] = await Promise.all([this.allLookup('categories', 'categories'), this.allLookup('brands', 'brands')]); }
    catch { /* Product forms report missing categories without blocking other business tools. */ }
    try {
      const policy: any = await firstValueFrom(this.service.http.get(`${environment.apiUrl}/ecommerce/store-policy/`));
      if (policy.dhaka_charge != null) this.pricingDefaultDelivery = Number(policy.dhaka_charge);
    } catch { /* Saved calculator budgets are never overwritten by a policy refresh. */ }
    if (this.can('productvariant','view')) try {
      const defaults: any = await firstValueFrom(this.service.http.get(`${this.service.url}/pricing/preview/`));
      if (defaults.costs) this.pricingDefaults = defaults.costs;
      this.pricingResearch = defaults.research;
    } catch { /* Calculate always resolves current server defaults before a price can be applied. */ }
  }

  newVariant() {
    const variant = {title: 'Default', sku: '', price: '0.00', stock: 0, is_active: true, requires_shipping: true, allow_backorder: false, low_stock_threshold: 5, currency: 'BDT'};
    this.preparePricing(variant); return variant;
  }
  editProduct(product?: any) {
    this.error = ''; this.editorKind = 'product';
    this.pricingPreviews.clear(); this.pricingErrors.clear(); this.pricingLoading.clear();
    this.editor = null;
    this.editor = product ? JSON.parse(JSON.stringify(product)) : {
      name: '', slug: '', category: this.categories[0]?.id || '', brand: null, short_description: '',
      description: '', status: 'draft', product_type: 'physical', tags: '', featured: false,
      delivery_dhaka_charge: null, delivery_outside_dhaka_charge: null, cod_percent: null,
      variants: [this.newVariant()], images: [],
    };
    this.originalImages = JSON.stringify(this.editor.images);
    this.originalVariants = JSON.parse(JSON.stringify(this.editor.variants));
    for (const variant of this.editor.variants) this.preparePricing(variant);
    this.editor.specs = Object.entries(this.editor.attributes || {}).map(([name, value]) => {
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return {name, value: text, originalText: text, originalValue: value};
    });
  }
  suggestSlug() {
    if (!this.editor.slug) this.editor.slug = this.editor.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  preparePricing(variant: any) {
    if (variant._use_default_costs == null) variant._use_default_costs = !Object.keys(variant.pricing_inputs || {}).length;
    variant.pricing_inputs = {...this.pricingDefaults, ...variant.pricing_inputs};
  }
  resetPricingDefaults(variant: any) {
    variant._use_default_costs = true; variant.pricing_inputs = {...this.pricingDefaults};
    this.pricingPreviews.delete(variant);
  }
  private pricingFingerprint(variant: any) {
    return JSON.stringify([variant.cost_price, variant.pricing_inputs, variant.weight_grams || 0, variant._use_default_costs]);
  }
  pricingReady(variant: any) {
    return this.pricingPreviews.get(variant)?.fingerprint === this.pricingFingerprint(variant);
  }
  async calculatePricing(variant: any) {
    if (this.pricingLoading.has(variant)) return;
    const editor = this.editor; const fingerprint = this.pricingFingerprint(variant);
    this.pricingLoading.add(variant); this.pricingErrors.delete(variant); this.pricingPreviews.delete(variant);
    try {
      const result = await firstValueFrom(this.service.http.post<any>(`${this.service.url}/pricing/preview/`, {
        source_cost: variant.cost_price, costs: variant.pricing_inputs, use_defaults: !!variant._use_default_costs, weight_grams: variant.weight_grams || 0,
      }).pipe(timeout(15000)));
      if (this.editor === editor && editor.variants.includes(variant) && this.pricingFingerprint(variant) === fingerprint) {
        if (variant._use_default_costs && result.costs) variant.pricing_inputs = result.costs;
        this.pricingPreviews.set(variant, {fingerprint:this.pricingFingerprint(variant), result});
      }
    } catch (err: any) {
      if (this.editor === editor) this.pricingErrors.set(variant, err?.name === 'TimeoutError'
        ? 'Calculation timed out. Please try again.' : err?.error?.detail || 'Enter valid costs and try again.');
    } finally {
      this.pricingLoading.delete(variant);
      if (!this.destroyed) this.changeDetector?.detectChanges();
    }
  }
  applyPricing(variant: any) {
    if (!this.pricingReady(variant)) return;
    variant.price = this.pricingPreviews.get(variant)!.result.suggested_price;
    this.notify('Suggested price applied to this draft. Save changes to publish it.');
  }
  removeVariant(index: number) {
    const variant = this.editor.variants[index];
    if (variant.id) variant.is_active = false; else this.editor.variants.splice(index, 1);
  }
  async uploadImage(event: Event) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.notify('Choose a JPG, PNG, or WebP image up to 5 MB.'); return;
    }
    const data = new FormData(); data.append('file', file);
    this.busy = true;
    try {
      const result = await firstValueFrom(this.service.http.post<{url: string}>(`${this.service.url}/upload-image/`, data));
      this.editor.images.push({url: result.url, alt_text: this.editor.name, position: this.editor.images.length});
    } catch (err) { this.showError(err); }
    finally { this.busy = false; }
  }
  closeEditor() {
    this.editor = this.detail = this.pendingAction = null; this.error = '';
    this.pricingPreviews.clear(); this.pricingErrors.clear(); this.pricingLoading.clear();
  }

  async saveEditor() {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      if (this.editorKind === 'stock') {
        await firstValueFrom(this.service.http.post(`${this.service.url}/inventory/`, {
          variant_id: this.editor.id, quantity: String(this.editor.quantity), note: this.editor.note || '',
        }));
      } else {
        const endpoint = this.productForm ? 'products' : this.editorKind;
        let payload = this.productForm ? this.productPayload() : this.recordPayload();
        const id = this.editor.id;
        await firstValueFrom(this.editorKind === 'delivery-settings'
          ? this.service.http.patch(`${this.service.url}/delivery-settings/`, payload) : id
          ? this.service.http.patch(`${this.service.url}/${endpoint}/${id}/`, payload)
          : this.service.http.post(`${this.service.url}/${endpoint}/`, payload));
      }
      this.closeEditor(); this.notify('Saved successfully.'); await this.load(); await this.lookups();
    } catch (err) { this.showError(err); }
    finally { this.busy = false; }
  }

  private productPayload() {
    const e = this.editor;
    return {name: e.name, slug: e.slug, category: Number(e.category), brand: e.brand ? Number(e.brand) : null,
      short_description: e.short_description, description: e.description, status: e.status,
      product_type: e.product_type, tags: e.tags, featured: e.featured,
      supplier_delivery_rates: e.supplier_delivery_rates || {},
      seo_title: e.seo_title || '', seo_description: e.seo_description || '',
      delivery_dhaka_charge: e.delivery_dhaka_charge === '' || e.delivery_dhaka_charge == null ? null : e.delivery_dhaka_charge,
      delivery_outside_dhaka_charge: e.delivery_outside_dhaka_charge === '' || e.delivery_outside_dhaka_charge == null ? null : e.delivery_outside_dhaka_charge,
      cod_percent: e.cod_percent === '' || e.cod_percent == null ? null : e.cod_percent,
      attributes: Object.fromEntries((e.specs || []).filter((s: any) => s.name.trim()).map((s: any) =>
        [s.name.trim(), s.value === s.originalText ? s.originalValue : s.value])),
      variants: e.variants.map((v: any) => {
        const original = this.originalVariants.find(row => row.id && row.id === v.id);
        const {stock, _use_default_costs, ...values} = v;
        return {...values, compare_at_price: v.compare_at_price === '' || v.compare_at_price == null ? null : v.compare_at_price,
          pricing_inputs: _use_default_costs ? {} : v.pricing_inputs,
          cost_price: v.cost_price === '' || v.cost_price == null ? null : v.cost_price,
          // An unrelated edit must never overwrite stock reduced by a concurrent sale.
          ...(!original || Number(stock) !== Number(original.stock)
            ? {stock, ...(original ? {expected_stock: original.stock} : {})} : {}),
        };
      }),
      // Unchanged image sets need no delete permission; explicit removal is checked by the server.
      ...(JSON.stringify(e.images) !== this.originalImages ? {images: e.images.map((i: any, n: number) => ({...i, position: n}))} : {}),
    };
  }

  addSupplierDeliveryBand(area: 'dhaka' | 'outside') {
    const rates = this.editor.supplier_delivery_rates ||= {};
    const bands = rates[area] ||= [];
    if (bands.length < 30) bands.push({up_to_grams: (bands[bands.length - 1]?.up_to_grams || 0) + 1000, charge: 0});
  }
  removeSupplierDeliveryBand(area: string, index: number) {
    const rates = this.editor.supplier_delivery_rates;
    rates[area].splice(index, 1);
    if (!rates[area].length) delete rates[area];
    if (!rates.dhaka && !rates.outside) this.editor.supplier_delivery_rates = {};
  }
  deleteShipmentGroup() { delete this.editor.supplier_delivery_rates.shipment_group; }

  editRecord(row?: any) {
    const kind = this.section.key;
    this.editorKind = kind; this.error = '';
    const option = (values: string[]) => values.map(value => ({value, label: this.label(value)}));
    const name: Field = {key: 'name', label: 'Name', required: true};
    const slug: Field = {key: 'slug', label: 'URL name (English letters, numbers and hyphens)', required: true};
    const active: Field = {key: 'is_active', label: 'Active', type: 'checkbox'};
    this.fields = kind === 'delivery-settings' ? [
      {key: 'dhaka_charge', label: 'Missing-weight fallback: Dhaka district (Tk)', type: 'number', required: true},
      {key: 'outside_dhaka_charge', label: 'Missing-weight fallback: outside Dhaka (Tk)', type: 'number', required: true},
      {key: 'cod_percent', label: 'Default COD charge (%)', type: 'number', required: true},
      {key: 'delivery_subsidy_enabled', label: 'Include delivery subsidy in new price suggestions (off by default)', type: 'checkbox'},
      {key: 'unpaid_reservation_hours', label: 'Unpaid order reservation (hours)', type: 'number', required: true},
      {key: 'support_phone', label: 'Support contact number'}, {key: 'return_policy', label: 'Delivery & return policy', type: 'textarea'},
    ] : kind === 'categories' ? [name, slug, {key: 'description', label: 'Description', type: 'textarea'},
      {key: 'parent', label: 'Parent category', type: 'select', options: [{value: '', label: 'No parent'}, ...this.categories.filter(c => c.id !== row?.id).map(c => ({value: c.id, label: c.name}))]},
      {key: 'sort_order', label: 'Sort order', type: 'number'}, active] : kind === 'brands' ? [name, slug, {key: 'logo_url', label: 'Logo URL', type: 'url'}, active] : kind === 'coupons' ? [
      {key: 'code', label: 'Coupon code', required: true}, {key: 'discount_type', label: 'Discount type', type: 'select', options: option(['percent', 'fixed', 'shipping'])},
      {key: 'value', label: 'Discount value', type: 'number', required: true}, {key: 'minimum_order', label: 'Minimum spend (Tk)', type: 'number'},
      {key: 'usage_limit', label: 'Usage limit (empty means unlimited)', type: 'number'}, {key: 'starts_at', label: 'Starts', type: 'datetime-local'},
      {key: 'ends_at', label: 'Ends', type: 'datetime-local'}, active] : [
      {key: 'order', label: 'Order database ID (shown in order details)', type: 'number', required: true},
      {key: 'carrier', label: 'Delivery company'}, {key: 'tracking_number', label: 'Tracking number'},
      {key: 'tracking_url', label: 'Tracking website', type: 'url'}, {key: 'status', label: 'Shipping status', type: 'select', options: option(['preparing', 'shipped', 'delivered', 'returned'])},
      {key: 'shipped_at', label: 'Shipped at', type: 'datetime-local'}, {key: 'delivered_at', label: 'Delivered at', type: 'datetime-local'},
    ];
    this.editor = row ? JSON.parse(JSON.stringify(row)) : {is_active: true, sort_order: 0, discount_type: 'percent', value: 0, minimum_order: 0, status: 'preparing'};
    if (kind === 'delivery-settings') this.editor.cost_defaults = {...this.pricingDefaults, ...this.editor.cost_defaults};
    for (const key of ['starts_at', 'ends_at', 'shipped_at', 'delivered_at']) {
      if (this.editor[key]) {
        const date = new Date(this.editor[key]); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        this.editor[key] = date.toISOString().slice(0, 16);
      }
    }
  }
  private recordPayload() {
    const payload: any = {};
    for (const field of this.fields) {
      const value = this.editor[field.key];
      payload[field.key] = field.type === 'datetime-local' ? (value ? new Date(value).toISOString() : null)
        : field.type === 'number' || field.key === 'parent' ? (value === '' || value == null ? null : Number(value))
        : field.type === 'checkbox' ? !!value : value || '';
    }
    if (this.editorKind === 'delivery-settings') {
      payload.cost_defaults = Object.fromEntries(this.sharedCostFields.map(key => [key,this.editor.cost_defaults[key]]));
      payload.courier_profiles = this.editor.courier_profiles;
    }
    return payload;
  }
  addCourierProfile() {
    const profile = JSON.parse(JSON.stringify(this.editor.courier_profiles[0]));
    profile.name = 'New courier'; profile.source_url = ''; profile.reviewed_on = '';
    this.editor.courier_profiles.push(profile);
  }
  addWeightBand(rule: any) {
    const previous = rule.bands[rule.bands.length-1];
    rule.bands.push({up_to_grams:previous.up_to_grams+1000,charge:previous.charge});
    rule.max_weight_grams = Math.max(rule.max_weight_grams,previous.up_to_grams+1000);
  }
  adjustStock(row: any) {
    this.editorKind = 'stock'; this.editor = {...row, quantity: '', note: ''}; this.error = '';
  }
  requestUpdate(endpoint: string, id: number | string, payload: any, title: string, message: string) {
    this.pendingAction = {title, message, run: async () => {
      await firstValueFrom(this.service.http.patch(`${this.service.url}/${endpoint}/${encodeURIComponent(String(id))}/`, payload));
      this.detail = null; this.notify('Updated successfully.'); await this.load();
    }};
  }
  requestArchive(row: any) {
    this.pendingAction = {title: 'Archive product?', message: `${row.name} will be hidden from the shop. Existing orders are kept.`, run: async () => {
      await firstValueFrom(this.service.http.post(`${this.service.url}/products/${row.id}/archive/`, {}));
      this.notify('Product archived.'); await this.load();
    }};
  }
  requestDelete(row: any) {
    this.pendingAction = {title: 'Permanently delete product?', message: `${row.name}, its photos and variants will be removed. This cannot be undone here. Products with order history are protected; archive those instead.`, run: async () => {
      await firstValueFrom(this.service.http.delete(`${this.service.url}/products/${row.id}/`));
      this.notify('Product permanently deleted.'); await this.load();
    }};
  }
  async confirmAction() {
    if (!this.pendingAction || this.busy) return;
    this.busy = true;
    try { await this.pendingAction.run(); this.pendingAction = null; }
    catch (err) { this.showError(err); }
    finally { this.busy = false; }
  }
  async importCsv(preview = false) {
    if (!this.csvFile || this.busy) return;
    if (!preview && (!this.importResult?.preview || this.importResult.failed)) { this.notify('Preview the file and resolve failed rows before importing.'); return; }
    this.busy = true; this.importProgress = 'Uploading and validating rows…'; this.importResult = null;
    const body = new FormData(); body.append('file', this.csvFile); body.append('preview', String(preview));
    try {
      this.importResult = await firstValueFrom(this.service.http.post(`${this.service.url}/import/products/`, body));
      this.notify(preview ? 'Preview only. No products or stock were changed.' : 'Import finished. Review the results below.');
      if (!preview) { await this.load(); await this.lookups(); }
    } catch (err) { this.showError(err); }
    finally { this.busy = false; this.importProgress = ''; }
  }
  async sampleCsv() {
    try {
      const blob = await firstValueFrom(this.service.http.get(`${this.service.url}/import/sample.csv`, {responseType: 'blob'}));
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cheradip-products-sample.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { this.showError(err); }
  }
  private notify(message: string) { this.snack.open(message, 'Close', {duration: 6500, panelClass: ['package-center-snackbar']}); }
  private showError(err: any) {
    const flatten = (value: any): string => typeof value === 'string' ? value : Array.isArray(value)
      ? value.map(flatten).join(' ') : value && typeof value === 'object'
        ? Object.entries(value).map(([key, val]) => `${key}: ${flatten(val)}`).join(' ') : '';
    this.error = err?.status === 403 ? 'Your account does not have permission for this action. Ask the administrator to review your staff permissions.'
      : err?.status === 401 ? 'Your session has expired. Please sign in again.'
        : flatten(err?.error) || 'Could not complete this request. Please try again.';
  }
}
