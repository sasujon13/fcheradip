import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { TrxHelpVisibility } from '../trx-help-visibility';

/**
 * Shared header section for NTRCA pages: token box + main message + notice links (৮ম, ৭ম, ৬ষ্ঠ, ৫ম).
 * Used by: ntrca, vacant5/6/7/8, merit5/6/7/8, recommend5/6/7/8.
 */
@Component({
    selector: 'app-ntrca-header-section',
    templateUrl: './ntrca-header-section.component.html',
    styleUrls: ['./ntrca-header-section.component.css'],
    standalone: false
})
export class NtrcaHeaderSectionComponent implements OnInit, OnDestroy {
  @Input() newToken = '';
  @Output() newTokenChange = new EventEmitter<string>();
  @Input() remainingUnlocks = 0;
  @Output() applyTokenClick = new EventEmitter<void>();

  /** Matches header `loginStatus`: shifts token input when logged in (same-tab logout has no route change). */
  tokenInputLoggedIn = false;
  @HostBinding('class.auth-logged-in')
  get authLoggedInHostClass(): boolean {
    return this.tokenInputLoggedIn;
  }
  private authRouteSub?: Subscription;
  private authPollId?: ReturnType<typeof setInterval>;
  private readonly onAuthStorageBound = (): void => this.syncTokenInputLoggedIn();

  readonly trxHelp = new TrxHelpVisibility(() => this.cdr.markForCheck());
  get trxHelpPhase() { return this.trxHelp.phase; }

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
    window.addEventListener('storage', this.onAuthStorageBound);
    this.authPollId = window.setInterval(() => this.syncTokenInputLoggedIn(), 400);
  }

  private syncTokenInputLoggedIn(): void {
    const token = (localStorage.getItem('authToken') || '').trim();
    const next = localStorage.getItem('isLoggedIn') === 'true' && !!token;
    if (next !== this.tokenInputLoggedIn) {
      this.tokenInputLoggedIn = next;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.onAuthStorageBound);
    if (this.authRouteSub) {
      this.authRouteSub.unsubscribe();
      this.authRouteSub = undefined;
    }
    if (this.authPollId != null) {
      clearInterval(this.authPollId);
      this.authPollId = undefined;
    }
    this.trxHelp.destroy();
  }

  onTrxHelpPointerEnter(): void {
    this.trxHelp.show();
  }

  onTrxHelpPointerLeave(): void {
    this.trxHelp.leaveTrigger();
  }

  @HostListener('document:click')
  onTrxHelpInteraction(): void {
    this.trxHelp.interact();
  }

  @HostListener('window:cheradip-toggle-trx-help')
  toggleTrxHelpFromPage(): void {
    this.trxHelp.toggle();
  }
}
