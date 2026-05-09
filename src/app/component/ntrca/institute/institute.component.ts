import { Component, OnInit, AfterViewInit, OnDestroy, Renderer2, HostListener } from '@angular/core';
import { ApiService } from 'src/app/service/api.service';
import { LastInstitutesService } from 'src/app/service/last-institutes.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { debounceTime, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { LoadingService } from 'src/app/service/loading.service';
import { TrxUnlockService } from 'src/app/service/trx-unlock.service';
import { NtrcaUnlockedEiinsService } from 'src/app/service/ntrca-unlocked-eiins.service';

@Component({
  selector: 'app-institute',
  templateUrl: './institute.component.html',
  styleUrls: ['./institute.component.css']
})
export class InstituteComponent implements OnInit, OnDestroy {

  /** Use local API in dev (e.g. /api) or production API; no hardcoded cheradip.com */
  baseUrl: string = `${environment.apiUrl}/institutes/`;

  dataSource: any[] = [];
  searchTerm: string = '';

  types: string[] = [];
  selectedTypes: string[] = [];

  divisions: string[] = [];
  selectedDivisions: string[] = [];

  districts: string[] = [];
  selectedDistricts: string[] = [];

  thanas: string[] = [];
  selectedThanas: string[] = [];

  private searchSubject: Subject<string> = new Subject();
  totalInstitutes: number = 0;
  next: string | null = null;
  previous: string | null = null;

  pageIndex: number = 1;
  pageSize: number = 100;

  /** When current search returned no results, we show last shown results and this message. */
  lastShownMessage: string | null = null;

  /** Token box: TrxID (8–10 digits) input and apply (shared with college-theme via localStorage). */
  newToken: string = '';
  trxRemaining = 0;
  unlockedEIINs: Set<string> = new Set();

  typeDropdownOpen = false;
  divisionDropdownOpen = false;
  districtDropdownOpen = false;
  thanaDropdownOpen = false;
  private dropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  private dropdownLeaveKind: 'type' | 'division' | 'district' | 'thana' | null = null;

