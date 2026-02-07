// import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
// import { trigger, state, style, transition, animate } from '@angular/animations';
// import { CartService } from 'src/app/service/cart.service';
// import { ChoiceService } from 'src/app/service/choice.service';
// import { ApiService } from 'src/app/service/api.service';
// import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';


// @Component({
//   selector: 'app-header',
//   templateUrl: './header.component.html',
//   styleUrls: ['./header.component.css'],
//   animations: [
//     // Define the animation triggers
//     trigger('flyInOut', [
//       state('in', style({ transform: 'translateY(0)' })),
//       transition('void => *', [
//         style({ transform: 'translateY(-100%)' }),
//         animate('0.3s ease-in-out')
//       ]),
//       transition('* => void', [
//         animate('0.3s ease-in-out', style({ transform: 'translateY(100%)' }))
//       ])
//     ])
//   ]
// })
// export class HeaderComponent implements OnInit {
//   @ViewChild('marquee', { static: true }) marqueeElement!: ElementRef;
//   isCopyrightVisible = false;
//   shouldDisplayCopyrightDiv = false; 

//   @HostListener('window:scroll', ['$event'])
//   @HostListener('window:resize', ['$event'])
//   onScroll(event: any) {
//     this.checkVisibility();
//   }

//   checkVisibility() {
//     const copyrightDiv = document.getElementById('copyright');
//     if (copyrightDiv) {
//       const contentHeight = document.body.scrollHeight;
//       const screenHeight = window.innerHeight;
//       const scrollTop = window.scrollY;
//       const lastScrollPosition = contentHeight - screenHeight;
//       this.shouldDisplayCopyrightDiv =
//         contentHeight <= screenHeight ||
//         (scrollTop >= lastScrollPosition && contentHeight > screenHeight);
//     }
//   }

//   isDropdownOpen = false;
//   toggleDropdown() {
//     this.isDropdownOpen = !this.isDropdownOpen;
//     this.resetInactivityTimeout();
//   }

//   public notifications: any[] = [];
//   public totalCartItem: number = 0;
//   public totalChoiceItem: number = 0;
//   public searchTerm!: string;
//   private currentIndex = 0;
//   menuActive = false;
//   inactivityTimeout: any;
//   loginStatus: boolean = false;

//   @ViewChild('menuToggle', { static: true }) menuToggle!: ElementRef;
//   @ViewChild('menu_item2', { static: true }) menu_item2!: ElementRef; 
//   item2: any;
//   item1: any;


//   constructor(
//     private cartService: CartService, 
//     private choiceService: ChoiceService, 
//     private route: ActivatedRoute, 
//     private router: Router,
//     private apiService: ApiService) { }

//   ngOnInit(): void {
//     this.router.events.subscribe((event) => {
//       if (event instanceof NavigationEnd) {
//         setTimeout(() => {
//           this.checkVisibility();
//         }, 100);
//       }
//     });
//     this.loadNotifications();
//     this.checkVisibility();
//     localStorage.getItem('isLoggedIn');
//     localStorage.getItem('authToken');
//     localStorage.getItem('formData');
//     sessionStorage.getItem('sessionCartItems'); //added later
//     localStorage.getItem(`cartState_`); //added later
//     sessionStorage.getItem('sessionChoiceItems'); //added later
//     localStorage.getItem(`choiceState_`); //added later
//     const menu_item0 = document.getElementById('menu_item0');
//     const menu_item1 = document.getElementById('menu_item1');
//     const menu_item2 = document.getElementById('menu_item2');
//     const sign_menu = document.getElementById('sign_menu');
//     const profileMenu = document.getElementById('profileMenu');
//     if (menu_item2 && menu_item1 && menu_item0 && sign_menu && profileMenu) {
//       this.loginStatus = localStorage.getItem('isLoggedIn') === 'true';
//       if (this.loginStatus) {
//         menu_item2.style.display = 'block';
//         menu_item1.style.display = 'none';
//         menu_item0.style.display = 'none';
//         sign_menu.style.display = 'none';
//       }
//       else {
//         profileMenu.style.display = 'none';
//         menu_item2.style.display = 'none';
//         menu_item1.style.display = 'block';
//         menu_item0.style.display = 'block';

//       }
//     }

//     this.cartService.getCartProducts()
//       .subscribe((res: any[]) => {
//         this.totalCartItem = res.length;
//       });

//     this.choiceService.getChoiceProducts()
//       .subscribe((res: any[]) => {
//         this.totalChoiceItem = res.length;
//       });

