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
    this.primeBrowserAudioOnFirstUserGesture();
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

  /**
   * Chrome (and most desktop browsers) block `HTMLAudioElement.play()` without a prior user gesture.
   * Waking the Web Audio path once from the first pointer/key event helps later ceremony audio on localhost.
   */
  private primeBrowserAudioOnFirstUserGesture(): void {
    this.ngZone.runOutsideAngular(() => {
      const once = (): void => {
        window.removeEventListener('pointerdown', once);
        window.removeEventListener('keydown', once);
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) {
          return;
        }
        const ctx = new AC();
        void ctx.resume().finally(() => {
          try {
            ctx.close();
          } catch {
            /* noop */
          }
        });
      };
      window.addEventListener('pointerdown', once, { passive: true });
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

}
