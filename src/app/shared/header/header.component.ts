import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { ApiService } from '../../service/api.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { CountryService, Country } from '../../service/country.service';
import { Subscription } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';


@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  animations: [
    trigger('flyInOut', [
      state('in', style({ transform: 'translateY(0)' })),
      transition('void => *', [
        style({ transform: 'translateY(-100%)' }),
        animate('0.7s ease-in-out')
      ]),
      transition('* => void', [
        animate('0.7s ease-in-out', style({ transform: 'translateY(100%)' }))
      ])
    ])
  ]
})

export class HeaderComponent implements OnInit, OnDestroy {
  isDropdownOpen = false;
  toggleDropdown() {
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
  /** Remaining unlocks from localStorage (freeUnlockLimit - unlockedEIINs.size). */
  get headerRemainingUnlocks(): number {
    const limit = Number(localStorage.getItem('freeUnlockLimit')) || 10;
    const unlocked = localStorage.getItem('unlockedEIINs');
    const size = unlocked ? (JSON.parse(unlocked) as string[]).length : 0;
    return Math.max(0, limit - size);
  }
  /** Token apply feedback: same app-alert as vacant/recommend/merit (not MatSnackBar). */
  tokenAlertMessage = '';
  showTokenAlert = false;
  @ViewChild('marquee', { static: true }) marqueeElement!: ElementRef;
  public notifications: any[] = [];
  private currentIndex = 0;
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
  /** 0–100 translation progress for the circular progress ring (2.5s duration). */
  translationProgress = 0;
  private countrySubscription: Subscription | null = null;
  private languageUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private translationProgressInterval: ReturnType<typeof setInterval> | null = null;
  @ViewChild('countryWrap') countryWrapRef!: ElementRef;
  @ViewChild('countryTriggerRef') countryTriggerRef!: ElementRef<HTMLElement>;
  /** Drawer: max 600px, min 150px, 100px from window bottom */
  countryDropdownMaxHeight = 600;
  private readonly DRAWER_MIN = 150;
  private readonly DRAWER_MAX = 600;
  private readonly BOTTOM_GAP = 100;
  /** Search term for header country dropdown (filter countries like login/signup). */
  headerCountrySearch = '';
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
  academicTimeout: any;
  academicTimeout2: any;

  @HostListener('window:scroll', ['$event'])
  @HostListener('window:resize', ['$event'])
  onScroll(event: any) {
    this.checkVisibility();
  }

  checkVisibility() {
    const copyrightDiv = document.getElementById('copyright');
    if (copyrightDiv) {
      const contentHeight = document.body.scrollHeight;
      const screenHeight = window.innerHeight;
      const scrollTop = window.scrollY;
      const lastScrollPosition = contentHeight - screenHeight;
      this.shouldDisplayCopyrightDiv =
        contentHeight <= (screenHeight + 100) || (scrollTop >= (lastScrollPosition - 100) && contentHeight > (screenHeight - 100));
    }
  }

  @ViewChild('menuToggle', { static: true }) menuToggle!: ElementRef;
  item2: any;
  item1: any;

  constructor(
    private apiService: ApiService,
    public router: Router,
    private countryService: CountryService,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        setTimeout(() => {
          this.checkVisibility();
        }, 100);
      }
    });
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        setTimeout(() => {
          this.checkVisibility();
        }, 100);
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
    const menu_item0 = document.getElementById('menu_item0');
    const menu_item1 = document.getElementById('menu_item1');
    const menu_item2 = document.getElementById('menu_item2');
    const sign_menu = document.getElementById('sign_menu');
    const profileMenu = document.getElementById('profileMenu');
    if (menu_item2 && menu_item1 && menu_item0 && sign_menu && profileMenu) {
      this.loginStatus = localStorage.getItem('isLoggedIn') === 'true';
      const headerEl = document.querySelector('header');
      if (this.loginStatus) {
        menu_item2.style.display = 'block';
        menu_item1.style.display = 'none';
        menu_item0.style.display = 'none';
        sign_menu.style.display = 'none';
        profileMenu.style.display = 'block';
        headerEl?.classList.add('logged-in');
      }
      else {
        profileMenu.style.display = 'none';
        menu_item2.style.display = 'none';
        menu_item1.style.display = 'block';
        menu_item0.style.display = 'block';
        sign_menu.style.display = '-webkit-inline-box';
        headerEl?.classList.remove('logged-in');
      }
    }
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
  }

  ngOnDestroy(): void {
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
  }

  /** Show token alert (same app-alert as vacant/recommend/merit). Reset first so it re-shows on every click. */
  private showTokenAlertMessage(msg: string): void {
    this.showTokenAlert = false;
    this.tokenAlertMessage = msg;
    this.cdr.detectChanges();
    this.showTokenAlert = true;
    this.cdr.detectChanges();
  }

  /** Apply 8-digit token from header token box (same API + same app-alert as vacant/recommend/merit). */
  applyToken(): void {
    if (!this.newToken || this.newToken.length !== 8) {
      this.showTokenAlertMessage('Enter a valid 8-digit token to unlock more Details!');
      return;
    }
    this.http.get<{ results?: Array<{ id?: number; Counter?: number; Status?: number }> }>(
      `${environment.apiUrl}/token/?token=${this.newToken}`
    ).subscribe({
      next: (res) => {
        const result = res?.results?.[0];
        if (result && result.Counter != null && Number(result.Status) === 0) {
          const currentLimit = Number(localStorage.getItem('freeUnlockLimit')) || 10;
          const newLimit = currentLimit + Number(result.Counter);
          localStorage.setItem('freeUnlockLimit', newLimit.toString());
          this.newToken = '';
          this.showTokenAlertMessage('Token Successfully Activated, Now Click on Lock Icon to Unlock Informations!');
          this.http.post(`${environment.apiUrl}/token/${result.id}/update_status/`, { Status: 1 }).subscribe({
            next: () => {},
            error: () => {}
          });
        } else {
          this.showTokenAlertMessage('Token Already Used! Request a new 8 Digit Token to unlock more Details!');
        }
      },
      error: () => {
        this.showTokenAlertMessage('Failed to validate Token! Try again to unlock more Details!');
      }
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
    this.snackBar.open('Updating Language...', '', { duration: 3000 });
    if (this.languageUpdateTimeout) clearTimeout(this.languageUpdateTimeout);
    if (this.translationProgressInterval) clearInterval(this.translationProgressInterval);
    const durationMs = 2500;
    const stepMs = 50;
    let elapsed = 0;
    this.translationProgressInterval = setInterval(() => {
      elapsed += stepMs;
      this.translationProgress = Math.min(100, (elapsed / durationMs) * 100);
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
    }, 1000);
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
    }, 1000);
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
    }, 700);
  }

  showDropdown2() {
    setTimeout(() => {
      this.academicDropdownOpen2 = true;
    }, 700);
  }

  showDropdown3() {
    setTimeout(() => {
      this.academicDropdownOpen3 = true;
    }, 700);
  }

  showDropdown4() {
    setTimeout(() => {
      this.academicDropdownOpen4 = true;
    }, 700);
  }

  showDropdown5() {
    setTimeout(() => {
      this.academicDropdownOpen5 = true;
    }, 700);
  }

  hideDropdown() {
    setTimeout(() => {
      this.academicDropdownOpen = false;
    }, 700);
  }

  hideDropdown2() {
    setTimeout(() => {
      this.academicDropdownOpen2 = false;
    }, 700);
  }

  hideDropdown3() {
    setTimeout(() => {
      this.academicDropdownOpen3 = false;
    }, 700);
  }

  hideDropdown4() {
    setTimeout(() => {
      this.academicDropdownOpen4 = false;
    }, 700);
  }

  hideDropdown5() {
    setTimeout(() => {
      this.academicDropdownOpen5 = false;
    }, 700);
  }

  @HostListener('window:click', ['$event'])
  onClick(event: Event) {
    this.handleInteraction(event, false);
  }

  @HostListener('window:touchend', ['$event'])
  onTouchEnd(event: Event) {
    setTimeout(() => {
      this.handleInteraction(event, true);
    }, 100);
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
        this.notifications = data.reverse();
        this.startMarquee();
      },
      (error: any) => {
        console.error('Error Fetching Notifications!');
      }
    );
  }

  startMarquee() {
    if (this.notifications.length > 0) {
      this.updateMarqueeMessage();
    }
  }

  updateMarqueeMessage() {
    const messageElement: HTMLElement = this.marqueeElement.nativeElement.querySelector('.msg');
    const lastTen = this.notifications.slice(-12);

    let notificationsHTML = '';
    for (let i = 0; i < lastTen.length; i++) {
      const currentIndex = (this.currentIndex + i) % this.notifications.length;
      const currentNotification = this.notifications[currentIndex];
        notificationsHTML += `<i class="fas fa-info-circle" style="
        background-color: seagreen;
        color: white;
        border: 2px dotted white;
        border-radius: 50%;
        padding: 1px;
        font-size: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center; "></i>&nbsp;&nbsp;<a href="${currentNotification.link}" target="_blank" class="msg_link">${currentNotification.text}</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`;
      }

    messageElement.innerHTML = notificationsHTML;
    this.addDynamicStyles();

    const messageWidth = messageElement.scrollWidth;
    const viewportWidth = window.innerWidth;

    let increasingTime: number;
    if (viewportWidth < 576) {
      increasingTime = 7;
    } else if (viewportWidth < 768) {
      increasingTime = 10;
    } else if (viewportWidth < 992) {
      increasingTime = 12;
    } else if (viewportWidth < 1200) {
      increasingTime = 15;
    } else {
      increasingTime = 20;
    }

    let animationDuration: number;
    if (messageWidth <= viewportWidth) {
      animationDuration = increasingTime;
    } else {
      const numberOfWidths = Math.ceil(messageWidth / viewportWidth);
      animationDuration = increasingTime + numberOfWidths * increasingTime;
    }

    const keyframes = `
      @keyframes scrollLeft {
        0% {
          transform: translateX(100vw);
        }
        100% {
          transform: translateX(-${messageWidth}px);
        }
      }
    `;

    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
      .marquee .msg {
        animation: scrollLeft ${animationDuration}s linear infinite;
      }
      ${keyframes}
    `;
    document.head.appendChild(style);

    this.currentIndex = (this.currentIndex + 1) % this.notifications.length;
  }

  addDynamicStyles() {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
      .msg_link {
        text-decoration: none;
        color: teal;
      }
      .msg_link:hover {
        color: yellowgreen;
      }
      .marquee .msg {
        animation-play-state: running;
      }
      .marquee .msg:hover {
        animation-play-state: paused !important;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
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
    this.router.navigate(['/auth']);
  }

  /** Save current page and scroll, then go to login so we can return after login. */
  navigateToLogin(): void {
    const url = this.router.url || '/';
    if (!url.startsWith('/login'))
      localStorage.setItem('returnUrl', url);
    sessionStorage.setItem('signupReturnScrollY', String(window.scrollY));
    this.router.navigate(['/login']);
  }

  /** Log out and stay on same page/position (like after login/signup). */
  logout(): void {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginStatus');
    localStorage.removeItem('authToken');
    const menu_item0 = document.getElementById('menu_item0');
    const menu_item1 = document.getElementById('menu_item1');
    const menu_item2 = document.getElementById('menu_item2');
    const profileMenu = document.getElementById('profileMenu');
    const sign_menu = document.getElementById('sign_menu');
    if (menu_item2 && menu_item1 && menu_item0 && profileMenu && sign_menu) {
      document.querySelector('header')?.classList.remove('logged-in');
      sign_menu.style.display = '-webkit-inline-box';
      menu_item0.style.display = 'block';
      menu_item1.style.display = 'block';
      menu_item2.style.display = 'none';
      profileMenu.style.display = 'none';
    }
    // Do not navigate: stay on same page and scroll position (like after login/signup)
  }

  resetInactivityTimeout() {
    clearTimeout(this.inactivityTimeout);
    this.inactivityTimeout = setTimeout(() => {
      this.closeMenu();
      this.closeProfileMenu();
    }, 3000);
  }

  closeMenu() {
    this.menuActive = false;
  }
  closeProfileMenu() {
    this.isDropdownOpen = false;  //added
  }

}
