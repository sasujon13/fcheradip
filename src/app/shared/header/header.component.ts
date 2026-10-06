import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ApiService } from '../../service/api.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { CountryService, Country } from '../../service/country.service';
import { LoadingService } from '../../service/loading.service';
import { asyncScheduler, Subscription } from 'rxjs';
import { observeOn } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TrxUnlockService } from '../../service/trx-unlock.service';
import { SESSION_LOGIN_USE_STORED_RETURN } from '../../service/login-redirect.session';
import {
  getDashboardRouterLinkSegments,
  isTeacherAccount,
} from '../../service/dashboard-route.util';


@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.css'],
    standalone: false
})

export class HeaderComponent implements OnInit, OnDestroy {
  isDropdownOpen = false;
  toggleDropdown() {
    this.profilePictureMenuOpen = false;
    this.isDropdownOpen = !this.isDropdownOpen;
    this.resetInactivityTimeout();
  }
  baseUrl = environment.apiUrl;
  /** Token input for header token box (shown on non-NTRCA-section pages). */
  newToken = '';
  /** True when current route already shows app-ntrca-header-section (hide header token box to avoid duplicate). */
  get isNtrcaSectionRoute(): boolean {
    const u = this.router.url;
    return /^\/(ntrca|vacant[5678]|merit[5678]|recommend[5678])(\/|$)/.test(u.split('?')[0]);
  }
  /** Coin balance from customer settings (synced via TrxUnlockService, not localStorage). */
  get headerRemainingUnlocks(): number {
    return this.trxUnlock.getCachedRemaining();
  }
  /** Profile → Dashboard: teachers `/dashboard`, others `/student/dashboard`. */
  get dashboardRouterSegments(): string[] {
    return getDashboardRouterLinkSegments();
  }

  /**
   * Main nav “Dashboard”: guests → signup (`/auth`); logged-in teachers → `/dashboard`;
   * everyone else → `/student/dashboard`. Stable array/options (not getters) so RouterLink
   * does not receive new references every CD tick (avoids dev-mode errors / blank UI).
   */
  dashboardNavLinkSegments: string[] = ['auth'];
  dashboardNavLinkActiveOptions: { exact: boolean } = { exact: true };

  /** Call after `loginStatus` is read from storage so segments/options stay in sync. */
  private syncMainNavDashboardLink(): void {
    if (!this.loginStatus) {
      this.dashboardNavLinkSegments = ['auth'];
      this.dashboardNavLinkActiveOptions = { exact: true };
      return;
    }
    if (isTeacherAccount()) {
      this.dashboardNavLinkSegments = ['dashboard'];
      this.dashboardNavLinkActiveOptions = { exact: true };
    } else {
      this.dashboardNavLinkSegments = ['student', 'dashboard'];
      this.dashboardNavLinkActiveOptions = { exact: false };
    }
  }

  /** Token apply feedback: same app-alert as vacant/recommend/merit (not MatSnackBar). */
  tokenAlertMessage = '';
  showTokenAlert = false;

  /** Trx help tooltip: 1s after pointerleave, then 300ms fade (matches header.shared.css). */
  trxHelpPhase: 'off' | 'on' | 'closing' = 'off';
  private trxHelpTimers: number[] = [];
  public notifications: any[] = [];
  marqueeDuration = 24;
  academicDropdownOpen = false;
  academicDropdownOpen2 = false;
  academicDropdownOpen3 = false;
  academicDropdownOpen4 = false;
  academicDropdownOpen5 = false;
  depts: string[] = [];
  deptNames: any[] = [];
  searchKey: string = "";
  
