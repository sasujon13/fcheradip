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

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  title = 'Cheradip';

  @ViewChild('pageShell', { static: false }) pageShellRef?: ElementRef<HTMLElement>;

  /** True when the document is not taller than the viewport (no scroll). */
  watermarkCompact = false;
  /** Vertical gap between the two watermark lines in compact mode (px). */
  watermarkGapPx = 400;

  private readonly wmTopPx = 100;
  private readonly wmBottomReservePx = 48;
  /** Approximate bounding height per rotated line (164px font); avoids overlap when computing gap. */
  private readonly wmApproxLinePx = 230;
  private readonly wmGapMinPx = 48;
  private readonly wmGapMaxPx = 1400;

  private watermarkLayoutTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeListener = () => this.scheduleWatermarkLayout();
  private shellResizeObserver?: ResizeObserver;

  constructor(
    private countryService: CountryService,
    private router: Router,
    private welcomeCeremony: WelcomeBonusCeremonyService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        setTimeout(() => this.welcomeCeremony.tryPlayAfterNavigation(), 400);
        this.scheduleWatermarkLayout();
      });
    // Preferred UI language: from storage or infer from country (e.g. BD -> bn). Data from country table.
    this.countryService.country$.pipe(take(1)).subscribe(c => {
      this.countryService.initPreferredLangFromCountry(c?.country_code);
    });
  }

  ngAfterViewInit(): void {
    this.updateWatermarkLayout();
    this.cdr.markForCheck();
    this.scheduleWatermarkLayout();
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('resize', this.resizeListener);
      this.attachShellResizeObserver();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    this.shellResizeObserver?.disconnect();
    if (this.watermarkLayoutTimer !== null) {
      clearTimeout(this.watermarkLayoutTimer);
    }
  }

  private scheduleWatermarkLayout(): void {
    if (this.watermarkLayoutTimer !== null) {
      clearTimeout(this.watermarkLayoutTimer);
    }
    this.watermarkLayoutTimer = setTimeout(() => {
      this.watermarkLayoutTimer = null;
      this.ngZone.run(() => {
        this.updateWatermarkLayout();
        this.cdr.markForCheck();
      });
    }, 80);
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
    this.shellResizeObserver = new ResizeObserver(() => this.scheduleWatermarkLayout());
    this.shellResizeObserver.observe(shell);
  }

  /**
   * Compact watermarks only when there is no vertical window scrollbar: document height fits in the viewport.
   * Then: fixed overlay, first line 100px from the top of the window, gap (--wm-gap) minimized so both lines fit.
   * Otherwise: absolute layer on the page shell with the default 20% / +1400px layout (no extra page margin).
   */
  private updateWatermarkLayout(): void {
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const scrollH = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
    /** True iff the whole document fits in the viewport (no need to scroll the window). */
    const documentFitsViewport = scrollH <= vh + 1;

    if (!documentFitsViewport) {
      this.watermarkCompact = false;
      return;
    }

    this.watermarkCompact = true;
    let gap = vh - this.wmTopPx - this.wmBottomReservePx - 2 * this.wmApproxLinePx;
    gap = Math.round(Math.min(this.wmGapMaxPx, Math.max(this.wmGapMinPx, gap)));
    this.watermarkGapPx = gap;
  }
}
