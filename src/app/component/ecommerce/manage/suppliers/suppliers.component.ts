import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, timeout } from 'rxjs';
import { CommerceManagementService } from '../../../../service/commerce-management.service';

@Component({selector: 'app-suppliers', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './suppliers.component.html', styleUrls: ['./suppliers.component.css']})
export class SuppliersComponent implements OnInit, OnDestroy {
  config: any = {permissions: {}};
  suppliers: any[] = [];
  offers: any[] = [];
  jobs: any[] = [];
  categories: any[] = [];
  tab = 'suppliers';
  researchBatch: any = null;
  researchSize = this.savedResearchSize();
  supplierFilter = '';
  state = '';
  search = '';
  vendor = '';
  availability = '';
  minPrice = '';
  maxPrice = '';
  sourceCategory = '';
  ordering = 'id';
  offset = 0;
  count = 0;
  selected = new Set<number>();
  selectionChoice = '';
  selectedSuppliers = new Set<number>();
  busy = false;
  error = '';
  message = '';
  editor: any = null;
  credentialEditor: any = null;
  credentialValue = '';
  credentialSecret = '';
  credentialAccountPassword = '';
  credentialUsername = '';
  credentialDomain = '';
  browserEditor: any = null;
  browserUsername = '';
  browserPassword = '';
  review: any = null;
  identityText = '';
  costText = '';
  evidenceRows: any[] = [];
  evidence: any = {};
  approvalNote = '';
  private originalReview = '';
  category = '';
  preview: any = null;
  catalogueChange: any = null;
  snapshot: any = null;
  snapshotAction = 'collect';
  snapshotRows: any[] = [];
  snapshotText = '';
  readonly states = ['collected', 'needs_data', 'needs_review', 'ready', 'reduced_margin', 'blacklist', 'zero_margin', 'excluded', 'unique'];
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private polling = false;
  private loadVersion = 0;
  private lastSupplierPoll = 0;
  constructor(public service: CommerceManagementService, private zone?: NgZone, private changeDetector?: ChangeDetectorRef) {}
  can(action: string) { return !!this.config.permissions[action]; }
  async previewCatalogueMode(mode: 'all' | 'filtered') {
    if (!this.can('manage_supplier_catalogue')) return;
    await this.run(async () => {
      this.catalogueChange = await this.post('supplier-catalogue-mode', {mode, preview: true});
    });
  }
  async confirmCatalogueMode() {
    if (!this.catalogueChange || !this.can('manage_supplier_catalogue')) return;
    const change = this.catalogueChange;
    await this.run(async () => {
      const result = await this.post('supplier-catalogue-mode', {mode: change.mode, preview: false, preview_token: change.preview_token});
      this.config.catalogue_mode = result.mode;
      this.catalogueChange = null;
      this.message = result.mode === 'all'
        ? `Keep All applied: ${result.restored} listings restored; ${result.jobs?.length || 0} resumable import jobs queued. Manual supplier fulfilment; research continues separately.`
        : 'Keep Filtered applied: research-approved listings remain visible and the rest are archived. Research and orders are unchanged.';
    });
  }
  label(value: string) { return value.replace(/_/g, ' '); }
  get researchRunning() { return this.researchBatch?.status === 'active'; }
  private savedResearchSize() {
    try { const size = Number(localStorage.getItem('cheradip:supplier-research-size')); return [1,3,5,10].includes(size) ? size : 3; }
    catch { return 3; }
  }
  setResearchSize(value: number) {
    if (![1,3,5,10].includes(value)) return;
    this.researchSize = value;
    try { localStorage.setItem('cheradip:supplier-research-size', String(value)); } catch { /* Session preference still works without storage. */ }
  }
  private async get(path: string, params: any = {}) {
    return firstValueFrom(this.service.http.get<any>(`${this.service.url}/${path}/`, {params}).pipe(timeout(20000)));
  }
  private async post(path: string, body: any) {
    return firstValueFrom(this.service.http.post<any>(`${this.service.url}/${path}/`, body).pipe(timeout(30000)));
  }
  async ngOnInit() {
    await this.run(async () => {
      this.config = await this.get('supplier-workspace');
      await this.loadSuppliers();
      this.jobs = (await this.get('supplier-jobs', {limit: 25})).results || [];
      // Categories are public shop data; supplier researchers need not have category-edit access.
      const result = await firstValueFrom(this.service.http.get<any>(`${this.service.url.replace(/\/admin$/, '')}/categories/`).pipe(timeout(20000)));
      this.categories = result.results || result;
      this.category = this.categories[0]?.id || '';
      if (this.can('research_supplier')) this.researchBatch = (await this.get('supplier-research')).batch || null;
    });
    if (this.disposed) return;
    const schedule = () => setInterval(() => {
      if (this.zone) this.zone.run(() => void this.poll()); else void this.poll();
    }, 5000);
    // An idle polling interval must not keep Angular's stability/initial rendering pending.
    this.timer = this.zone ? this.zone.runOutsideAngular(schedule) : schedule();
  }
  ngOnDestroy() { this.disposed = true; this.credentialAccountPassword = this.credentialValue = this.credentialSecret = this.credentialUsername = this.credentialDomain = this.browserPassword = this.browserUsername = ''; ++this.loadVersion; if (this.timer) clearInterval(this.timer); }
  async run(work: () => Promise<void>) {
    if (this.busy || this.disposed) return;
    this.busy = true; this.error = ''; this.message = '';
    try { await work(); }
    catch (e: any) {
      // Never echo a credentials request/response into the page.
      this.error = e?.error?.detail || (e?.error && typeof e.error === 'object' ? JSON.stringify(e.error) :
        e instanceof SyntaxError ? 'Invalid JSON. Check the structured identity and costs before saving.' : 'Operation failed. Check permissions and try again.');
    } finally { this.busy = false; if (!this.disposed) this.changeDetector?.markForCheck(); }
  }
  async loadSuppliers() {
    const result = await this.get('suppliers', {limit: 100});
    if (!this.disposed) this.suppliers = (result.results || result).sort((a: any,b: any) => Number(b.enabled)-Number(a.enabled) || String(a.name || '').localeCompare(String(b.name || '')));
    if (this.config.catalog_sync !== undefined) {
      try {
        const status = await this.get('supplier-workspace');
        if (!this.disposed) this.config.catalog_sync = status.catalog_sync;
      } catch { /* Retain the last visible sync status while a check is interrupted. */ }
    }
    this.lastSupplierPoll = Date.now();
  }
  async poll() {
    if (this.polling || this.disposed || this.busy) return;
    this.polling = true;
    try {
      const data = await this.get('supplier-jobs', {limit: 25});
      if (this.disposed) return;
      const changed = JSON.stringify(this.jobs) !== JSON.stringify(data.results);
      this.jobs = data.results || [];
      if (changed || (this.tab === 'suppliers' && Date.now()-this.lastSupplierPoll >= 15000)) await this.loadSuppliers();
      if (changed && this.tab === 'offers' && !this.review) await this.loadOffers(false);
    } catch { /* Explicit actions show errors; polling never destroys an open editor. */ }
    finally { this.polling = false; if (!this.disposed) this.changeDetector?.markForCheck(); }
  }
  async loadOffers(reset = true) {
    if (reset) { this.offset = 0; this.clearOfferSelection(); }
    const version = ++this.loadVersion;
    const result = await this.get('supplier-offers', {limit: 25, offset: this.offset, ...this.offerFilters()});
    if (!this.disposed && version === this.loadVersion) { this.offers = result.results || []; this.count = result.count || 0; }
  }
  private offerFilters() {
    return {
      ...(this.supplierFilter ? {supplier_id: this.supplierFilter} : {}),
      ...(this.state ? {state: this.state} : {}), ...(this.vendor ? {vendor_id: this.vendor} : {}),
      ...(this.availability ? {availability: this.availability} : {}), ...(this.minPrice !== '' && this.minPrice != null ? {min_price: this.minPrice} : {}),
      ...(this.maxPrice !== '' && this.maxPrice != null ? {max_price: this.maxPrice} : {}), ...(this.sourceCategory ? {category: this.sourceCategory} : {}),
      ordering: this.ordering, search: this.search};
  }
  clearOfferSelection() { this.selected.clear(); this.selectionChoice = ''; this.preview = null; }
  async selectOffers(choice: string) {
    if (!choice) { this.clearOfferSelection(); return; }
    await this.run(async () => {
      const result = await this.get('supplier-offers/selection', {...this.offerFilters(), selection: choice});
      this.selected = new Set<number>(result.ids);
      this.selectionChoice = choice; this.count = result.total; this.preview = null;
      this.offset = 0; await this.loadOffers(false);
      this.message = `Selected ${result.count} of ${result.total} matching products across all pages.`;
    });
  }
  async processSelected(action: 'update' | 'filter') {
    if (!this.selected.size) return;
    await this.run(async () => {
      const result = await this.post('supplier-jobs/selected', {action, offer_ids: [...this.selected]});
      const count = (result.queued || []).reduce((total: number, job: any) => total + job.count, 0);
      this.message = `${count} selected products queued for ${action === 'update' ? 'source price / stock update' : 'algorithmic screening'}. No automatic publication or supplier purchase.`;
      this.error = (result.skipped || []).map((s: any) => `${s.name} (${s.count}): ${s.reason}`).join(' ');
      this.jobs = (await this.get('supplier-jobs', {limit: 25})).results || [];
    });
  }
  async searchOffers() { await this.run(() => this.loadOffers()); }
  async switchTab(tab: string) {
    this.tab = tab;
    if (tab === 'offers') await this.run(() => this.loadOffers());
    // Returning to an active batch must not discard unsaved checkpoint notes.
    if (tab === 'research' && !this.researchRunning) await this.run(async () => { this.researchBatch = (await this.get('supplier-research')).batch; });
  }
  async startResearch(supplier?: any) {
    if (this.researchRunning) { this.tab = 'research'; return; }
    await this.run(async () => {
      this.researchBatch = (await this.post('supplier-research',{action:'start',size:this.researchSize,
        supplier_ids: supplier ? [supplier.id] : [...this.selectedSuppliers]})).batch;
      this.tab='research';
      this.message='Saved research batch opened. Research and evidence need a staff member or assistant; this does not start an unattended AI service.';
    });
  }
  async researchAction(action: string, item?: any) {
    await this.run(async () => {
      this.researchBatch=(await this.post('supplier-research',{action,batch_id:this.researchBatch.id,
        ...(action === 'pause' ? {checkpoints:this.researchBatch.items.filter((i: any)=>['pending','researching'].includes(i.status)).map((i: any)=>({id:i.id,note:i.note || ''}))} : {}),
        ...(item ? {item_id:item.id,note:item.note || ''} : {})})).batch;
      this.message=action==='pause' ? 'Paused. Saved work will be available on your next request.' : 'Research checkpoint saved.';
    });
  }
  async reviewResearch(item: any) {
    try { const offer=await this.get(`supplier-offers/${item.offer_id}`); await this.openReview(offer); }
    catch { this.error='Could not open the saved source identity. Try again without changing its checkpoint.'; }
  }
  researchSearch(title: string, site: string) { return 'https://www.google.com/search?q='+encodeURIComponent(title+' '+site+' Bangladesh'); }
  toggle(set: Set<number>, id: number) { if (set.has(id)) set.delete(id); else set.add(id); this.preview = null; if (set === this.selected) this.selectionChoice = ''; }
  edit(row?: any) {
    if (!this.can(row ? 'change_supplier' : 'add_supplier')) { this.error = 'Supplier configuration permission is required.'; return; }
    this.editor = row ? {...row} : {name: '', website: '', enabled: false, terms_confirmed: false, terms_note: ''};
  }
  async saveSupplier() {
    await this.run(async () => {
      const e = this.editor;
      const data = {name: e.name, website: e.website, connector: e.connector || 'snapshot', enabled: e.enabled, terms_confirmed: e.terms_confirmed, terms_note: e.terms_note,
        credential_expires_at: e.credential_expires_at || null};
      if (e.id) await firstValueFrom(this.service.http.patch(`${this.service.url}/suppliers/${e.id}/`, data));
      else await this.post('suppliers', data);
      this.editor = null; await this.loadSuppliers();
    });
  }
  async saveCredentials() {
    await this.run(async () => {
      const value = {
        ...(this.credentialValue.trim() ? {api_key: this.credentialValue.trim()} : {}),
        ...(this.credentialSecret.trim() ? (this.accountCredentialEditor
          ? {password: this.credentialSecret} : {api_secret: this.credentialSecret.trim()}) : {}),
        ...(this.credentialUsername.trim() ? {username: this.credentialUsername.trim()} : {}),
        ...(this.credentialDomain.trim() ? {domain: this.credentialDomain.trim()} : {})};
      if ((this.credentialEditor.connector === 'business_koro' || this.credentialEditor.id === 4) && this.credentialAccountPassword) {
        (value as any).password=this.credentialAccountPassword;
      }
      if (!Object.keys(value).length) { this.message = 'No new credentials entered. Existing encrypted credentials were kept.'; return; }
      await this.post(`suppliers/${this.credentialEditor.id}/credentials`, {credentials: value, ...(this.credentialEditor.credentials_set ? {merge: true} : {})});
      this.credentialAccountPassword = this.credentialValue = this.credentialSecret = this.credentialUsername = this.credentialDomain = ''; this.credentialEditor = null;
      this.message = 'Credentials replaced securely. This does not verify a live API connection.';
      await this.loadSuppliers();
    });
  }
  openCredentials(row: any) {
    this.credentialEditor = row;
    this.credentialAccountPassword = this.credentialValue = this.credentialSecret = this.credentialUsername = this.credentialDomain = '';
  }
  get accountCredentialEditor(): boolean {
    return ['uddoog', 'resellkori', 'dropshipping_bd', 'labelled_stock'].includes(this.credentialEditor?.connector);
  }
  collection(row: any, action: string) {
    if (row.capabilities?.live_api) void this.jobsFor(action, row);
    else this.snapshotOpen(row, action);
  }
  openBrowser(row: any) { this.browserEditor = row; this.browserUsername = this.browserPassword = ''; }
  cancelFullCollection(row: any) {
    void this.run(async () => {
      await this.post(`suppliers/${row.id}/cancel-full-collection`, {});
      this.message = 'Cancellation requested; saved product details are retained.';
      await this.loadSuppliers();
    });
  }
  collectSource(row?: any) {
    if (!row) {
      const selected = this.suppliers.filter(s => s.enabled && this.selectedSuppliers.has(s.id));
      if (selected.length !== 1) { this.error = 'Select one enabled supplier to collect its products. Other actions may use multiple selected suppliers.'; return; }
      row = selected[0];
    }
    if (row.capabilities?.full_collection) {
      void this.run(async () => {
        await this.post(`suppliers/${row.id}/full-collection`, {});
        this.message = 'Full product details collection started. Saved checkpoints will resume automatically.';
        await this.loadSuppliers();
      });
    }
    else if (row.capabilities?.preferred_collection === 'browser' && row.capabilities?.browser_collection) this.openBrowser(row);
    else if (row.capabilities?.live_api) this.collection(row, 'collect');
    else if (row.capabilities?.browser_collection) this.openBrowser(row);
    else this.collection(row, 'collect');
  }
  async startBrowser() {
    await this.run(async () => {
      try {
        const result = await this.post(`suppliers/${this.browserEditor.id}/browser-collection`, {
          username: this.browserUsername, password: this.browserPassword});
        this.message = result.detail; this.browserEditor = null; this.tab = 'jobs';
        this.jobs = (await this.get('supplier-jobs', {limit: 25})).results || [];
      } finally { this.browserPassword = ''; }
    });
  }
  async updateAll() {
    const rows = this.suppliers.filter(s => s.enabled && s.capabilities?.live_api && s.counts?.total > 0 &&
      (!this.selectedSuppliers.size || this.selectedSuppliers.has(s.id)));
    if (!rows.length) { this.liveUnavailable(); return; }
    await this.run(async () => {
      for (const s of rows) await this.post('supplier-jobs', {supplier: s.id, action: 'update'});
      this.tab = 'jobs'; this.message = `Queued read-only updates for ${rows.length} suppliers; tracked identities only.`;
      this.jobs = (await this.get('supplier-jobs', {limit: 25})).results || [];
    });
  }
  snapshotOpen(row: any, action: string) { this.snapshot = row; this.snapshotAction = action; this.snapshotRows = []; this.snapshotText = ''; }
  validateSnapshotText() {
    this.snapshotRows = [];
    if (new Blob([this.snapshotText]).size > 2 * 1024 * 1024) { this.error = 'Use a collection batch up to 2 MB.'; return; }
    try {
      const rows = JSON.parse(this.snapshotText);
      if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error();
      this.snapshotRows = rows; this.error = '';
    } catch { this.error = 'Use a JSON array of 1–1000 collected identities. No executable scripts or credentials.'; }
  }
  async readSnapshot(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.snapshotRows = [];
    if (file.size > 2 * 1024 * 1024) { this.error = 'Choose a JSON snapshot up to 2 MB.'; return; }
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error();
      this.snapshotRows = rows;
    } catch { this.error = 'Use a JSON array containing 1–1000 authorised source identities. Download the format below.'; }
  }
  sample() {
    const rows = [{external_id: 'REPLACE-WITH-SOURCE-ID', variant_id: 'source-variant', vendor_id: 'source-vendor', warehouse_id: 'source-warehouse',
      title: 'Replace with exact product title', url: 'https://supplier.example/product',
      identity: {brand: 'Brand', model: 'Exact model', variant: 'Exact capacity / size / colour', pack_count: 1, condition: 'new',
        warranty: 'Exact warranty', accessories: 'Exact included accessories', authenticity: 'unverified', tax_basis: 'unconfirmed'},
      source_price: '100.00', currency: 'BDT', availability: 'unconfirmed', quantity: null, weight_grams: null,
      single_unit: false, observed_at: new Date().toISOString()}];
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'supplier-snapshot-format.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async submitSnapshot() {
    await this.run(async () => {
      await this.post('supplier-jobs', {supplier: this.snapshot.id, action: this.snapshotAction, rows: this.snapshotRows});
      this.snapshot = null; this.snapshotRows = []; this.snapshotText = ''; this.tab = 'jobs';
      this.message = 'Batch queued. Run the supplier worker to process it; real progress appears below.';
      this.jobs = (await this.get('supplier-jobs', {limit: 25})).results;
    });
  }
  async jobsFor(action: string, supplier?: any) {
    await this.run(async () => {
      const suppliers = supplier ? [supplier] : this.suppliers.filter(s => this.selectedSuppliers.has(s.id));
      if (!suppliers.length) { this.error = 'Select supplier rows first. Scope: selected suppliers only.'; return; }
      const failures: string[] = [];
      for (const s of suppliers) {
        try { await this.post('supplier-jobs', {supplier: s.id, action}); }
        catch (e: any) { failures.push(`${s.name}: ${e?.error?.detail || 'Cannot queue. Check active jobs and terms.'}`); }
      }
      this.error = failures.join(' '); this.tab = 'jobs';
      this.jobs = (await this.get('supplier-jobs', {limit: 25})).results;
    });
  }
  async cancel(job: any) {
    await this.run(async () => { await this.post(`supplier-jobs/${job.id}/cancel`, {}); this.message = 'Cancel requested. Completed work is retained.'; });
  }
  async cancelAll() {
    await this.run(async () => {
      for (const job of this.jobs.filter(j => ['queued', 'running'].includes(j.status))) await this.post(`supplier-jobs/${job.id}/cancel`, {});
      this.message = 'Cancellation requested for active jobs shown in this list.';
    });
  }
  async openReview(offer: any) {
    this.review = {...offer}; this.costText = JSON.stringify(offer.costs, null, 2);
    this.identityText = JSON.stringify(offer.identity, null, 2); this.approvalNote = '';
    this.originalReview = this.reviewFingerprint();
    this.evidence = {seller: '', marketplace: '', url: '', price: '', delivery: null, match_confidence: null, observed_at: new Date().toISOString(), exact_match: false, available: true, note: ''};
    await this.run(async () => { this.evidenceRows = await this.get(`supplier-offers/${offer.id}/evidence`); });
  }
  async saveReview() {
    await this.run(async () => {
      await this.post(`supplier-offers/${this.review.id}/review`, {costs: JSON.parse(this.costText), identity: JSON.parse(this.identityText), url: this.review.url,
        match_confirmed: this.review.match_confirmed, ...(this.can('approve_supplier') ? {excluded_reason: this.review.excluded_reason || ''} : {})});
      this.message = 'Review saved. Previous approval is invalidated; run Filter Product again.';
      this.review = null; await this.loadOffers(false);
    });
  }
  async addEvidence() {
    await this.run(async () => {
      await this.post(`supplier-offers/${this.review.id}/evidence`, {...this.evidence, expected_match_key: this.review.match_key});
      this.evidenceRows = await this.get(`supplier-offers/${this.review.id}/evidence`);
      this.message = 'Observation recorded. Re-screen before approval.';
    });
  }
  async screenOffer(offer: any) {
    await this.run(async () => {
      await this.post('supplier-jobs', {supplier: offer.supplier, action: 'filter', offer_ids: [offer.id]});
      this.message = 'Screening queued. Review the Jobs tab for progress.';
    });
  }
  async approveOffer() {
    if (this.reviewDirty) { this.error = 'Save changed identity/costs and re-screen before approval.'; return; }
    await this.run(async () => {
      await this.post(`supplier-offers/${this.review.id}/approval`, {note: this.approvalNote});
      this.message = 'Approved for draft import only.'; this.review = null; await this.loadOffers(false);
    });
  }
  async importSelected(preview = true) {
    if (this.selected.size > 100) { this.error = 'Bulk updates support all selected products. Draft imports require smaller reviewed selections of at most 100 per preview.'; return; }
    if (!preview && !this.preview?.preview_token) { this.error = 'Preview the selected draft imports before confirming.'; return; }
    await this.run(async () => {
      const result = await this.post('supplier-import', {ids: [...this.selected], category: this.category, preview,
        ...(!preview ? {preview_token: this.preview?.preview_token || ''} : {})});
      this.preview = preview ? result : null;
      if (!preview) { this.selected.clear(); this.message = 'Selected offers imported as drafts. No publication, stock reservation or supplier order was performed.'; await this.loadOffers(false); }
    });
  }
  async next(delta: number) { this.offset = Math.max(0, this.offset + delta * 25); this.preview = null; await this.run(() => this.loadOffers(false)); }
  async connection(supplier: any) {
    await this.run(async () => { const result = await this.post(`suppliers/${supplier.id}/connection`, {}); this.message = result.detail; });
  }
  liveUnavailable() { this.error = 'No enabled documented API with tracked identities matches this scope. Select a configured source after Product Collection; other suppliers require an authorised snapshot. No cached timestamp has been changed.'; }
  private reviewFingerprint() { return JSON.stringify([this.identityText, this.costText, this.review?.url, this.review?.match_confirmed, this.review?.excluded_reason || '']); }
  get reviewDirty() { return !!this.review && this.reviewFingerprint() !== this.originalReview; }
}
