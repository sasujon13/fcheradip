import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/** Persist active trx row id (which TrxID activation applies to) until another TrxID is applied. */
export const LS_ACTIVE_TRX_ROW_ID = 'cheradipActiveTrxRowId';

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
  /** Coin balance from ``cheradip_customers.settings.balance`` (synced from API only; not localStorage). */
  private coinBalance = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    private zone: NgZone
  ) {}

  /**
   * Same notion of "logged in" as the header: both token and flag must be set.
   * Avoids treating stale authToken alone as logged-in (would hit public /token/ and show "already used").
   */
  private hasAppSession(): boolean {
    const t = (localStorage.getItem('authToken') || '').trim();
    if (!t) return false;
    return localStorage.getItem('isLoggedIn') === 'true';
  }

  /** Run inside Angular zone so navigation always runs from injectables / HTTP callbacks. */
  private goToLogin(): void {
    const returnUrl = this.router.url || '/';
    this.zone.run(() => {
      void this.router.navigate(['/login'], { queryParams: { returnUrl } });
    });
  }

  /** Remember TrxID input (e.g. before redirect to login / 401) until activation succeeds. */
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

  /** If the field is empty but a value was stashed, return stash for binding (does not clear stash). */
  readPendingTrxidForInput(fieldCurrent: string): string {
    if ((fieldCurrent || '').trim()) {
      return fieldCurrent;
    }
    return this.getPendingTrxid() || '';
  }

  getActiveTrxRowId(): number | null {
    const v = localStorage.getItem(LS_ACTIVE_TRX_ROW_ID);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Remember which TrxManagement row is active for ``use_trx``; optionally sync coin balance from API.
   */
  setActiveTrxRowId(id: number, coinBalanceFromApi?: number): void {
    localStorage.setItem(LS_ACTIVE_TRX_ROW_ID, String(id));
    if (coinBalanceFromApi !== undefined) {
      this.setCoinBalance(coinBalanceFromApi);
    }
  }

  /** Current coin balance (from customer settings); updated by activate / use_trx / fetchCoinBalance. */
  getCachedRemaining(): number {
    return this.coinBalance;
  }

  /** @deprecated Use server-driven balance; kept for call sites that sync after unlock. */
  setCachedRemaining(n: number): void {
    this.setCoinBalance(n);
  }

  private setCoinBalance(n: number): void {
    const v = Number(n);
    this.coinBalance = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  /** GET /customer_settings/ → ``settings.balance`` (requires Bearer). */
  fetchCoinBalance(): Observable<number> {
    if (!this.hasAppSession()) {
      this.setCoinBalance(0);
      return of(0);
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

  /** POST activate: credits customer.settings.balance by received_amount*100; requires Bearer auth. */
  activateAppliedTrx(row: { id: number }): Observable<number> {
    return this.http
      .post<{ success?: boolean; token?: number; remaining?: number }>(
        `${environment.apiUrl}/token/${row.id}/update_status/`,
        { Status: 1 }
      )
      .pipe(
        map((r) => {
          const rem = Number(r.remaining ?? r.token ?? 0);
          this.setActiveTrxRowId(row.id, rem);
          return rem;
        }),
        catchError((err) => {
          if (err?.status === 401) {
            this.goToLogin();
          }
          return throwError(() => err);
        })
      );
  }

  /** POST use_trx: debits ``NTRCA_UNLOCK_DEBIT`` coins from customer.settings.balance (Bearer required). */
  useOneUnlock(): Observable<{ success: boolean; remaining: number }> {
    const id = this.getActiveTrxRowId();
    if (id == null) {
      return of({ success: false, remaining: this.getCachedRemaining() });
    }
    return this.http
      .post<{ success: boolean; remaining: number }>(`${environment.apiUrl}/token/use_trx/`, { id })
      .pipe(
        tap((r) => {
          if (r && typeof r.remaining === 'number' && Number.isFinite(r.remaining)) {
            this.setCoinBalance(r.remaining);
          }
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
   * Validate TrxID then activate (logged-in users only). If not logged in, stashes input and navigates to /login.
   * Clears stash only after successful activation (same moment as success alert).
   */
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
