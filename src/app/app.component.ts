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

  /** Exposed for template: anchor height after first line for `top` calc on the fb line (matches gap math). */
  readonly wmLineHeightPx = 230;

  private readonly wmTopPx = 100;
  private readonly wmBottomReservePx = 48;
  /** Approximate bounding height per rotated line (164px font); must match wmLineHeightPx. */
  private readonly wmApproxLinePx = 230;
  private readonly wmGapMinPx = 48;
  private readonly wmGapMaxPx = 1400;

  private watermarkLayoutTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeListener = () => this.scheduleWatermarkLayout();
  private shellResizeObserver?: ResizeObserver;
  /** Deferred passes after route/content paint so scrollHeight / shell bottom reflect loaded UI. */
  private contentMeasureTimers: number[] = [];

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
        this.queueWatermarkMeasureAfterContent();
      });
    // Preferred UI language: from storage or infer from country (e.g. BD -> bn). Data from country table.
    this.countryService.country$.pipe(take(1)).subscribe(c => {
      this.countryService.initPreferredLangFromCountry(c?.country_code);
    });
  }

  ngAfterViewInit(): void {
    this.queueWatermarkMeasureAfterContent();
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
    this.clearContentMeasureTimers();
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
        this.updateWatermarkLayout();
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
    this.shellResizeObserver = new ResizeObserver(() => this.scheduleWatermarkLayout());
    this.shellResizeObserver.observe(shell);
  }

  /**
   * Compact only when the window does not need a vertical scrollbar AND the main shell’s bottom edge
   * sits in the viewport (avoids false positives where document height is wrong but content is tall).
   * Then: fixed overlay (no layout impact), first line 100px from viewport top, --wm-gap shrinks the space
   * between the two lines so both fit. Otherwise: absolute layer + global 20% / +1400px.
   */
  private updateWatermarkLayout(): void {
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const docScrollH = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
    const noWindowScroll = docScrollH <= vh + 1;

    const shell = this.pageShellRef?.nativeElement;
    const shellBottom = shell?.getBoundingClientRect().bottom ?? 0;
    const shellFitsViewport = shell ? shellBottom <= vh + 3 : false;

    if (!noWindowScroll || !shellFitsViewport) {
      this.watermarkCompact = false;
      return;
    }

    this.watermarkCompact = true;
    let gap = vh - this.wmTopPx - this.wmBottomReservePx - 2 * this.wmApproxLinePx;
    gap = Math.round(Math.min(this.wmGapMaxPx, Math.max(this.wmGapMinPx, gap)));
    this.watermarkGapPx = gap;
  }
}
