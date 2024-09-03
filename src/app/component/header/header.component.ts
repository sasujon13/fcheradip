import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CartService } from 'src/app/service/cart.service';
import { ChoiceService } from 'src/app/service/choice.service';
import { ApiService } from 'src/app/service/api.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';


@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  animations: [
    // Define the animation triggers
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
export class HeaderComponent implements OnInit {
  @ViewChild('marquee', { static: true }) marqueeElement!: ElementRef;
  isCopyrightVisible = false;
  shouldDisplayCopyrightDiv = false; 

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
        contentHeight <= screenHeight ||
        (scrollTop >= lastScrollPosition && contentHeight > screenHeight);
    }
  }

  isDropdownOpen = false;
  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.resetInactivityTimeout();
  }
  
  public notifications: any[] = [];
  public totalCartItem: number = 0;
  public totalChoiceItem: number = 0;
  public searchTerm!: string;
  private currentIndex = 0;
  menuActive = false;
  inactivityTimeout: any;
  loginStatus: boolean = false;

  @ViewChild('menuToggle', { static: true }) menuToggle!: ElementRef;
  @ViewChild('menu_item2', { static: true }) menu_item2!: ElementRef; 
  item2: any;
  item1: any;


  constructor(
    private cartService: CartService, 
    private choiceService: ChoiceService, 
    private route: ActivatedRoute, 
    private router: Router,
    private apiService: ApiService) { }

  ngOnInit(): void {
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

    this.cartService.getCartProducts()
      .subscribe((res: any[]) => {
        this.totalCartItem = res.length;
      });

    this.choiceService.getChoiceProducts()
      .subscribe((res: any[]) => {
        this.totalChoiceItem = res.length;
      });

    this.route.queryParams.subscribe(params => {
      if (this.route.snapshot.url.length > 0 && this.route.snapshot.url[0].path === 'products' && params['itemId']) {
        this.added(params['itemId']);
        this.addedC(params['itemId']);
      }
    });
  }


  loadNotifications() {
    this.apiService.getNotifications().subscribe(
      data => {
        this.notifications = data.messages; // Adjust according to your API response
        this.startMarquee();
      },
      error => {
        console.error('Error fetching notifications:', error);
      }
    );
  }

  startMarquee() {
    if (this.notifications.length > 0) {
      this.updateMarqueeMessage();
      this.marqueeElement.nativeElement.addEventListener('animationiteration', () => {
        this.updateMarqueeMessage();
      });
    }
  }

  updateMarqueeMessage() {
    const messageElement = this.marqueeElement.nativeElement.querySelector('.msg');
    messageElement.textContent = this.notifications[this.currentIndex].text;
    messageElement.href = this.notifications[this.currentIndex].link;
    this.currentIndex = (this.currentIndex + 1) % this.notifications.length;
  }

  added(itemId: any) {
    const sessionCartItems = JSON.parse(sessionStorage.getItem('sessionCartItems') || '[]');

    if (sessionCartItems.includes(itemId)) {
      const itemToAdd = this.getProductById(itemId);
      if (itemToAdd) {
        itemToAdd.add_to_cart = true;
        this.cartService.addtocart(itemToAdd);
      }
    }
  }

  addedC(itemId: any) {
    const sessionChoiceItems = JSON.parse(sessionStorage.getItem('sessionCartItems') || '[]');

    if (sessionChoiceItems.includes(itemId)) {
      const itemToAdd = this.getProductById(itemId);
      if (itemToAdd) {
        itemToAdd.love = true;
        this.choiceService.addtochoice(itemToAdd);
      }
    }
  }

  getProductById(itemId: any): any {
    const foundItem = this.cartService.cartItemList.find(item => item.id === itemId);
    return foundItem || null;
  }

  getChoiceById(itemId: any): any {
    const foundItem = this.choiceService.choiceItemList.find(item => item.id === itemId);
    return foundItem || null;
  }

  search(event: any) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.cartService.search.next(this.searchTerm);
    this.choiceService.search.next(this.searchTerm);
  }
  toggleMenu() {
    this.menuActive = !this.menuActive;
    this.resetInactivityTimeout();
  }

  closeMenu() {
    this.menuActive = false;
  }
  closeProfileMenu() {
    this.isDropdownOpen = false;  //added
  }


  resetInactivityTimeout() {
    clearTimeout(this.inactivityTimeout);
    this.inactivityTimeout = setTimeout(() => {
      this.closeMenu();
      this.closeProfileMenu();
    }, 3000);
  }
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.menuToggle.nativeElement.contains(event.target)) {
      this.closeMenu();
    }
    if (!this.menu_item2.nativeElement.contains(event.target)) {
      this.closeProfileMenu(); //added
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove() {
    this.resetInactivityTimeout();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown() {
    this.resetInactivityTimeout();
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

}