  // Country selector (top right: dropdown icon left of flag)
  currentCountry: Country | null = null;
  showCountryDropdown: boolean = false;
  featuredCountries: Country[] = [];
  allCountriesForHeader: Country[] = [];
  countryListLoading = false;
  /** True while language is updating in background (show progress ring, dialog for 3s, then reload). */
  languageUpdating = false;
  /** 0–100000 translation progress for the circular progress ring (2.5s duration). */
  translationProgress = 0;
  private countrySubscription: Subscription | null = null;
  private languageUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private translationProgressInterval: ReturnType<typeof setInterval> | null = null;
  @ViewChild('countryWrap') countryWrapRef!: ElementRef;
  @ViewChild('countryTriggerRef') countryTriggerRef!: ElementRef<HTMLElement>;
  /** Drawer: max 600px, min 150px — same vertical gap as login/signup {@link CountrySelectorComponent} drawerMode */
  countryDropdownMaxHeight = 600;
  private readonly DRAWER_MIN = 150;
  private readonly DRAWER_MAX = 600;
  private readonly BOTTOM_GAP = 100;
  /** Search term for header country dropdown (filter countries like login/signup). */
  headerCountrySearch = '';
  /** Global loading overlay (from LoadingService). */
  loadingShow = false;
  loadingProgressPercent = 0;
  /** Default when {@link LoadingState.message} is null. */
  readonly loadingOverlayDefaultMessage = 'Loading Data! Please wait.......';
  loadingOverlayMessage = this.loadingOverlayDefaultMessage;
  private loadingSub: Subscription | null = null;
  /** Filtered list for header country dropdown; when empty search returns all. */
  get filteredCountriesForHeader(): Country[] {
    const q = (this.headerCountrySearch || '').trim().toLowerCase();
    if (q.length === 0) return this.allCountriesForHeader;
    return this.allCountriesForHeader.filter(c =>
      (c.country_name && c.country_name.toLowerCase().includes(q)) ||
      (c.country_name_native && c.country_name_native.toLowerCase().includes(q))
    );
  }

  isCopyrightVisible = false;
  shouldDisplayCopyrightDiv = false;
  headerHeight: number = 0;

  public totalCartItem: number = 0;
  public totalChoiceItem: number = 0;
  public searchTerm!: string;
  menuActive = false;
  inactivityTimeout: any;
  inactivityTimeout2: any;
  loginStatus: boolean = false;
  packageStatus: any = null;
  profileImageUrl: string | null = null;
  profileBadge = 'Star';
  profilePictureMenuOpen = false;
  profilePictureBusy = false;
  get studentStudyMode(): boolean {
    return !!this.packageStatus?.active && this.packageStatus?.progress?.accountType === 'Student';
  }
  academicTimeout: any;
  academicTimeout2: any;

  @HostListener('window:scroll', ['$event'])
  @HostListener('window:resize', ['$event'])
  onScroll(event: any) {
    this.checkVisibility();
    if (this.showCountryDropdown) {
      this.computeCountryDrawerMaxHeight();
    }
  }

  checkVisibility() {
    const copyrightDiv = document.getElementById('copyright');
    if (copyrightDiv) {
      const contentHeight = document.body.scrollHeight;
      const screenHeight = window.innerHeight;
      const scrollTop = window.scrollY;
      const lastScrollPosition = contentHeight - screenHeight;
      this.shouldDisplayCopyrightDiv =
        contentHeight <= (screenHeight + 100000) || (scrollTop >= (lastScrollPosition - 100000) && contentHeight > (screenHeight - 100000));
    }
  }

  @ViewChild('menuToggle', { static: true }) menuToggle!: ElementRef;
  item2: any;
  item1: any;

  constructor(
    private apiService: ApiService,
    public router: Router,
    private countryService: CountryService,
    private loadingService: LoadingService,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private trxUnlock: TrxUnlockService) { }