//     this.route.queryParams.subscribe(params => {
//       if (this.route.snapshot.url.length > 0 && this.route.snapshot.url[0].path === 'products' && params['itemId']) {
//         this.added(params['itemId']);
//         this.addedC(params['itemId']);
//       }
//     });
//   }

//   loadNotifications() {
//     this.apiService.getNotifications().subscribe(
//       data => {
//         this.notifications = data;
//         this.startMarquee();
//       },
//       error => {
//         console.error('Error fetching notifications!');
//       }
//     );
//   }

//   startMarquee() {
//     if (this.notifications.length > 0) {
//       this.updateMarqueeMessage();
//       this.marqueeElement.nativeElement.addEventListener('animationiteration', () => {
//         this.updateMarqueeMessage();
//       });
//     }
//   }

//   updateMarqueeMessage() {
//     const messageElement: HTMLElement = this.marqueeElement.nativeElement.querySelector('.msg');

//     let notificationsHTML = '';
//     for (let i = 0; i < this.notifications.length; i++) {
//       const currentIndex = (this.currentIndex + i) % this.notifications.length;
//       const currentNotification = this.notifications[currentIndex];
//       notificationsHTML += `<a href="${currentNotification.link}" class="msg_link" target="_blank">${currentNotification.text}</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`;
//     }

//     messageElement.innerHTML = notificationsHTML;
//     this.addDynamicStyles();

//     const messageWidth = messageElement.scrollWidth;
//     const viewportWidth = window.innerWidth;

//     let increasingTime: number;
//     if (viewportWidth < 576) {
//       increasingTime = 7;
//     } else if (viewportWidth < 768) {
//       increasingTime = 10;
//     } else if (viewportWidth < 992) {
//       increasingTime = 12;
//     } else if (viewportWidth < 1200) {
//       increasingTime = 15;
//     } else {
//       increasingTime = 20;
//     }

//     let animationDuration: number;
//     if (messageWidth <= viewportWidth) {
//       animationDuration = increasingTime;
//     } else {
//       const numberOfWidths = Math.ceil(messageWidth / viewportWidth);
//       animationDuration = increasingTime + numberOfWidths * increasingTime;
//     }

//     const keyframes = `
//       @keyframes scrollLeft {
//         0% {
//           transform: translateX(100vw);
//         }
//         100% {
//           transform: translateX(-${messageWidth}px);
//         }
//       }
//     `;

//     const style = document.createElement('style');
//     style.type = 'text/css';
//     style.innerHTML = `
//       .marquee .msg {
//         animation: scrollLeft ${animationDuration}s linear infinite;
//       }
//       ${keyframes}
//     `;
//     document.head.appendChild(style);

//     this.currentIndex = (this.currentIndex + 1) % this.notifications.length;
//   }

//   addDynamicStyles() {
//     const style = document.createElement('style');
//     style.type = 'text/css';
//     style.innerHTML = `
//       .msg_link {
//         text-decoration: none;
//         color: teal;
//       }
//       .msg_link:hover {
//         color: yellowgreen;
//       }
//     `;
//     document.head.appendChild(style);
//   } 

//   added(itemId: any) {
//     const sessionCartItems = JSON.parse(sessionStorage.getItem('sessionCartItems') || '[]');

//     if (sessionCartItems.includes(itemId)) {
//       const itemToAdd = this.getProductById(itemId);
//       if (itemToAdd) {
//         itemToAdd.add_to_cart = true;
//         this.cartService.addtocart(itemToAdd);
//       }
//     }
//   }

//   addedC(itemId: any) {
//     const sessionChoiceItems = JSON.parse(sessionStorage.getItem('sessionCartItems') || '[]');

//     if (sessionChoiceItems.includes(itemId)) {
//       const itemToAdd = this.getProductById(itemId);
//       if (itemToAdd) {
//         itemToAdd.love = true;
//         this.choiceService.addtochoice(itemToAdd);
//       }
//     }
//   }

//   getProductById(itemId: any): any {
//     const foundItem = this.cartService.cartItemList.find(item => item.id === itemId);
//     return foundItem || null;
//   }

//   getChoiceById(itemId: any): any {
//     const foundItem = this.choiceService.choiceItemList.find(item => item.id === itemId);
//     return foundItem || null;
//   }

//   search(event: any) {
//     this.searchTerm = (event.target as HTMLInputElement).value;
//     this.cartService.search.next(this.searchTerm);
//     this.choiceService.search.next(this.searchTerm);
//   }
//   toggleMenu() {
//     this.menuActive = !this.menuActive;
//     this.resetInactivityTimeout();
//   }

