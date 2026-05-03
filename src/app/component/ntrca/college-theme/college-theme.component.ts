import { ChangeDetectorRef, Component, Inject, OnInit, OnDestroy, AfterViewInit, Renderer2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { map, catchError, filter } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { LastInstitutesService } from 'src/app/service/last-institutes.service';
import { LoadingService } from 'src/app/service/loading.service';
import { TrxUnlockService } from 'src/app/service/trx-unlock.service';
import { slugForUrlDisplay } from 'src/app/url-serializer';

const STORAGE_UNLOCKED_EIINS = 'unlockedEIINs';

@Component({
  selector: 'app-college-theme',
  templateUrl: './college-theme.component.html',
  styleUrls: ['./college-theme.component.css']
})
export class CollegeThemeComponent implements OnInit, OnDestroy, AfterViewInit {
  private banbeisUrl = `${environment.apiUrl}/banbeis/`;
  private institutesUrl = `${environment.apiUrl}/institutes/`;
  /** Direct fetch by EIIN (no search). Used when opening from sitemap / eiin or eiin-name URL. */
  private instituteByEiinUrl = `${environment.apiUrl}/institute/`;
  slug: string = '';
  eiin: string = '';
  loading = true;
  error: string | null = null;
  data: any = null;

  /** Token box: TrxID (8–10 digits) input and apply. */
  newToken: string = '';
  trxRemaining = 0;
  unlockedEIINs: Set<string> = new Set();
  /** Token input horizontal offset when logged in (matches header token box). */
  tokenInputLoggedIn = false;
  private tokenPollId?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DOCUMENT) private doc: Document,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private http: HttpClient,
    private lastInstitutes: LastInstitutesService,
    private loadingService: LoadingService,
    private trxUnlock: TrxUnlockService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.trxRemaining = this.trxUnlock.getCachedRemaining();
    this.newToken = this.trxUnlock.readPendingTrxidForInput(this.newToken);
    this.trxUnlock.fetchCoinBalance().subscribe((n) => (this.trxRemaining = n));
    const stored = localStorage.getItem(STORAGE_UNLOCKED_EIINS);
    if (stored) this.unlockedEIINs = new Set(JSON.parse(stored));

    this.route.paramMap.subscribe(() => {
      this.slug = this.getSlugFromUrl();
      this.eiin = this.extractEiin(this.slug);
      this.loadData();
      this.scheduleUrlNormalize();
    });
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => {
      this.scheduleUrlNormalize();
      this.syncTokenInputLoggedIn();
    });
    this.syncTokenInputLoggedIn();
    this.tokenPollId = window.setInterval(() => this.syncTokenInputLoggedIn(), 400);
  }

  ngOnDestroy(): void {
    if (this.tokenPollId != null) {
      clearInterval(this.tokenPollId);
      this.tokenPollId = undefined;
    }
  }

  private syncTokenInputLoggedIn(): void {
    const next = localStorage.getItem('isLoggedIn') === 'true';
    if (next !== this.tokenInputLoggedIn) {
      this.tokenInputLoggedIn = next;
      this.cdr.markForCheck();
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  private normalizeScheduled = false;
  private scheduleUrlNormalize(): void {
    if (this.normalizeScheduled) return;
    this.normalizeScheduled = true;
    setTimeout(() => {
      this.normalizeUrlToDisplayForm();
      this.normalizeScheduled = false;
    }, 150);
  }

  /**
   * After opening from sitemap or an encoded link, rewrite the URL so the address bar
   * shows Bengali (and Unicode) instead of percent-encoded form (%E0%A6%...).
   */
  private normalizeUrlToDisplayForm(): void {
    const slug = this.getSlugFromUrl();
    if (!slug) return;
    const displayPath = `/institutes/${slugForUrlDisplay(slug)}`;
    const current = (this.location.path() || '').replace(/^\/?/, '/').split('?')[0].split('#')[0];
    const currentDecoded = this.decodePathForCompare(current);
    const displayDecoded = this.decodePathForCompare(displayPath);
    const hasEncodedUnicode = /%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/.test(current);
    if (currentDecoded !== displayDecoded || hasEncodedUnicode) {
      this.router.navigateByUrl(displayPath, { replaceUrl: true });
      // Force address bar to show Bengali; retry in case Router or browser overwrites
      [50, 200, 500].forEach((ms, i) => {
        setTimeout(() => {
          const now = (this.location.path() || '').replace(/^\/?/, '/').split('?')[0];
          if (/%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/.test(now)) {
            this.location.replaceState(displayPath);
          }
        }, ms);
      });
    }
  }

  private decodePathForCompare(path: string): string {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }

  /**
   * Read slug from URL path so parentheses ( ) [ ] and other special chars are preserved.
   * Router path params break on these chars; we always read from the actual path.
   */
  private getSlugFromUrl(): string {
    try {
      let path = (this.location.path() || '').replace(/^\/?/, '/');
      const prefix = '/institutes/';
      if (!path.startsWith(prefix)) {
        return this.route.snapshot.paramMap.get('slug') || '';
      }
      let raw = path.slice(prefix.length).replace(/\/+$/, '').split('?')[0].trim();
      if (!raw) return '';
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // keep raw
      }
      return raw.replace(/\/+$/, '');
    } catch {
      return this.route.snapshot.paramMap.get('slug') || '';
    }
  }

  /** True if slug contains Bengali script (so we keep/use Bengali URL for SEO). */
  private slugLooksBengali(slug: string): boolean {
    return /[\u0980-\u09FF]/.test(slug || '');
  }

  /** True if slug looks like an EIIN (only digits, or digits followed by hyphen). */
  private slugIsEiin(slug: string): boolean {
    if (!slug || !slug.trim()) return false;
    const s = slug.trim().replace(/\/+$/, '');
    const firstHyphen = s.indexOf('-');
    const beforeHyphen = firstHyphen >= 0 ? s.substring(0, firstHyphen).trim() : s;
    return /^\d+$/.test(beforeHyphen);
  }

  /**
   * Extract EIIN from slug for direct load (no search).
   * Sitemap/links use eiin or eiin-name; we take leading digits so we always load by EIIN when present.
   */
  private extractEiin(slug: string): string {
    if (!slug || !slug.trim()) return '';
    const s = slug.trim().replace(/\/+$/, '');
    const leadingDigits = s.match(/^\d+/);
    return leadingDigits ? leadingDigits[0] : '';
  }

  loadData(): void {
    this.loading = true;
    this.error = null;
    this.data = null;
    if (!this.slug) {
      this.error = 'Invalid institute link.';
      this.loading = false;
      return;
    }
    // Sitemap / direct links: slug is "903458" or "903458-ফ্রোবেল একাডেমি" – use EIIN and load from banbeis + institutes only (no search)
    const eiinFromSlug = this.extractEiin(this.slug);
    if (eiinFromSlug) {
      this.eiin = eiinFromSlug;
      this.loadDataByEiin(this.eiin);
      return;
    }
    // Slug is name-only: search institutes; if no match, use last shown (from storage) and replace URL with eiin-name
    this.http.get<any>(`${this.institutesUrl}?q=${encodeURIComponent(this.slug)}&page=1`).pipe(
      map(res => {
        const list = res?.results || [];
        return list.length ? list[0] : null;
      }),
      catchError(() => of(null))
    ).subscribe({
      next: (match) => {
        let foundEiin = match?.eiinNo != null ? String(match.eiinNo) : (match?.EIIN != null ? String(match.EIIN) : '');
        let foundInstitute = match;
        if (!foundEiin) {
          const best = this.lastInstitutes.getBestMatchForSlug(this.slug);
          if (best) {
            foundEiin = best.eiin;
            foundInstitute = best.institute;
          }
        }
        if (!foundEiin) {
          this.error = 'No matching institute found for this name.';
          this.loading = false;
          return;
        }
        this.eiin = foundEiin;
        this.loadDataByEiin(this.eiin);
        const name = (foundInstitute?.instituteName ?? foundInstitute?.Name ?? '').trim();
        const nameBn = (foundInstitute?.instituteNameBn ?? '').trim();
        const useBengali = this.slugLooksBengali(this.slug) && nameBn;
        const newSlug = useBengali ? `${foundEiin}-${nameBn}` : (name ? `${foundEiin}-${name}` : foundEiin);
        if (newSlug !== this.slug) {
          this.location.replaceState(`/institutes/${slugForUrlDisplay(newSlug)}`);
        }
      },
      error: () => {
        this.error = 'Unable to search institutes.';
        this.loading = false;
      }
    });
  }

  /** Load institute data by EIIN from banbeis and institutes APIs (no search). */
  private loadDataByEiin(eiin: string): void {
    const banbeis$ = this.http.get<any>(`${this.banbeisUrl}?eiin=${encodeURIComponent(eiin)}`).pipe(
      map(res => {
        const results = res?.results || res;
        const list = Array.isArray(results) ? results : [results];
        return list.length ? list[0] : null;
      }),
      catchError(() => of(null))
    );
    const institutes$ = this.http.get<any>(`${this.instituteByEiinUrl}?eiin=${encodeURIComponent(eiin)}`).pipe(
      map(res => {
        const list = res?.results || [];
        return list.length ? list[0] : null;
      }),
      catchError(() => of(null))
    );
    forkJoin({ banbeis: banbeis$, institutes: institutes$ }).subscribe({
      next: ({ banbeis, institutes }) => {
        this.data = this.mergeData(banbeis, institutes);
        if (!this.data || (!banbeis && !institutes)) {
          this.error = 'No details found for this institute.';
        } else {
          this.setInstituteSeoLinks(this.data);
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Unable to load institute details.';
        this.loading = false;
      }
    });
  }

  private mergeData(banbeis: any, institute: any): any {
    const b = banbeis || {};
    const i = institute || {};
    return {
      ...b,
      ...i,
      Name: b.Name ?? i.instituteName ?? null,
      instituteName: i.instituteName ?? b.Name ?? null,
      instituteNameBn: i.instituteNameBn ?? null,
      EIIN: b.EIIN ?? i.eiinNo ?? null,
      eiinNo: i.eiinNo ?? b.EIIN ?? null,
      District: b.District ?? i.districtName ?? null,
      districtName: i.districtName ?? b.District ?? null,
      Thana: b.Thana ?? i.thanaName ?? null,
      thanaName: i.thanaName ?? b.Thana ?? null,
      InstituteType: b.InstituteType ?? i.instituteTypeName ?? null,
      instituteTypeName: i.instituteTypeName ?? b.InstituteType ?? null,
      Mouza: b.Mouza ?? i.mouzaName ?? null,
      mouzaName: i.mouzaName ?? b.Mouza ?? null,
      Contact: b.Contact ?? null,
      Record2: b.Record2 ?? null,
      Record: b.Record ?? null,
      PreStats: b.PreStats ?? null,
      EducationLevels: b.EducationLevels ?? null,
      SSCDepts: b.SSCDepts ?? null,
      HSCDepts: b.HSCDepts ?? null,
      MPO: b.MPO ?? null,
      Rejion: b.Rejion ?? i.divisionName ?? null,
      divisionName: i.divisionName ?? b.Rejion ?? null,
      GovtStatus: b.GovtStatus,
      isGovt: i.isGovt,
      mobile: i.mobile ?? null,
      mobileAlternate: i.mobileAlternate ?? null,
      email: i.email ?? null,
      year: i.year ?? null,
      submissionDate: i.submissionDate ?? null,
      divisionNameBn: i.divisionNameBn ?? null,
      districtNameBn: i.districtNameBn ?? null,
      thanaNameBn: i.thanaNameBn ?? null,
      instituteTypeNameBn: i.instituteTypeNameBn ?? null,
      mouzaNameBn: i.mouzaNameBn ?? null,
      PostOffice: b.PostOffice ?? null,
      PostCode: b.PostCode ?? null,
      WardNo: b.WardNo ?? null,
    };
  }

  /**
   * Add canonical + hreflang (en/bn) links so both English and Bengali institute URLs
   * are valid and Google can show the right one for search language.
   */
  private setInstituteSeoLinks(data: any): void {
    const head = this.doc.head;
    if (!head) return;
    const eiin = String(data?.EIIN ?? data?.eiinNo ?? '').trim();
    if (!eiin) return;
    const nameEn = (data?.instituteName ?? data?.Name ?? '').trim();
    const nameBn = (data?.instituteNameBn ?? '').trim();
    const base = this.doc.querySelector('base')?.getAttribute('href') || '/';
    const baseUrl = base.startsWith('http') ? base.replace(/\/$/, '') : (this.doc.location?.origin || '') + (base === '/' ? '' : base.replace(/\/$/, ''));
    const slugEn = nameEn ? `${eiin}-${nameEn}` : eiin;
    const slugBn = nameBn ? `${eiin}-${nameBn}` : slugEn;
    const urlEn = `${baseUrl}/institutes/${encodeURIComponent(slugEn)}`;
    const urlBn = `${baseUrl}/institutes/${encodeURIComponent(slugBn)}`;
    const ids = ['institute-canonical', 'institute-alternate-en', 'institute-alternate-bn'];
    ids.forEach(id => this.doc.getElementById(id)?.remove());
    const canonical = this.doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = urlEn;
    canonical.id = 'institute-canonical';
    head.appendChild(canonical);
    const altEn = this.doc.createElement('link');
    altEn.rel = 'alternate';
    altEn.hreflang = 'en';
    altEn.href = urlEn;
    altEn.id = 'institute-alternate-en';
    head.appendChild(altEn);
    const altBn = this.doc.createElement('link');
    altBn.rel = 'alternate';
    altBn.hreflang = 'bn';
    altBn.href = urlBn;
    altBn.id = 'institute-alternate-bn';
    head.appendChild(altBn);
  }

  get name(): string {
    return this.data?.Name ?? this.data?.instituteName ?? '—';
  }

  get instituteNameBn(): string {
    return this.data?.instituteNameBn ?? '';
  }

  get govtStatusText(): string {
    if (this.data?.GovtStatus != null) return this.data.GovtStatus ? 'Government' : 'Non-Government';
    if (this.data?.isGovt != null) return this.data.isGovt ? 'Government' : 'Non-Government';
    return '—';
  }

  /** Current year minus 1 for "Total Students of YYYY" / "Class-wise Students of YYYY" (updates every year). */
  get studentsYear(): number {
    return new Date().getFullYear() - 1;
  }

  /** Parse Record into rows of 3 columns (array of arrays). */
  get recordParsed(): string[][] {
    const raw = this.data?.Record;
    if (!raw) return [];
    const arr = this.parseRecordOrRecord2(raw);
    return arr.map(row => this.normalizeRow(row, 3));
  }

  /** Parse Record2 into rows of 5 columns (array of arrays). Supports JSON or Python-tuple-style strings. */
  get record2Parsed(): any[] {
    const raw = this.data?.Record2;
    if (!raw) return [];
    if (typeof raw === 'string') {
      const arr = this.parseRecordOrRecord2(raw);
      return Array.isArray(arr) ? arr.slice(0, 100) : [];
    }
    try {
      const parsed = raw;
      const arr = Array.isArray(parsed) ? parsed : (parsed?.Record2 && Array.isArray(parsed.Record2) ? parsed.Record2 : (parsed?.results?.[0]?.Record2 ? (Array.isArray(parsed.results[0].Record2) ? parsed.results[0].Record2 : []) : []));
      return Array.isArray(arr) ? arr.slice(0, 100) : [];
    } catch {
      return [];
    }
  }

  /** Record2 as rows of 5 cells each (string[][]). */
  get record2Rows(): string[][] {
    const rows = this.record2Parsed;
    return rows.map(row => this.normalizeRow(row, 5));
  }

  private parseRecordOrRecord2(raw: any): any[] {
    if (!raw) return [];
    try {
      const str = typeof raw === 'string' ? raw.trim().replace(/\n/g, '').replace(/'/g, '"').replace(/\(/g, '[').replace(/\)/g, ']') : null;
      const parsed = typeof raw === 'string' ? (str?.startsWith('[') ? JSON.parse(str) : []) : (Array.isArray(raw) ? raw : []);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private normalizeRow(row: any, cols: number): string[] {
    const arr = Array.isArray(row)
      ? row.map((c: any) => (c != null ? String(c).trim() : ''))
      : (row && typeof row === 'object' ? Object.values(row).map((c: any) => (c != null ? String(c).trim() : '')).slice(0, cols) : []);
    const padded = arr.slice(0, cols);
    while (padded.length < cols) padded.push('');
    return padded;
  }

  /** Column indices to show for Record (3 columns): hide columns where every cell is "কোনোটিই নয়". */
  get recordVisibleColIndices(): number[] {
    const rows = this.recordParsed;
    if (!rows.length) return [0, 1, 2];
    const colCount = 3;
    const skip = 'কোনোটিই নয়';
    const indices: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const allSkip = rows.every(r => (r[c] || '').trim() === skip);
      if (!allSkip) indices.push(c);
    }
    return indices;
  }

  /** Column indices to show for Record2 (5 columns): hide columns where every cell is "কোনোটিই নয়". */
  get record2VisibleColIndices(): number[] {
    const rows = this.record2Rows;
    if (!rows.length) return [0, 1, 2, 3, 4];
    const colCount = 5;
    const skip = 'কোনোটিই নয়';
    const indices: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const allSkip = rows.every(r => (r[c] || '').trim() === skip);
      if (!allSkip) indices.push(c);
    }
    return indices;
  }

  record2Keys(row: any): string[] {
    return row && typeof row === 'object' ? Object.keys(row) : [];
  }

  /** Parse PreStats "Level,y1,y2,y3;Level2,..." into rows of 4 columns: Level, year-3, year-2, year-1. */
  get preStatsParsed(): string[][] {
    const raw = this.data?.PreStats;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    return raw
      .split(';')
      .map(s => s.split(',').map(c => c.trim()))
      .filter(row => row.some(c => c.length > 0))
      .map(row => {
        const pad = row.slice(0, 4);
        while (pad.length < 4) pad.push('');
        return pad;
      });
  }

  /** Column headings for PreStats: Level, then years (currentYear-3), (currentYear-2), (currentYear-1). */
  get preStatsColumnHeadings(): string[] {
    const y = new Date().getFullYear();
    return ['Level', String(y - 3), String(y - 2), String(y - 1)];
  }

  get classwiseColumnHeadings(): string[] {
    return ['Level', 'Class', 'Group', 'Department', 'Students'];
  }

  get totalStudentsVisibleColumnHeadings(): string[] {
    return ['Level', 'Group', 'Total Students'];
  }

  /** Headings for visible columns only (matches record2VisibleColIndices). */
  get classwiseVisibleColumnHeadings(): string[] {
    const all = this.classwiseColumnHeadings;
    return this.record2VisibleColIndices.map(i => all[i] ?? '');
  }

  get contactList(): string[] {
    const c = this.data?.Contact;
    if (typeof c !== 'string') return [];
    return c.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  copyToClipboard(text: string, event?: Event): void {
    if (event) event.preventDefault();
    if (!text || typeof text !== 'string') return;
    const t = text.trim();
    if (!t) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(t).then(() => this.showCopyFeedback()).catch(() => this.fallbackCopy(t));
    } else {
      this.fallbackCopy(t);
    }
  }

  private fallbackCopy(text: string): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showCopyFeedback();
    } catch {
      // ignore
    }
  }

  copyFeedback = false;

  private showCopyFeedback(): void {
    this.copyFeedback = true;
    setTimeout(() => (this.copyFeedback = false), 1500);
  }

  /** Apply TrxID: activate row; coin balance from customer.settings on server. */
  applyToken(): void {
    this.trxUnlock.validateTrxidAndActivate(this.newToken).subscribe({
      next: (rem) => {
        this.trxRemaining = rem;
        this.newToken = '';
      },
      error: () => {},
    });
  }
}
