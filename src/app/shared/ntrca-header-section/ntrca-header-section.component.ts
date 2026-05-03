import {
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

  /** When profile menu is visible (logged-in header), token input uses tighter horizontal offset — see component CSS. */
  @HostBinding('class.ntrca-user-logged-in')
  tokenBarLoggedInLayout = false;

  trxHelpPhase: 'off' | 'on' | 'closing' = 'off';
  private trxHelpTimers: number[] = [];
  private routerSub?: Subscription;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.syncTokenBarLoggedInLayout();
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.syncTokenBarLoggedInLayout());
  }

  ngOnDestroy(): void {
    this.clearTrxHelpTimers();
    this.routerSub?.unsubscribe();
  }

  @HostListener('window:cheradip-auth-changed')
  onCheradipAuthChanged(): void {
    this.syncTokenBarLoggedInLayout();
  }

  private syncTokenBarLoggedInLayout(): void {
    const headerEl = document.querySelector('header');
    this.tokenBarLoggedInLayout =
      localStorage.getItem('isLoggedIn') === 'true' &&
      !!headerEl?.classList.contains('logged-in');
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
