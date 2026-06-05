import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Subscription, fromEvent, interval, merge } from 'rxjs';
import { catchError, filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Shown on /login after another device replaces this session. */
export const SESSION_LOGOUT_REASON_KEY = 'cheradipSessionLogoutReason';

/** Poll interval while logged in (ms). */
const SESSION_PROBE_MS = 20_000;

@Injectable({ providedIn: 'root' })
export class AuthSessionService implements OnDestroy {
  private invalidating = false;
  private monitorSub?: Subscription;

  constructor(
    private http: HttpClient,
    private zone: NgZone
  ) {}

  hasStoredSession(): boolean {
    const token = (localStorage.getItem('authToken') || '').trim();
    return localStorage.getItem('isLoggedIn') === 'true' && !!token;
  }

  clearStoredSession(): void {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginStatus');
    localStorage.removeItem('authToken');
  }

  /** Clear client auth and send user to login (e.g. token revoked by login on another device). */
  invalidateSession(reason: 'multi_device' | 'unauthorized' = 'unauthorized'): void {
    if (this.invalidating || !this.hasStoredSession()) {
      return;
    }
    this.invalidating = true;
    this.stopSessionMonitor();
    this.clearStoredSession();
    if (reason === 'multi_device') {
      try {
        sessionStorage.setItem(SESSION_LOGOUT_REASON_KEY, 'multi_device');
      } catch {
        /* ignore */
      }
    }
    this.zone.runOutsideAngular(() => {
      window.location.assign('/login');
    });
  }

  /** Lightweight Bearer check against customer_settings (server keeps one token per user). */
  probeSession(): void {
    if (!this.hasStoredSession() || this.invalidating) {
      return;
    }
    this.http
      .get(`${environment.apiUrl}/customer_settings/`)
      .pipe(
        catchError((err: { status?: number }) => {
          if (err?.status === 401) {
            this.invalidateSession('multi_device');
          }
          return EMPTY;
        })
      )
      .subscribe();
  }

  startSessionMonitor(): void {
    this.stopSessionMonitor();
    if (!this.hasStoredSession()) {
      return;
    }
    const tick = merge(
      interval(SESSION_PROBE_MS),
      fromEvent(document, 'visibilitychange').pipe(
        filter(() => document.visibilityState === 'visible')
      ),
      fromEvent(window, 'focus')
    );
    this.monitorSub = tick.subscribe(() => this.probeSession());
    this.probeSession();
  }

  stopSessionMonitor(): void {
    this.monitorSub?.unsubscribe();
    this.monitorSub = undefined;
  }

  ngOnDestroy(): void {
    this.stopSessionMonitor();
  }
}