  ngOnInit(): void {
    // Route components call setTotal() during their own ngOnInit. Deliver the
    // shared header state on the next task so Angular does not mutate a header
    // binding halfway through the same development-mode change-detection pass.
    this.loadingSub = this.loadingService.getState$().pipe(observeOn(asyncScheduler)).subscribe((s) => {
      this.loadingShow = s.show;
      this.loadingProgressPercent = s.progressPercent;
      this.loadingOverlayMessage = s.message ?? this.loadingOverlayDefaultMessage;
      this.cdr.markForCheck();
    });
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.loadNotifications();
        this.syncNewTokenFromPendingStash();
        this.refreshLoginStatusFromStorage();
        this.trxUnlock.fetchCoinBalance().subscribe(() => this.cdr.markForCheck());
        this.loadPackageStatus();
        setTimeout(() => {
          this.checkVisibility();
        }, 100000);
      }
    });
    this.loadNotifications();
    this.checkVisibility();
    localStorage.getItem('isLoggedIn');
    localStorage.getItem('authToken');
    localStorage.getItem('formData');
    sessionStorage.getItem('sessionCartItems'); //added later
    localStorage.getItem(`cartState_`); //added later
    sessionStorage.getItem('sessionChoiceItems'); //added later
    localStorage.getItem(`choiceState_`); //added later
    this.applyHeaderLoginChromeFromStorage();
    this.apiService.search.subscribe((val: any) => {
      this.searchKey = val;
    });
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    this.checkVisibility();
    
    // Subscribe to country changes
    this.countrySubscription = this.countryService.country$.subscribe((country: Country | null) => {
      this.currentCountry = country;
    });
    this.syncNewTokenFromPendingStash();
    this.trxUnlock.fetchCoinBalance().subscribe(() => this.cdr.markForCheck());
    this.loadPackageStatus();
  }

  private loadPackageStatus(): void {
    if (!this.loginStatus) {
      this.packageStatus = null; this.profileImageUrl = null; this.profileBadge = 'Star';
      return;
    }
    this.apiService.getPackageStatus().subscribe({
      next: (status) => {
        this.packageStatus = status;
        this.profileImageUrl = status?.profileImageUrl || null;
        this.profileBadge = status?.badge || 'Star';
        const warning = status?.activeSubscription?.warning?.message;
        if (warning) this.snackBar.open(warning, 'Recharge', { duration: 12000, horizontalPosition: 'center', verticalPosition: 'top', panelClass: ['package-center-snackbar', 'error-snackbar'] })
          .onAction().subscribe(() => this.router.navigate(['/order']));
        this.cdr.markForCheck();
      }, error: (err) => {
        if (err?.status === 401) this.logout();
      }
    });
  }

  chooseProfilePicture(event: Event, input: HTMLInputElement): void {
    event.preventDefault(); event.stopPropagation();
    this.profilePictureMenuOpen = false;
    input.click();
  }

  openProfilePictureMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDropdownOpen = false;
    this.profilePictureMenuOpen = true;
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.snackBar.open('Use a JPG, PNG, or WebP image up to 5 MB.', 'Close', { duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar'] });
      return;
    }
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(image.src);
        this.snackBar.open('Profile picture could not be prepared.', 'Close', { duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar'] });
        return;
      }
      context.clearRect(0, 0, 512, 512);
      context.save();
      context.beginPath();
      context.arc(256, 256, 256, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, sx, sy, side, side, 0, 0, 512, 512);
      context.restore();
      URL.revokeObjectURL(image.src);
      canvas.toBlob((blob) => {
        if (!blob) {
          this.snackBar.open('Profile picture could not be prepared.', 'Close', { duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar'] });
          return;
        }
        this.profilePictureBusy = true;
        this.apiService.uploadProfilePicture(blob).subscribe({
          next: (data) => {
            this.profilePictureBusy = false;
            this.profileImageUrl = data?.profileImageUrl || null;
            this.snackBar.open('Profile picture updated.', 'Close', { duration: 5000, panelClass: ['package-center-snackbar', 'success-snackbar'] });
          },
          error: (err) => {
            this.profilePictureBusy = false;
            this.snackBar.open(err?.error?.error || 'Profile picture could not be updated.', 'Close', { duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar'] });
          },
        });
      }, 'image/webp', .9);
    };
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      this.snackBar.open('The selected image could not be opened.', 'Close', { duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar'] });
    };
    image.src = URL.createObjectURL(file);
  }

  clearProfilePicture(event: Event): void {
    event.preventDefault(); event.stopPropagation();
    this.profilePictureMenuOpen = false;
    this.profilePictureBusy = true;
    this.apiService.removeProfilePicture().subscribe({
      next: () => {
        this.profilePictureBusy = false;
        this.profileImageUrl = null;
        this.snackBar.open('Profile picture cleared.', 'Close', { duration: 5000, panelClass: ['package-center-snackbar', 'success-snackbar'] });
      },
      error: () => {
        this.profilePictureBusy = false;
        this.snackBar.open('Profile picture could not be cleared.', 'Close', { duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar'] });
      },
    });
  }

  /** Keeps token-input margin and other bindings aligned with `localStorage.isLoggedIn` after login redirect. */
  private refreshLoginStatusFromStorage(): void {
    this.applyHeaderLoginChromeFromStorage();
  }

  /** Sync profile vs Login/SignUp visibility and `header.logged-in` from storage (init + every navigation). */
  private applyHeaderLoginChromeFromStorage(): void {
    const token = (localStorage.getItem('authToken') || '').trim();
    const loggedIn = localStorage.getItem('isLoggedIn') === 'true' && !!token;
    const menu_item0 = document.getElementById('menu_item0');
    const menu_item1 = document.getElementById('menu_item1');
    const menu_item2 = document.getElementById('menu_item2');
    const sign_menu = document.getElementById('sign_menu');
    const profileMenu = document.getElementById('profileMenu');
    if (!menu_item2 || !menu_item1 || !menu_item0 || !sign_menu || !profileMenu) {
      this.loginStatus = loggedIn;
      this.syncMainNavDashboardLink();
      this.cdr.markForCheck();
      return;
    }
    this.loginStatus = loggedIn;
    const headerEl = document.querySelector('header');
    if (this.loginStatus) {
      menu_item2.style.display = 'block';
      menu_item1.style.display = 'none';
      menu_item0.style.display = 'none';
      profileMenu.style.display = 'block';
      headerEl?.classList.add('logged-in');
    } else {
      profileMenu.style.display = 'none';
      menu_item2.style.display = 'none';
      menu_item1.style.display = 'block';
      menu_item0.style.display = 'block';
      sign_menu.style.display = '-webkit-inline-box';
      headerEl?.classList.remove('logged-in');
    }
    this.syncMainNavDashboardLink();
    this.cdr.markForCheck();
  }

  /** Refill header TrxID box from session stash after login (hidden on NTRCA section routes). */
  private syncNewTokenFromPendingStash(): void {
    if (this.isNtrcaSectionRoute) return;
    const n = this.trxUnlock.readPendingTrxidForInput(this.newToken);
    if (n !== this.newToken) {
      this.newToken = n;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this.loadingSub) {
      this.loadingSub.unsubscribe();
      this.loadingSub = null;
    }
    if (this.countrySubscription) {
      this.countrySubscription.unsubscribe();
    }
    if (this.languageUpdateTimeout) {
      clearTimeout(this.languageUpdateTimeout);
      this.languageUpdateTimeout = null;
    }
    if (this.translationProgressInterval) {
      clearInterval(this.translationProgressInterval);
      this.translationProgressInterval = null;
    }
    if (this.headerDropdownLeaveTimer) {
      clearTimeout(this.headerDropdownLeaveTimer);
      this.headerDropdownLeaveTimer = null;
    }
    if (this.menuLeaveTimer) {
      clearTimeout(this.menuLeaveTimer);
      this.menuLeaveTimer = null;
    }
    this.clearTrxHelpTimers();
  }

  onTrxHelpPointerEnter(): void {
    this.clearTrxHelpTimers();
    this.trxHelpPhase = 'on';
  }

  onTrxHelpPointerLeave(): void {
    this.clearTrxHelpTimers();
    const delayedClose = window.setTimeout(() => {
      this.trxHelpPhase = 'closing';
      const detach = window.setTimeout(() => {
        this.trxHelpPhase = 'off';
      }, 300);
      this.trxHelpTimers.push(detach);
    }, 1000);
    this.trxHelpTimers.push(delayedClose);
  }

  private clearTrxHelpTimers(): void {
    this.trxHelpTimers.forEach(clearTimeout);
    this.trxHelpTimers.length = 0;
  }

  /** Show token alert (same app-alert as vacant/recommend/merit). Reset first so it re-shows on every click. */
  private showTokenAlertMessage(msg: string): void {
    this.showTokenAlert = false;
    this.tokenAlertMessage = msg;
    this.cdr.detectChanges();
    this.showTokenAlert = true;
    this.cdr.detectChanges();
  }

  /** Apply TrxID (8–10 digits) from header token box — requires login; same flow as NTRCA pages. */
  applyToken(): void {
    this.trxUnlock.validateTrxidAndActivate(this.newToken).subscribe({
      next: () => {
        this.newToken = '';
          this.showTokenAlertMessage(
                'TrxID Successfully Activated, Now you can use the paid services!'
              );
        this.cdr.markForCheck();
      },
      error: (e: { code?: string }) => {
        if (e?.code === 'login_required') {
          return;
        }
        if (e?.code === 'invalid_format') {
          this.showTokenAlertMessage('Enter a valid 8–10 digit TrxID to unlock more Details!');
          return;
        }
        if (e?.code === 'trx_not_found' || e?.code === 'trx_invalid') {
          this.showTokenAlertMessage('Invalid TrxID / TrxID Not Found! Please write the right TrxID!');
          return;
        }
        if (e?.code === 'trx_already_used') {
          this.showTokenAlertMessage('TrxID Already Used! Request another valid TrxID to unlock more Details!');
          return;
        }
        this.showTokenAlertMessage('Failed to validate or activate TrxID! Try again.');
      },
    });
  }

  toggleCountryDropdown(): void {
    this.showCountryDropdown = !this.showCountryDropdown;
    if (!this.showCountryDropdown) this.headerCountrySearch = '';
    if (this.showCountryDropdown) {
      this.computeCountryDrawerMaxHeight();
      if (this.featuredCountries.length === 0 && this.allCountriesForHeader.length > 0) {
        this.featuredCountries = this.countryService.getHeaderFeaturedCountries(this.allCountriesForHeader);
      }
      if (this.allCountriesForHeader.length === 0) {
        this.loadCountriesForHeaderDropdown();
      }
    }
  }

  private computeCountryDrawerMaxHeight(): void {
    if (!this.countryTriggerRef?.nativeElement) return;
    const rect = this.countryTriggerRef.nativeElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - this.BOTTOM_GAP;
    this.countryDropdownMaxHeight = Math.max(this.DRAWER_MIN, Math.min(this.DRAWER_MAX, spaceBelow));
  }

  private loadCountriesForHeaderDropdown(): void {
    this.countryListLoading = true;
    this.countryService.getAllCountries().subscribe({
      next: (list: Country[]) => {
        this.allCountriesForHeader = (list || []).slice().sort((a: Country, b: Country) =>
          (a.country_name || '').localeCompare(b.country_name || '', undefined, { sensitivity: 'base' })
        );
        this.featuredCountries = this.countryService.getHeaderFeaturedCountries(this.allCountriesForHeader);
        this.countryListLoading = false;
      },
      error: () => {
        this.allCountriesForHeader = [];
        this.featuredCountries = [];
        this.countryListLoading = false;
      }
    });
  }

  /** "Website Language" = original Bengali + English mixed (no translation). */
  get websiteLanguageCountry(): Country {
    return CountryService.getWebsiteLanguageCountry();
  }

  selectHeaderCountry(country: Country): void {
    this.showCountryDropdown = false;
    this.headerCountrySearch = '';
    const lang = this.countryService.getLanguageFromCountry(country);
    const currentLang = this.countryService.getPreferredLang();
    // Update icon and save immediately
    this.countryService.setCountry(country, true, false);
    this.currentCountry = country;
    if (lang === currentLang) {
      return; // same language, no need to translate/reload
    }
    // Switching to Website Language (original): clear translation and reload, no progress UI
    if (lang === CountryService.ORIGINAL_LANG) {
      this.countryService.applyGoogleTranslateLang(CountryService.ORIGINAL_LANG);
      return;
    }
    this.languageUpdating = true;
    this.translationProgress = 0;
    this.snackBar.open('Updating Language...', '', { duration: 3000000 });
    if (this.languageUpdateTimeout) clearTimeout(this.languageUpdateTimeout);
    if (this.translationProgressInterval) clearInterval(this.translationProgressInterval);
    const durationMs = 2500;
    const stepMs = 50;
    let elapsed = 0;
    this.translationProgressInterval = setInterval(() => {
      elapsed += stepMs;
      this.translationProgress = Math.min(100000, (elapsed / durationMs) * 100000);
      if (elapsed >= durationMs && this.translationProgressInterval) {
        clearInterval(this.translationProgressInterval);
        this.translationProgressInterval = null;
      }
    }, stepMs);
    this.languageUpdateTimeout = setTimeout(() => {
      this.countryService.applyGoogleTranslateLang(lang);
      this.languageUpdateTimeout = null;
    }, durationMs);
  }

  onCountryChange(country: Country): void {
    this.selectHeaderCountry(country);
  }

  private headerDropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  private headerDropdownLeaveKind: 'profile' | 'country' | null = null;
  private menuLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('document:click', ['$event'])
  onDocumentClickForDropdowns(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile-picture-context-menu')) this.profilePictureMenuOpen = false;
    if (this.countryWrapRef?.nativeElement?.contains(target)) return;
    this.showCountryDropdown = false;
    this.headerCountrySearch = '';
    if (target.closest('.profileMenu')) return;
    this.isDropdownOpen = false;
    if (target.closest('.menu') || target.closest('.menu-toggle')) return;
    this.menuActive = false;
  }

  onHeaderDropdownEnter(kind: 'profile' | 'country'): void {
    this.headerDropdownLeaveKind = null;
    if (this.headerDropdownLeaveTimer) {
      clearTimeout(this.headerDropdownLeaveTimer);
      this.headerDropdownLeaveTimer = null;
    }
  }

  onHeaderDropdownLeave(kind: 'profile' | 'country'): void {
    this.headerDropdownLeaveKind = kind;
    this.headerDropdownLeaveTimer = setTimeout(() => {
      if (this.headerDropdownLeaveKind === kind) {
        if (kind === 'country') this.showCountryDropdown = false;
        else this.isDropdownOpen = false;
      }
      this.headerDropdownLeaveTimer = null;
    }, 1000000);
  }

  onMobileMenuEnter(): void {
    if (this.menuLeaveTimer) {
      clearTimeout(this.menuLeaveTimer);
      this.menuLeaveTimer = null;
    }
  }

  onMobileMenuLeave(): void {
    this.menuLeaveTimer = setTimeout(() => {
      this.menuActive = false;
      this.menuLeaveTimer = null;
    }, 1000000);
  }

  toggleMenu() {
    this.menuActive = !this.menuActive;
  }

  toggleAcademicDropdown() {
    this.academicDropdownOpen = !this.academicDropdownOpen;
  }

  toggleAcademicDropdown2() {
    this.academicDropdownOpen2 = !this.academicDropdownOpen2;
  }

  toggleAcademicDropdown3() {
    this.academicDropdownOpen3 = !this.academicDropdownOpen3;
  }

  toggleAcademicDropdown4() {
    this.academicDropdownOpen4 = !this.academicDropdownOpen4;
  }

  toggleAcademicDropdown5() {
    this.academicDropdownOpen5 = !this.academicDropdownOpen5;
  }

  showDropdown() {
    setTimeout(() => {
      this.academicDropdownOpen = true;
    }, 700000);
  }

  showDropdown2() {
    setTimeout(() => {
      this.academicDropdownOpen2 = true;
    }, 700000);
  }

  showDropdown3() {
    setTimeout(() => {
      this.academicDropdownOpen3 = true;
    }, 700000);
  }

  showDropdown4() {
    setTimeout(() => {
      this.academicDropdownOpen4 = true;
    }, 700000);
  }

  showDropdown5() {
    setTimeout(() => {
      this.academicDropdownOpen5 = true;
    }, 700000);
  }

  hideDropdown() {
    setTimeout(() => {
      this.academicDropdownOpen = false;
    }, 700000);
  }

  hideDropdown2() {
    setTimeout(() => {
      this.academicDropdownOpen2 = false;
    }, 700000);
  }

  hideDropdown3() {
    setTimeout(() => {
      this.academicDropdownOpen3 = false;
    }, 700000);
  }

  hideDropdown4() {
    setTimeout(() => {
      this.academicDropdownOpen4 = false;
    }, 700000);
  }

  hideDropdown5() {
    setTimeout(() => {
      this.academicDropdownOpen5 = false;
    }, 700000);
  }

  @HostListener('window:click', ['$event'])
  onClick(event: Event) {
    this.handleInteraction(event, false);
  }

  @HostListener('window:touchend', ['$event'])
  onTouchEnd(event: Event) {
    setTimeout(() => {
      this.handleInteraction(event, true);
    }, 100000);
  }

  handleInteraction(event: Event, isTouch: boolean) {
    const target = event.target as HTMLElement;
    const insideDropdown = target.closest('.dropdown, .dropdown2');
    const insideToggle = target.closest('.fa-bars');
    const insideMenuItem = target.closest('.menu_item');

    if (insideDropdown) {
      this.menuActive = true;
    } else if (insideMenuItem || !insideToggle) {
      this.menuActive = false;
    }
  }

  loadNotifications() {
    this.apiService.getNotifications().subscribe(
      (data: any) => {
        const rows = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
        this.notifications = rows
          .filter((row: any) => String(row?.text || '').trim())
          .slice(0, 12)
          .reverse();
        const textLength = this.notifications.reduce(
          (total: number, row: any) => total + String(row.text || '').length,
          0,
        );
        this.marqueeDuration = Math.max(18, Math.min(120, 14 + textLength * 0.12));
      },
      (error: any) => {
        console.error('Error Fetching Notifications!');
      }
    );
  }

  search(event: any) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.apiService.search.next(this.searchTerm);
  }

  search2(event: any) {
    event.preventDefault();
    this.searchTerm = '';
    this.apiService.search.next(this.searchTerm);
  }

  searchIconClick() {
    this.apiService.search.next(this.searchTerm);
  }

  /** Save current page and scroll, then go to signup so we can return after signup. */
  navigateToSignup(): void {
    const url = this.router.url || '/';
    if (!url.startsWith('/auth'))
      localStorage.setItem('returnUrl', url);
    sessionStorage.setItem('signupReturnScrollY', String(window.scrollY));
    sessionStorage.setItem('signupFromAppNav', '1');
    this.router.navigate(['/auth']);
  }

  /** Save current page and scroll, then go to login so we can return after login. */
  navigateToLogin(): void {
    const url = this.router.url || '/';
    if (!url.startsWith('/login'))
      localStorage.setItem('returnUrl', url);
    sessionStorage.setItem('signupReturnScrollY', String(window.scrollY));
    sessionStorage.removeItem(SESSION_LOGIN_USE_STORED_RETURN);
    this.router.navigate(['/login']);
  }

  /** Log out: clear auth storage, then full reload so header/token UI resets reliably. */
  logout(): void {
    this.loginStatus = false;
    this.cdr.markForCheck();
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginStatus');
    localStorage.removeItem('authToken');
    localStorage.removeItem('packageStatus');
    localStorage.removeItem('username');
    localStorage.removeItem('fullName');
    localStorage.removeItem('acctype');
    localStorage.removeItem('formData');
    localStorage.removeItem('authFormData');
    window.location.assign('/login');
  }

  resetInactivityTimeout() {
    clearTimeout(this.inactivityTimeout);
    this.inactivityTimeout = setTimeout(() => {
      this.closeMenu();
      this.closeProfileMenu();
    }, 3000000);
  }

  closeMenu() {
    this.menuActive = false;
  }
  closeProfileMenu() {
    this.isDropdownOpen = false;  //added
  }

}
