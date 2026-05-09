import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { SESSION_LOGIN_USE_STORED_RETURN } from './login-redirect.session';

/** Remove once per session if present (old unlock stored Trx row id here). */
const LEGACY_ACTIVE_TRX_LS = 'cheradipActiveTrxRowId';

/** Session-only: TrxID typed before login / 401 so it can refill the input after return. */
export const SESSION_PENDING_TRXID_KEY = 'cheradipPendingTrxidInput';

/** Server deducts this many coins per NTRCA unlock (must match backend ``UNLOCK_DEBIT``). */
export const NTRCA_UNLOCK_DEBIT = 20;

export type TrxApplyErrorCode =
  | 'login_required'
  | 'invalid_format'
  | 'trx_invalid'
  | 'network'
  | 'activate_failed';

@Injectable({ providedIn: 'root' })
export class TrxUnlockService {
  /** Last known ``customer.settings.balance`` from API (display + after unlock). */
  private coinBalance = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    private zone: NgZone
  ) {}

  private hasAppSession(): boolean {
    const t = (localStorage.getItem('authToken') || '').trim();
    if (!t) return false;
    return localStorage.getItem('isLoggedIn') === 'true';
  }

  private goToLogin(): void {
    const returnUrl = this.router.url || '/';
    this.zone.run(() => {
      sessionStorage.setItem(SESSION_LOGIN_USE_STORED_RETURN, '1');
      void this.router.navigate(['/login'], { queryParams: { returnUrl } });
    });
  }

  stashPendingTrxidIfAny(raw: string): void {
    const v = (raw || '').trim().slice(0, 10);
    if (v) {
      sessionStorage.setItem(SESSION_PENDING_TRXID_KEY, v);
    }
  }

  getPendingTrxid(): string | null {
    const v = (sessionStorage.getItem(SESSION_PENDING_TRXID_KEY) || '').trim();
    return v ? v.slice(0, 10) : null;
  }

  clearPendingTrxid(): void {
    sessionStorage.removeItem(SESSION_PENDING_TRXID_KEY);
  }

  readPendingTrxidForInput(fieldCurrent: string): string {
    if ((fieldCurrent || '').trim()) {
      return fieldCurrent;
    }
    return this.getPendingTrxid() || '';
  }

  getCachedRemaining(): number {
    return this.coinBalance;
  }

  setCachedRemaining(n: number): void {
    this.setCoinBalance(n);
  }

  private setCoinBalance(n: number): void {
    const v = Number(n);
    this.coinBalance = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  /** GET /customer_settings/ → ``settings.balance`` (Bearer). Single source of truth for coins. */
  fetchCoinBalance(): Observable<number> {
    if (!this.hasAppSession()) {
      this.setCoinBalance(0);
      return of(0);
    }
    try {
      localStorage.removeItem(LEGACY_ACTIVE_TRX_LS);
    } catch {
      /* ignore */
    }
    return this.http.get<{ settings?: { balance?: number } }>(`${environment.apiUrl}/customer_settings/`).pipe(
      map((res) => {
        const b = Number(res?.settings?.balance ?? 0);
        const n = Number.isFinite(b) && b >= 0 ? b : 0;
        this.setCoinBalance(n);
        return n;
      }),
      catchError(() => {
        this.setCoinBalance(0);
        return of(0);
      })
    );
  }

  /**
   * Activate TrxID: credits Trx row and (Bearer) adds to ``customer.settings.balance``.
   * Updates in-memory balance from response ``remaining`` only.
   */
  activateAppliedTrx(row: { id: number }): Observable<number> {
    return this.http
      .post<{ success?: boolean; token?: number; remaining?: number }>(
        `${environment.apiUrl}/token/${row.id}/update_status/`,
        { Status: 1 }
      )
      .pipe(
        map((r) => {
          const rem = Number(r.remaining ?? r.token ?? 0);
          this.setCoinBalance(Number.isFinite(rem) && rem >= 0 ? rem : 0);
          return this.coinBalance;
        }),
        catchError((err) => {
          if (err?.status === 401) {
            this.goToLogin();
          }
          return throwError(() => err);
        })
      );
  }

  /**
   * NTRCA paid unlock: server debits **only** ``customer.settings.balance`` (Bearer).
   * Request body is empty — no Trx row id, no localStorage.
   */
  useOneUnlock(): Observable<{ success: boolean; remaining: number }> {
    if (!this.hasAppSession()) {
      return of({ success: false, remaining: 0 });
    }
    return this.http
      .post<{ success: boolean; remaining: number }>(`${environment.apiUrl}/token/use_trx/`, {})
      .pipe(
        map((r) => ({
          success: Boolean(r?.success),
          remaining:
            typeof r?.remaining === 'number' && Number.isFinite(r.remaining)
              ? Math.max(0, r.remaining)
              : this.getCachedRemaining(),
        })),
        map((r) => {
          if (r.success) {
            this.setCoinBalance(r.remaining);
          }
          return r;
        }),
        catchError((err: { status?: number; error?: { remaining?: number } }) => {
          if (err?.status === 401) {
            this.goToLogin();
          }
          const rem = Number(err?.error?.remaining);
          if (Number.isFinite(rem) && rem >= 0) {
            this.setCoinBalance(rem);
          }
          return of({
            success: false,
            remaining: Number.isFinite(rem) && rem >= 0 ? rem : this.getCachedRemaining(),
          });
        })
      );
  }

  validateTrxidAndActivate(rawToken: string): Observable<number> {
    if (!this.hasAppSession()) {
      this.stashPendingTrxidIfAny(rawToken);
      this.goToLogin();
      return throwError(() => ({ code: 'login_required' as TrxApplyErrorCode }));
    }
    let trimmed = (rawToken || '').trim();
    if (!trimmed) {
      const p = this.getPendingTrxid();
      if (p) trimmed = p;
    }
    if (!trimmed || trimmed.length < 8 || trimmed.length > 10) {
      return throwError(() => ({ code: 'invalid_format' as TrxApplyErrorCode }));
    }
    const triedTrimmed = trimmed;
    return this.http
      .get<{ results?: Array<{ id?: number; Counter?: number; Status?: number }> }>(
        `${environment.apiUrl}/token/?token=${encodeURIComponent(trimmed)}`
      )
      .pipe(
        switchMap((res) => {
          const result = res?.results?.[0];
          if (!(result && result.Counter != null && Number(result.Status) === 0)) {
            return throwError(() => ({ code: 'trx_invalid' as TrxApplyErrorCode }));
          }
          return this.activateAppliedTrx({ id: result.id as number });
        }),
        switchMap((rem) =>
          this.fetchCoinBalance().pipe(
            map(() => rem),
            catchError(() => of(rem))
          )
        ),
        tap(() => this.clearPendingTrxid()),
        catchError((err: { code?: TrxApplyErrorCode; status?: number; name?: string }) => {
          if (
            err?.code === 'login_required' ||
            err?.code === 'invalid_format' ||
            err?.code === 'trx_invalid'
          ) {
            return throwError(() => err);
          }
          if (err?.status === 401) {
            this.stashPendingTrxidIfAny(triedTrimmed);
            this.goToLogin();
            return throwError(() => ({ code: 'login_required' as TrxApplyErrorCode }));
          }
          if (err?.status != null) {
            return throwError(() => ({ code: 'activate_failed' as TrxApplyErrorCode }));
          }
          return throwError(() => ({ code: 'network' as TrxApplyErrorCode }));
        })
      );
  }
}
