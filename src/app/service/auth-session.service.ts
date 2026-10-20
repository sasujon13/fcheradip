import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Subscription, fromEvent, interval, merge, firstValueFrom } from 'rxjs';
import { catchError, filter, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { COIN_BALANCE_CACHE_KEY } from './trx-unlock.service';
import { accountSessionKey } from './account-session-state';

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

  clearStoredSession(revoke = true): void {
    if (revoke && /^(?:[a-z]+\.)?cheradip\.com$/.test(location.hostname)) {
      const token = localStorage.getItem('authToken');
      void fetch(`${environment.apiUrl}/session/`, { method: 'POST', credentials: 'include', keepalive: true,
        headers: token ? {Authorization: `Bearer ${token}`} : {} }).catch(() => undefined);
    }
    [
      'isLoggedIn',
      'loginStatus',
      'authToken',
      'packageStatus',
      'username',
      'fullName',
      'acctype',
      'formData',
      'authFormData',
      COIN_BALANCE_CACHE_KEY,
      'cheradipEcommerceCart',
      'cheradipEcommerceCartOwner',
    ].forEach((key) => localStorage.removeItem(key));
    window.dispatchEvent(new CustomEvent('cheradip-session-changed', {
      detail: { loggedIn: false },
    }));
  }

  async restoreSharedSession(): Promise<void> {
    if (!/^(?:[a-z]+\.)?cheradip\.com$/.test(location.hostname)) return;
    const startingToken = localStorage.getItem('authToken');
    try {
      const session = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/session/?cookie_only=1`, { withCredentials: true }).pipe(timeout(4000)));
      if (localStorage.getItem('authToken') !== startingToken) return; // a manual login completed meanwhile
      if (!session?.loggedIn || !session.authToken) {
        if (session?.sharedSessionPresent) this.clearStoredSession(false);
        return;
      }
      if (session.authToken === startingToken && this.hasStoredSession()) return;
      this.clearStoredSession(false);
      for (const key of ['authToken', 'username', 'fullName', 'acctype']) localStorage.setItem(key, session[key] || '');
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loginStatus', 'true');
      window.dispatchEvent(new CustomEvent('cheradip-session-changed', { detail: { loggedIn: true } }));
    } catch { /* An unavailable API must not prevent public pages from opening. */ }
  }

  /** Clear client auth and send user to login (e.g. token revoked by login on another device). */
  invalidateSession(reason: 'multi_device' | 'unauthorized' = 'unauthorized'): void {
    if (this.invalidating) {
      return;
    }
    this.invalidating = true;
    this.stopSessionMonitor();
    this.clearStoredSession(false);
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
  async probeSession(): Promise<void> {
    await this.restoreSharedSession();
    if (!this.hasStoredSession() || this.invalidating) {
      return;
    }
    const session = accountSessionKey();
    this.http
      .get(`${environment.apiUrl}/customer_settings/`)
      .pipe(
        catchError((err: { status?: number }) => {
          if (err?.status === 401 && session === accountSessionKey()) {
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
