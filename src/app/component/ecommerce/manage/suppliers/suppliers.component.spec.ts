import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CommerceManagementService } from '../../../../service/commerce-management.service';
import { SuppliersComponent } from './suppliers.component';

describe('private supplier workspace', () => {
  let service: any;
  beforeEach(async () => {
    localStorage.removeItem('cheradip:supplier-research-size');
    service = {url: '/api/ecommerce/admin', http: {
      get: jasmine.createSpy('get').and.callFake((url: string) => of(url.endsWith('/supplier-workspace/')
        ? {permissions: {collect_supplier: true, research_supplier: true}, auto_place_orders: false, evidence_days: 14}
        : {results: [], count: 0})),
      post: jasmine.createSpy('post').and.returnValue(of({})), patch: jasmine.createSpy('patch').and.returnValue(of({})),
    }};
    await TestBed.configureTestingModule({imports: [SuppliersComponent], providers: [{provide: CommerceManagementService, useValue: service}]}).compileComponents();
  });
  afterEach(() => localStorage.removeItem('cheradip:supplier-research-size'));
  it('renders honest connection state without claiming live sourcing or automatic orders', async () => {
    const fixture = TestBed.createComponent(SuppliersComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Automatic purchasing is OFF');
    expect(fixture.nativeElement.textContent).toContain('No suppliers configured');
    fixture.componentInstance.busy = true; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading suppliers and collected counts');
    expect(fixture.nativeElement.textContent).not.toContain('No suppliers configured');
    fixture.componentInstance.busy = false;
    fixture.componentInstance.tab = 'offers'; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No offers match');
    fixture.destroy();
  });
  it('never sends an unrestricted update to an undocumented website', () => {
    const c = new SuppliersComponent(service); c.liveUnavailable();
    expect(service.http.post).not.toHaveBeenCalled();
    expect(c.error).toContain('No cached timestamp has been changed');
  });
  it('previews global visibility before applying it without starting research or importing', async () => {
    const c = new SuppliersComponent(service); c.config = {permissions:{manage_supplier_catalogue:true}};
    service.http.post.and.returnValue(of({mode:'all',preview_token:'test-preview',unverified_hidden:2000,verified_products:0}));
    await c.previewCatalogueMode('all');
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/supplier-catalogue-mode/', {mode:'all',preview:true});
    expect(c.catalogueChange.unverified_hidden).toBe(2000);
    service.http.post.calls.reset(); service.http.post.and.returnValue(of({mode:'all',restored:0}));
    await c.confirmCatalogueMode();
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/supplier-catalogue-mode/', {mode:'all',preview:false,preview_token:'test-preview'});
    expect(c.config.catalogue_mode).toBe('all'); expect(c.catalogueChange).toBeNull();
    expect(c.message).toContain('resumable import jobs queued');
  });
  it('hides catalogue visibility actions without the specific permission', async () => {
    const c = new SuppliersComponent(service); c.config={permissions:{}};
    await c.previewCatalogueMode('all'); expect(service.http.post).not.toHaveBeenCalled();
  });
  it('clears stale import preview when product selection changes', () => {
    const c = new SuppliersComponent(service); c.preview = {results: [{id: 1}]};
    c.toggle(c.selected, 2); expect(c.preview).toBeNull(); expect(c.selected.has(2)).toBeTrue();
    c.toggle(c.selected, 2); expect(c.selected.size).toBe(0);
  });
  it('selects all matching offers across pages and preserves selection on navigation', async () => {
    const c = new SuppliersComponent(service); c.search = 'Exact'; c.sourceCategory = 'Shirts';
    const ids = Array.from({length: 1201}, (_, n) => n + 1);
    service.http.get.and.callFake((url: string) => of(url.includes('/selection/')
      ? {ids, count: ids.length, total: ids.length} : {results: [{id: 1}], count: 1201}));
    await c.selectOffers('all');
    expect(c.selected.size).toBe(1201); expect(c.selectionChoice).toBe('all');
    expect(service.http.get.calls.first().args[1].params).toEqual(jasmine.objectContaining({selection: 'all', search: 'Exact', category: 'Shirts'}));
    await c.next(1); expect(c.selected.size).toBe(1201);
    c.toggle(c.selected, 1); expect(c.selectionChoice).toBe('');
    c.clearOfferSelection(); expect(c.selected.size).toBe(0);
  });
  it('provides bounded range selection and clears it when filters are applied', async () => {
    const c = new SuppliersComponent(service);
    service.http.get.and.callFake((url: string) => of(url.includes('/selection/')
      ? {ids: [1,2], count: 2, total: 2} : {results: [], count: 2}));
    for (const size of ['100','500','1000']) {
      await c.selectOffers(size);
      expect(c.selectionChoice).toBe(size); expect(c.selected.size).toBe(2);
    }
    await c.searchOffers(); expect(c.selected.size).toBe(0);
  });
  it('queues all selected updates in one request and reports unconnected suppliers', async () => {
    const c = new SuppliersComponent(service); c.selected = new Set([1,2,3]);
    service.http.post.and.returnValue(of({queued: [{id: 'job', count: 1}], skipped: [{name: 'Browser source', count: 2, reason: 'No API connector'}]}));
    await c.processSelected('update');
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/supplier-jobs/selected/', {action: 'update', offer_ids: [1,2,3]});
    expect(c.message).toContain('1 selected products queued');
    expect(c.error).toContain('Browser source (2): No API connector');
  });
  it('renders all-product selection without allowing unbounded draft imports', async () => {
    const fixture = TestBed.createComponent(SuppliersComponent);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.tab = 'offers'; fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const label of ['Select all matching products','Select 1–100','Select 1–500','Select 1–1000','Update Selected','Screen Selected']) expect(text).toContain(label);
    fixture.componentInstance.selected = new Set(Array.from({length: 101}, (_, n) => n + 1));
    await fixture.componentInstance.importSelected();
    expect(service.http.post).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error).toContain('at most 100');
    fixture.destroy();
  });
  it('remembers the next batch size without storing credentials', () => {
    const c = new SuppliersComponent(service); c.setResearchSize(5);
    expect(new SuppliersComponent(service).researchSize).toBe(5);
    c.setResearchSize(1000); expect(c.researchSize).toBe(5);
  });
  it('keeps encrypted credentials on blank edits and merges only entered changes', async () => {
    const c = new SuppliersComponent(service); c.credentialEditor = {id: 1, credentials_set: true};
    await c.saveCredentials(); expect(service.http.post).not.toHaveBeenCalled();
    expect(c.message).toContain('kept');
    c.credentialValue = 'replacement-test-key'; await c.saveCredentials();
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/suppliers/1/credentials/', {credentials: {api_key: 'replacement-test-key'}, merge: true});
    expect(c.credentialValue).toBe('');
  });
  it('uses the encrypted account-password field only for the verified account connector', async () => {
    const c = new SuppliersComponent(service);
    c.credentialEditor = {id:3,connector:'uddoog',credentials_set:true};
    c.credentialUsername = 'synthetic-account'; c.credentialSecret = 'synthetic-password';
    await c.saveCredentials();
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/suppliers/3/credentials/',
      {credentials:{password:'synthetic-password',username:'synthetic-account'},merge:true});
    expect(c.credentialSecret).toBe('');
  });
  it('keeps Business Koro API keys separate from its full-catalogue account password', async () => {
    const c=new SuppliersComponent(service);c.credentialEditor={id:2,connector:'business_koro',credentials_set:true};
    c.credentialValue='synthetic-api';c.credentialSecret='synthetic-secret';c.credentialAccountPassword='synthetic-account-password';
    c.credentialUsername='synthetic-mobile';await c.saveCredentials();
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/suppliers/2/credentials/',
      {credentials:{api_key:'synthetic-api',api_secret:'synthetic-secret',username:'synthetic-mobile',password:'synthetic-account-password'},merge:true});
    expect(c.credentialAccountPassword).toBe('');
  });
  it('requires explicit supplier scope before queueing bulk work', async () => {
    const c = new SuppliersComponent(service); await c.jobsFor('filter');
    expect(service.http.post).not.toHaveBeenCalled(); expect(c.error).toContain('Select supplier rows');
  });
  it('starts a small scoped research batch without importing or publishing', async () => {
    const c=new SuppliersComponent(service);c.selectedSuppliers.add(2);c.researchSize=3;
    service.http.post.and.returnValue(of({batch:{id:'saved-batch',status:'active',items:[]}}));
    await c.startResearch();
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/supplier-research/',{action:'start',size:3,supplier_ids:[2]});
    expect(c.tab).toBe('research');expect(c.researchBatch.id).toBe('saved-batch');
  });
  it('loads the saved research state before allowing another start', async () => {
    const c = new SuppliersComponent(service);
    service.http.get.and.callFake((url: string) => of(url.endsWith('/supplier-workspace/')
      ? {permissions: {research_supplier: true}}
      : url.endsWith('/supplier-research/') ? {batch: {id: 'batch', status: 'active', items: []}}
      : {results: []}));
    await c.ngOnInit();
    expect(c.researchRunning).toBeTrue();
    expect(service.http.post).not.toHaveBeenCalled();
    c.ngOnDestroy();
  });
  it('does not restart active research or discard unsaved notes when returning to it', async () => {
    const c = new SuppliersComponent(service);
    const batch = {id: 'batch', status: 'active', items: [{note: 'Unsaved source check'}]};
    c.researchBatch = batch;
    await c.startResearch();
    c.tab = 'suppliers'; await c.switchTab('research');
    expect(c.tab).toBe('research'); expect(c.researchBatch).toBe(batch);
    expect(service.http.get).not.toHaveBeenCalled();
    expect(service.http.post).not.toHaveBeenCalled();
  });
  it('labels Research consistently and prevents duplicate starts without blocking return navigation', async () => {
    const fixture = TestBed.createComponent(SuppliersComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const c = fixture.componentInstance;
    c.researchBatch = {id: 'batch', status: 'active', done: 0, total: 3, supplier_ids: [2], items: []};
    fixture.detectChanges();
    const researchTab = () => [...fixture.nativeElement.querySelectorAll('.tabs button')]
      .find((b: any) => b.textContent.trim() === 'Research') as HTMLButtonElement;
    expect(researchTab().disabled).toBeFalse();
    const filter = [...fixture.nativeElement.querySelectorAll('button')]
      .find((b: any) => b.textContent.trim() === 'Filter Product') as HTMLButtonElement;
    expect(filter.disabled).toBeTrue();
    researchTab().click(); await fixture.whenStable(); fixture.detectChanges();
    expect(c.tab).toBe('research'); expect(researchTab().disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.tabs').textContent).not.toContain('Resume Research');
    expect(fixture.nativeElement.textContent).not.toContain('Continue saved batch');
    expect(fixture.nativeElement.textContent).not.toContain('Start next batch');
    expect(fixture.nativeElement.textContent).toContain('Save & Pause');
    c.researchBatch.status = 'paused'; fixture.detectChanges();
    expect(researchTab().disabled).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Resume');
    expect(fixture.nativeElement.textContent).not.toContain('Continue saved batch');
    c.busy = true; fixture.detectChanges(); expect(researchTab().disabled).toBeTrue();
    fixture.destroy();
  });
  it('uses the selected size automatically on the next new batch without resizing saved work', async () => {
    const fixture = TestBed.createComponent(SuppliersComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const c = fixture.componentInstance;
    c.tab = 'research';
    c.researchBatch = {id: 'old', status: 'active', done: 0, total: 3, supplier_ids: [2], items: []};
    fixture.detectChanges(); await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('[aria-label="Research batch size"]');
    select.selectedIndex = 2; select.dispatchEvent(new Event('change'));
    await fixture.whenStable(); fixture.detectChanges();
    expect(c.researchSize).toBe(5); expect(c.researchBatch.total).toBe(3);
    expect(service.http.post).not.toHaveBeenCalled();
    c.researchBatch.status = 'completed'; fixture.detectChanges();
    service.http.post.and.returnValue(of({batch: {id: 'next', status: 'active', done: 0, total: 5, supplier_ids: [2], items: []}}));
    const next = [...fixture.nativeElement.querySelectorAll('button')]
      .find((b: any) => b.textContent.trim() === 'Start next batch') as HTMLButtonElement;
    next.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/supplier-research/', {action: 'start', size: 5, supplier_ids: []});
    expect(c.researchBatch.total).toBe(5);
    expect(fixture.nativeElement.textContent).not.toContain('Start next batch');
    fixture.destroy();
  });
  it('saves unsaved notes atomically when pausing a research batch', async () => {
    const c=new SuppliersComponent(service);c.researchBatch={id:'batch',status:'active',items:[{id:1,status:'pending',note:'Unverified candidate link; continue later.'}]};
    service.http.post.and.returnValue(of({batch:{id:'batch',status:'paused',items:[]}}));
    await c.researchAction('pause');
    expect(service.http.post).toHaveBeenCalledOnceWith('/api/ecommerce/admin/supplier-research/',{action:'pause',batch_id:'batch',checkpoints:[{id:1,note:'Unverified candidate link; continue later.'}]});
    expect(c.researchBatch.status).toBe('paused');expect(c.message).toContain('next request');
  });
  it('makes collection visible and routes a selected browser supplier to its one-run sign-in', () => {
    const c = new SuppliersComponent(service);
    c.suppliers=[{id:1,enabled:true,capabilities:{browser_collection:true}}];
    c.collectSource(); expect(c.error).toContain('Select one enabled supplier');
    c.selectedSuppliers.add(1);c.collectSource();expect(c.browserEditor.id).toBe(1);
    expect(service.http.post).not.toHaveBeenCalled();
  });
  it('uses Business Koro browser collection rather than its limited API catalogue', () => {
    const c = new SuppliersComponent(service);
    c.collectSource({id:2, enabled:true, capabilities:{preferred_collection:'browser', live_api:true, browser_collection:true}});
    expect(c.browserEditor.id).toBe(2);
    expect(service.http.post).not.toHaveBeenCalled();
  });
  it('queues only selected suppliers, not every supplier', async () => {
    const c = new SuppliersComponent(service); c.suppliers = [{id: 1, name: 'One'}, {id: 2, name: 'Two'}];
    c.selectedSuppliers.add(2); await c.jobsFor('filter');
    expect(service.http.post).toHaveBeenCalledTimes(1);
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/supplier-jobs/', {supplier: 2, action: 'filter'});
  });
  it('does not import immediately when previewing selected products', async () => {
    const c = new SuppliersComponent(service); c.selected.add(3); c.category = '1';
    service.http.post.and.returnValue(of({preview: true, results: [{id: 3}]}));
    await c.importSelected();
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/supplier-import/', {ids: [3], category: '1', preview: true});
    expect(c.preview.preview).toBeTrue(); expect(c.selected.has(3)).toBeTrue();
  });
  it('clears the entered credential after successful write-only replacement', async () => {
    const c = new SuppliersComponent(service); c.credentialEditor = {id: 1}; c.credentialValue = 'private-test';
    await c.saveCredentials(); expect(c.credentialValue).toBe(''); expect(c.credentialEditor).toBeNull();
    expect(c.message).toContain('does not verify');
  });
  it('stores the complete issued credential set and clears every field', async () => {
    const c = new SuppliersComponent(service); c.credentialEditor = {id: 2};
    c.credentialValue = 'test-key'; c.credentialSecret = 'test-secret'; c.credentialUsername = 'test-user'; c.credentialDomain = 'shop.example';
    await c.saveCredentials();
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/suppliers/2/credentials/', {
      credentials: {api_key: 'test-key', api_secret: 'test-secret', username: 'test-user', domain: 'shop.example'}});
    expect([c.credentialValue,c.credentialSecret,c.credentialUsername,c.credentialDomain]).toEqual(['','','','']);
  });
  it('clears credential editor values on destruction', () => {
    const c = new SuppliersComponent(service);
    c.credentialValue = c.credentialSecret = c.credentialUsername = c.credentialDomain = 'test-only'; c.ngOnDestroy();
    expect([c.credentialValue,c.credentialSecret,c.credentialUsername,c.credentialDomain]).toEqual(['','','','']);
  });
  it('queues documented live collection without a snapshot or import', async () => {
    const c = new SuppliersComponent(service);
    await c.jobsFor('collect', {id: 2, capabilities: {live_api: true}});
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/supplier-jobs/', {supplier: 2, action: 'collect'});
    expect(c.snapshot).toBeNull(); expect(c.preview).toBeNull();
  });
  it('updates only selected enabled documented sources with tracked identities', async () => {
    const c = new SuppliersComponent(service);
    c.suppliers = [
      {id: 1, enabled: true, capabilities: {live_api: false}, counts: {total: 10}},
      {id: 2, enabled: true, capabilities: {live_api: true}, counts: {total: 10}},
      {id: 3, enabled: true, capabilities: {live_api: true}, counts: {total: 0}},
      {id: 4, enabled: false, capabilities: {live_api: true}, counts: {total: 10}},
      {id: 5, enabled: true, capabilities: {live_api: true}, counts: {total: 10}}];
    c.selectedSuppliers.add(2); await c.updateAll();
    expect(service.http.post).toHaveBeenCalledTimes(1);
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/supplier-jobs/', {supplier: 2, action: 'update'});
  });
  it('marks the view for change detection after async actions finish', async () => {
    const detector = {markForCheck: jasmine.createSpy('markForCheck')};
    const c = new SuppliersComponent(service, undefined, detector as any);
    await c.run(async () => { c.message = 'Finished'; });
    expect(c.busy).toBeFalse(); expect(detector.markForCheck).toHaveBeenCalled();
  });
  it('shows operation errors without inventing completed jobs', async () => {
    const c = new SuppliersComponent(service); c.snapshot = {id: 1}; c.snapshotRows = [{external_id: 'A'}];
    service.http.post.and.returnValue(throwError(() => ({error: {detail: 'Terms not confirmed'}})));
    await c.submitSnapshot(); expect(c.error).toBe('Terms not confirmed'); expect(c.snapshot.id).toBe(1); expect(c.jobs).toEqual([]);
  });
  it('does not confirm an import without the signed preview', async () => {
    const c = new SuppliersComponent(service); c.selected.add(3); c.category = '1';
    await c.importSelected(false);
    expect(service.http.post).not.toHaveBeenCalled(); expect(c.error).toContain('Preview');
  });
  it('submits the exact preview token when confirming imports', async () => {
    const c = new SuppliersComponent(service); c.selected.add(3); c.category = '1'; c.preview = {preview_token: 'signed-preview'};
    await c.importSelected(false);
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/supplier-import/', {ids: [3], category: '1', preview: false, preview_token: 'signed-preview'});
  });
  it('prevents an unsaved edited review from approving older costs', async () => {
    const c = new SuppliersComponent(service);
    await c.openReview({id: 1, identity: {brand: 'Brand'}, costs: {}, match_confirmed: true, excluded_reason: '', state: 'ready'});
    expect(c.reviewDirty).toBeFalse(); c.costText = '{"ads_cost":"99"}';
    expect(c.reviewDirty).toBeTrue(); await c.approveOffer();
    expect(service.http.post).not.toHaveBeenCalled(); expect(c.error).toContain('re-screen');
  });
  it('requires configuration permission before opening supplier editors', () => {
    const c = new SuppliersComponent(service); c.edit(); expect(c.editor).toBeNull();
    c.config = {permissions: {add_supplier: true}}; c.edit(); expect(c.editor).not.toBeNull();
  });
  it('preserves a numeric zero source-price filter', async () => {
    const c = new SuppliersComponent(service); c.maxPrice = 0 as any;
    await c.loadOffers();
    expect(service.http.get.calls.mostRecent().args[1].params.max_price).toBe(0);
  });
  it('validates pasted browser identities without creating inventory', () => {
    const c = new SuppliersComponent(service); c.snapshotText='[{"external_id":"A"}]'; c.validateSnapshotText();
    expect(c.snapshotRows.length).toBe(1); expect(service.http.post).not.toHaveBeenCalled();
    c.snapshotText='not JSON'; c.validateSnapshotText(); expect(c.snapshotRows).toEqual([]);
  });
  it('clears browser passwords after failed one-run launches', async () => {
    const c = new SuppliersComponent(service); c.browserEditor={id:7}; c.browserUsername='test-user'; c.browserPassword='synthetic';
    service.http.post.and.returnValue(throwError(()=>({error:{detail:'Collector busy'}})));
    await c.startBrowser(); expect(c.browserPassword).toBe(''); expect(c.error).toBe('Collector busy');
  });
  it('never stores a browser login as permanent supplier credentials', async () => {
    const c = new SuppliersComponent(service); c.browserEditor={id:7}; c.browserUsername='test-user'; c.browserPassword='synthetic';
    await c.startBrowser();
    expect(service.http.post).toHaveBeenCalledWith('/api/ecommerce/admin/suppliers/7/browser-collection/',{username:'test-user',password:'synthetic'});
    expect(c.browserPassword).toBe(''); expect(c.browserEditor).toBeNull(); expect(c.tab).toBe('jobs');
  });
});