//   closeMenu() {
//     this.menuActive = false;
//   }
//   closeProfileMenu() {
//     this.isDropdownOpen = false;  //added
//   }


//   resetInactivityTimeout() {
//     clearTimeout(this.inactivityTimeout);
//     this.inactivityTimeout = setTimeout(() => {
//       this.closeMenu();
//       this.closeProfileMenu();
//     }, 3000);
//   }
//   @HostListener('document:click', ['$event'])
//   onDocumentClick(event: Event) {
//     if (!this.menuToggle.nativeElement.contains(event.target)) {
//       this.closeMenu();
//     }
//     if (!this.menu_item2.nativeElement.contains(event.target)) {
//       this.closeProfileMenu(); //added
//     }
//   }

//   @HostListener('window:mousemove', ['$event'])
//   onWindowMouseMove() {
//     this.resetInactivityTimeout();
//   }

//   @HostListener('window:keydown', ['$event'])
//   onWindowKeyDown() {
//     this.resetInactivityTimeout();
//   }

//   logout(): void {
//     localStorage.removeItem('isLoggedIn');
//     localStorage.removeItem('loginStatus');
//     localStorage.removeItem('authToken');
//     const menu_item0 = document.getElementById('menu_item0');
//     const menu_item1 = document.getElementById('menu_item1');
//     const menu_item2 = document.getElementById('menu_item2');
//     const profileMenu = document.getElementById('profileMenu');
//     const sign_menu = document.getElementById('sign_menu');
//     if (menu_item2 && menu_item1 && menu_item0 && profileMenu && sign_menu) {
//         sign_menu.style.display = '-webkit-inline-box';
//         menu_item0.style.display = 'block';
//         menu_item1.style.display = 'block';
//         menu_item2.style.display = 'none';
//         profileMenu.style.display = 'none';

//       }
//     this.router.navigate(['']);
//   }

// }










import { Component, ElementRef, HostListener, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { ApiService } from '../../service/api.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { CountryService, Country } from '../../service/country.service';
import { Subscription } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';


@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  animations: [
    trigger('flyInOut', [
      state('in', style({ transform: 'translateY(0)' })),
      transition('void => *', [
        style({ transform: 'translateY(-100%)' }),
        animate('0.3s ease-in-out')
      ]),
      transition('* => void', [
        animate('0.3s ease-in-out', style({ transform: 'translateY(100%)' }))
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
  baseUrl = 'https://cheradip.com';
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
    private router: Router,
    private countryService: CountryService,
    private snackBar: MatSnackBar) { }

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
      if (this.loginStatus) {
        menu_item2.style.display = 'block';
        menu_item1.style.display = 'none';
        menu_item0.style.display = 'none';
        sign_menu.style.display = 'none';
      }
      else {
        profileMenu.style.display = 'none';
        menu_item2.style.display = 'none';
        menu_item1.style.display = 'block';
        menu_item0.style.display = 'block';

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
  }

  toggleCountryDropdown(): void {
    this.showCountryDropdown = !this.showCountryDropdown;
    if (this.showCountryDropdown && this.featuredCountries.length === 0) {
      this.loadCountriesForHeaderDropdown();
    }
  }

  private loadCountriesForHeaderDropdown(): void {
    this.countryListLoading = true;
    this.countryService.getFeaturedCountries().subscribe({
      next: (list: Country[]) => { this.featuredCountries = list || []; },
      error: () => { this.featuredCountries = []; }
    });
    this.countryService.getAllCountries().subscribe({
      next: (list: Country[]) => {
        this.allCountriesForHeader = (list || []).slice().sort((a: Country, b: Country) =>
          (a.country_name || '').localeCompare(b.country_name || '', undefined, { sensitivity: 'base' })
        );
        this.countryListLoading = false;
      },
      error: () => {
        this.allCountriesForHeader = [];
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

  @HostListener('document:click', ['$event'])
  onDocumentClickForCountry(event: Event): void {
    if (this.countryWrapRef?.nativeElement?.contains(event.target)) return;
    this.showCountryDropdown = false;
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
      sign_menu.style.display = '-webkit-inline-box';
      menu_item0.style.display = 'block';
      menu_item1.style.display = 'block';
      menu_item2.style.display = 'none';
      profileMenu.style.display = 'none';

    }
    this.router.navigate(['']);
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
