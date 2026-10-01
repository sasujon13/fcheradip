import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  NgZone,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { CountryService } from './service/country.service';
import { WelcomeBonusCeremonyService } from './service/welcome-bonus-ceremony.service';
import { AuthSessionService } from './service/auth-session.service';
import { TrxUnlockService } from './service/trx-unlock.service';
import { productRouteForHostname } from './config/product-sites';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    standalone: false
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  title = 'Cheradip';
  showSiteHeader = true;

  @ViewChild('pageShell', { static: false }) pageShellRef?: ElementRef<HTMLElement>;

  private shellResizeObserver?: ResizeObserver;
  /** Deferred passes after route/content paint so scrollHeight / shell bottom reflect loaded UI. */
  private contentMeasureTimers: number[] = [];

  constructor(
    private countryService: CountryService,
    private router: Router,
    private welcomeCeremony: WelcomeBonusCeremonyService,
    private authSession: AuthSessionService,
    private trxUnlock: TrxUnlockService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routeProductSubdomain();
    this.showSiteHeader = this.shouldShowSiteHeader(this.router.url);
    this.primeBrowserAudioOnFirstUserGesture();
    this.authSession.startSessionMonitor();
    if (this.authSession.hasStoredSession()) {
      this.trxUnlock.fetchCoinBalance().subscribe();
    }
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.showSiteHeader = this.shouldShowSiteHeader(e.urlAfterRedirects || e.url);
        this.authSession.startSessionMonitor();
        setTimeout(() => this.welcomeCeremony.tryPlayAfterNavigation(), 400);
        this.queueWatermarkMeasureAfterContent();
      });
    // Preferred UI language: from storage or infer from country (e.g. BD -> bn). Data from country table.
    this.countryService.country$.pipe(take(1)).subscribe(c => {
      this.countryService.initPreferredLangFromCountry(c?.country_code);
    });
  }

  /** Serve the correct product page when the shared Angular build is opened by subdomain. */
  private routeProductSubdomain(): void {
    const target = productRouteForHostname(window.location.hostname);
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (target && (path === '/' || path === '/index')) {
      // Render the product route but keep the clean subdomain root visible.
      // Direct legacy paths remain independently routable on every hostname.
      void this.router.navigateByUrl(target, { skipLocationChange: true });
    }
  }

  /**
   * Chrome (and most desktop browsers) block `HTMLAudioElement.play()` without a prior user gesture.
   * Waking the Web Audio path once from the first pointer/key event helps later ceremony audio on localhost.
   */
  private primeBrowserAudioOnFirstUserGesture(): void {
    this.ngZone.runOutsideAngular(() => {
      const once = (): void => {
        window.removeEventListener('pointerdown', once);
        window.removeEventListener('touchend', once);
        window.removeEventListener('keydown', once);
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          void ctx.resume().finally(() => {
            try {
              ctx.close();
            } catch {
              /* noop */
            }
          });
        }
        try {
          const a = new Audio();
          a.preload = 'auto';
          a.muted = true;
          a.src =
            'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==';
          void a.play().catch(() => {});
        } catch {
          /* noop */
        }
      };
      window.addEventListener('pointerdown', once, { passive: true });
      window.addEventListener('touchend', once, { passive: true });
      window.addEventListener('keydown', once);
    });
  }

  ngAfterViewInit(): void {
    this.queueWatermarkMeasureAfterContent();
    this.ngZone.runOutsideAngular(() => {
      this.attachShellResizeObserver();
    });
  }

  ngOnDestroy(): void {
    this.shellResizeObserver?.disconnect();
    this.clearContentMeasureTimers();
  }

  private clearContentMeasureTimers(): void {
    for (const id of this.contentMeasureTimers) {
      clearTimeout(id);
    }
    this.contentMeasureTimers = [];
  }

  /**
   * Re-measure document / #pageShell after routed content, HTTP data, and images have had time to paint.
   * Uses double rAF (next frame after layout) plus several timeouts so slow pages still converge.
   */
  private queueWatermarkMeasureAfterContent(): void {
    this.clearContentMeasureTimers();

    const run = () => {
      this.ngZone.run(() => {
        this.cdr.markForCheck();
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });

    const delaysMs = [0, 120, 300, 600, 1200, 2200];
    for (const ms of delaysMs) {
      const id = window.setTimeout(run, ms);
      this.contentMeasureTimers.push(id);
    }
  }

  private attachShellResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.shellResizeObserver?.disconnect();
    const shell = this.pageShellRef?.nativeElement;
    if (!shell) {
      return;
    }
    this.shellResizeObserver = new ResizeObserver(() => this.queueWatermarkMeasureAfterContent());
    this.shellResizeObserver.observe(shell);
  }

  private isAiltManualRoute(url: string): boolean {
    const path = (url || '').split('?')[0].split('#')[0];
    return (
      path === '/ailt' ||
      path.startsWith('/ailt/') ||
      path === '/aicodingagent' ||
      path.startsWith('/aicodingagent/') ||
      path === '/cheradip' ||
      path.startsWith('/cheradip/') ||
      path === '/support' ||
      path.startsWith('/support/')
    );
  }

  /** Product sites provide their own branded navigation instead of stacking two fixed headers. */
  private shouldShowSiteHeader(url: string): boolean {
    const path = (url || '').split('?')[0].split('#')[0];
    const isCommerceRoute = path === '/ecommerce' || path.startsWith('/ecommerce/');
    return !this.isAiltManualRoute(url) && !isCommerceRoute;
  }

}