  constructor(
    private apiService: ApiService,
    private http: HttpClient,
    private renderer: Renderer2,
    private lastInstitutes: LastInstitutesService,
    private loadingService: LoadingService,
    private trxUnlock: TrxUnlockService,
    private ntrcaUnlocked: NtrcaUnlockedEiinsService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.trxRemaining = this.trxUnlock.getCachedRemaining();
    this.newToken = this.trxUnlock.readPendingTrxidForInput(this.newToken);
    this.trxUnlock.fetchCoinBalance().subscribe((n) => (this.trxRemaining = n));
    const stored = localStorage.getItem('unlockedEIINs');
    if (stored) {
      try {
        this.unlockedEIINs = new Set(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    this.ntrcaUnlocked.syncServerWithLocalMigration().subscribe((list) => {
      list.forEach((e) => this.unlockedEIINs.add(e));
      try {
        localStorage.setItem('unlockedEIINs', JSON.stringify(Array.from(this.unlockedEIINs)));
      } catch {
        /* ignore */
      }
    });

    this.getTypes();
    this.getDivisions();
    this.loadInstitutes();
    this.searchSubject.pipe(
      debounceTime(200)
    ).subscribe(search => {
      this.searchTerm = search;
      this.loadInstitutes(1, search);
    });
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  buildFilterParams(): HttpParams {
    let params = new HttpParams();

    this.selectedTypes.forEach(d => {
      params = params.append('instituteTypeName', d);
    });

    this.selectedDivisions.forEach(d => {
      params = params.append('divisionName', d);
    });

    this.selectedDistricts.forEach(d => {
      params = params.append('districtName', d);
    });

    this.selectedThanas.forEach(t => {
      params = params.append('thanaName', t);
    });

    return params;
  }

  clearFilters() {
    this.types = [];
    this.selectedTypes = [];
    this.selectedDivisions = [];
    this.selectedDistricts = [];
    this.selectedThanas = [];
    this.districts = [];
    this.thanas = [];
    this.searchTerm = '';
    this.pageIndex = 1;
    this.getTypes();
    this.getDivisions();
    this.loadInstitutes();

  }

  getTypes() {
    this.http.get<string[]>(`${this.baseUrl}unique_types/`)
      .subscribe(res => this.types = res);
  }

  onTypeChange(instituteTypeName: string, event: any) {
    if (event.target.checked) {
      this.selectedTypes.push(instituteTypeName);
    } else {
      this.selectedTypes = this.selectedTypes.filter(d => d !== instituteTypeName);
    }

    this.loadInstitutes()
  }

  getDivisions() {
    this.http.get<string[]>(`${this.baseUrl}unique_divisions/`)
      .subscribe(res => this.divisions = res);
  }

  onDivisionChange(divisionName: string, event: any) {
    if (event.target.checked) {
      this.selectedDivisions.push(divisionName);
    } else {
      this.selectedDivisions = this.selectedDivisions.filter(d => d !== divisionName);
    }

    this.loadDistricts();
    this.loadInstitutes()
  }


  loadDistricts() {
    if (this.selectedDivisions.length === 0) {
      this.districts = [];
      return;
    }

    let params = new HttpParams();
    this.selectedDivisions.forEach(d => {
      params = params.append('divisionName', d);
    });

    this.http.get<string[]>(`${this.baseUrl}unique_districts/`, { params })
      .subscribe(res => this.districts = res);
  }

  onDistrictChange(districtName: string, event: any) {
    if (event.target.checked) {
      this.selectedDistricts.push(districtName);
    } else {
      this.selectedDistricts = this.selectedDistricts.filter(d => d !== districtName);
    }
    this.loadThanas();
    this.loadInstitutes();
  }

  loadThanas() {
    if (this.selectedDistricts.length === 0) {
      this.thanas = [];
      return;
    }

    let params = new HttpParams();
    this.selectedDistricts.forEach(d => {
      params = params.append('districtName', d);
    });

    this.http.get<string[]>(`${this.baseUrl}unique_thanas/`, { params })
      .subscribe(res => this.thanas = res);
  }

  onThanaChange(thanaName: string, event: any) {
    if (event.target.checked) {
      this.selectedThanas.push(thanaName);
    } else {
      this.selectedThanas = this.selectedThanas.filter(t => t !== thanaName);
    }
    this.loadInstitutes();
  }

  // loadInstitutes(url?: string) {
  //   this.apiService.getInstitutes2(url).subscribe((res: any) => {
  //     this.dataSource = res.results;
  //     this.totalInstitutes = res.count;
  //     this.next = res.next;
  //     this.previous = res.previous;

  //     this.pageSize = res.results.length;

  //     if (this.previous === null) {
  //       this.pageIndex = 1; 
  //     } else {
  //       const urlParams = new URL(res.next || res.previous).searchParams;
  //       const page = urlParams.get("page");
  //       if (page) this.pageIndex = res.next ? parseInt(page) - 1 : parseInt(page) + 1;
  //     }
  //   });
  // }

  loadInstitutes(page: number = 1, searchTerm?: string) {
    let params = this.buildFilterParams();

    if (searchTerm && searchTerm.trim() !== '') {
      params = params.set('q', searchTerm.trim());
    }
    params = params.set('page', page.toString());
    this.http.get<any>(`${this.baseUrl}`, { params }).subscribe((res) => {
      this.handleInstitutesResponse(res, page);
    });
  }

  handleInstitutesResponse(res: any, page: number) {
    let results = res?.results ?? [];
    let count = res?.count ?? 0;
    if (results.length > 0) {
      results = this.applyEiinPriority(results, this.searchTerm);
      count = results.length;
      this.lastInstitutes.setLastShown(this.searchTerm, results);
      this.lastShownMessage = null;
      this.dataSource = results;
      this.totalInstitutes = count;
    } else {
      const last = this.lastInstitutes.getLastShown();
      if (last && last.results.length > 0) {
        this.dataSource = last.results;
        this.totalInstitutes = last.results.length;
        this.lastShownMessage = `No results for "${this.searchTerm}". Showing last results for "${last.query}".`;
      } else {
        this.dataSource = [];
        this.totalInstitutes = 0;
        this.lastShownMessage = null;
      }
    }
    this.pageSize = this.dataSource.length;
    this.pageIndex = page;
    this.pageSize = 100;
    this.next = res?.next ?? null;
    this.previous = res?.previous ?? null;
  }


  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  /**
   * When user types a number: prioritize EIIN match (EIIN &lt; 10 digits).
   * If 11 digits, treat as mobile search and do nothing. If &gt;2 results and search is EIIN-like, keep only EIIN matches.
   */
  private applyEiinPriority(results: any[], searchTerm: string): any[] {
    const q = (searchTerm || '').trim();
    if (q === '') return results;
    const onlyDigits = /^\d+$/.test(q);
    if (!onlyDigits) return results;
    const len = q.length;
    if (len >= 11) return results; // mobile number, no EIIN priority
    if (len >= 10) return results; // EIIN is less than 10 digits
    const eiinMatches = results.filter((inst) => this.getEiinFromInst(inst) === q);
    const rest = results.filter((inst) => this.getEiinFromInst(inst) !== q);
    const sorted = [...eiinMatches, ...rest];
    if (sorted.length > 2) return eiinMatches.length > 0 ? eiinMatches : sorted;
    return sorted;
  }

  private getEiinFromInst(inst: any): string {
    const v = inst?.eiinNo ?? inst?.EIIN ?? inst?.id;
    return v != null && v !== '' ? String(v).trim() : '';
  }

  /** Full slug for institute URL: "eiinNo-Institute Name" or just "eiinNo" if no name. */
  getInstituteSlug(inst: any): string {
    const eiin = inst?.eiinNo ?? inst?.EIIN ?? inst?.id ?? '';
    const name = (inst?.instituteName || inst?.Name || '').trim();
    if (name) return `${eiin}-${name}`;
    return String(eiin);
  }

  onSearch() {
    this.loadInstitutes(1, this.searchTerm);
  }

  goNext() {
    if (this.pageIndex * this.pageSize < this.totalInstitutes) {
      this.loadInstitutes(this.pageIndex + 1, this.searchTerm);
    }
  }

  goPrevious() {
    if (this.pageIndex > 1) {
      this.loadInstitutes(this.pageIndex - 1, this.searchTerm);
    }
  }

  get displayText(): string {
    const start = (this.pageIndex - 1) * this.pageSize + 1;
    const end = Math.min(this.pageIndex * this.pageSize, this.totalInstitutes);
    return `Displaying ${start}-${end} records of total ${this.totalInstitutes} Records!`;
  }

  get displayText2(): string {
    const start = (this.pageIndex - 1) * this.pageSize + 1;
    const end = Math.min(this.pageIndex * this.pageSize, this.totalInstitutes);
    return `   ${start} - ${end}   `;
  }

  /** Apply TrxID; coin balance in customer.settings (requires login). */
  applyToken(): void {
    this.trxUnlock.validateTrxidAndActivate(this.newToken).subscribe({
      next: (rem) => {
        this.trxRemaining = rem;
        this.newToken = '';
      },
      error: () => {},
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.dropdownx')) return;
    this.typeDropdownOpen = false;
    this.divisionDropdownOpen = false;
    this.districtDropdownOpen = false;
    this.thanaDropdownOpen = false;
    this.clearDropdownLeaveTimer();
  }

  toggleTypeDropdown(): void {
    this.divisionDropdownOpen = this.districtDropdownOpen = this.thanaDropdownOpen = false;
    this.typeDropdownOpen = !this.typeDropdownOpen;
    this.clearDropdownLeaveTimer();
  }

  toggleDivisionDropdown(): void {
    this.typeDropdownOpen = this.districtDropdownOpen = this.thanaDropdownOpen = false;
    this.divisionDropdownOpen = !this.divisionDropdownOpen;
    this.clearDropdownLeaveTimer();
  }

  toggleDistrictDropdown(): void {
    this.typeDropdownOpen = this.divisionDropdownOpen = this.thanaDropdownOpen = false;
    this.districtDropdownOpen = !this.districtDropdownOpen;
    this.clearDropdownLeaveTimer();
  }

  toggleThanaDropdown(): void {
    this.typeDropdownOpen = this.divisionDropdownOpen = this.districtDropdownOpen = false;
    this.thanaDropdownOpen = !this.thanaDropdownOpen;
    this.clearDropdownLeaveTimer();
  }

  onDropdownEnter(kind: 'type' | 'division' | 'district' | 'thana'): void {
    this.dropdownLeaveKind = kind;
    this.clearDropdownLeaveTimer();
  }

  onDropdownLeave(kind: 'type' | 'division' | 'district' | 'thana'): void {
    this.dropdownLeaveKind = kind;
    this.dropdownLeaveTimer = setTimeout(() => {
      if (this.dropdownLeaveKind === kind) {
        if (kind === 'type') this.typeDropdownOpen = false;
        else if (kind === 'division') this.divisionDropdownOpen = false;
        else if (kind === 'district') this.districtDropdownOpen = false;
        else this.thanaDropdownOpen = false;
      }
      this.dropdownLeaveTimer = null;
    }, 1000);
  }

  private clearDropdownLeaveTimer(): void {
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
    this.dropdownLeaveKind = null;
  }

  ngOnDestroy(): void {
    this.clearDropdownLeaveTimer();
  }
}
