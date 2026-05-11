import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * Shared header section for NTRCA pages: token box + main message + notice links (৮ম, ৭ম, ৬ষ্ঠ, ৫ম).
 * Used by: ntrca, vacant5/6/7/8, merit5/6/7/8, recommend5/6/7/8.
 */
@Component({
  selector: 'app-ntrca-header-section',
  templateUrl: './ntrca-header-section.component.html',
  styleUrls: ['./ntrca-header-section.component.css']
})
export class NtrcaHeaderSectionComponent implements OnInit, OnDestroy {
  @Input() newToken = '';
  @Output() newTokenChange = new EventEmitter<string>();
  @Input() remainingUnlocks = 0;
  @Output() applyTokenClick = new EventEmitter<void>();

  /** Matches header `loginStatus`: shifts token input when logged in (same-tab logout has no route change). */
  tokenInputLoggedIn = false;
  private authRouteSub?: Subscription;
  private authPollId?: ReturnType<typeof setInterval>;

  trxHelpPhase: 'off' | 'on' | 'closing' = 'off';
  private trxHelpTimers: number[] = [];

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.syncTokenInputLoggedIn();
    this.authRouteSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.syncTokenInputLoggedIn();
        this.cdr.markForCheck();
      });
  }

  private syncTokenInputLoggedIn(): void {
    const next = localStorage.getItem('isLoggedIn') === 'true';
    if (next !== this.tokenInputLoggedIn) {
      this.tokenInputLoggedIn = next;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this.authRouteSub) {
      this.authRouteSub.unsubscribe();
      this.authRouteSub = undefined;
    }
    if (this.authPollId != null) {
      clearInterval(this.authPollId);
      this.authPollId = undefined;
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
}
