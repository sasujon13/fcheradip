import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';
import { environment } from 'src/environments/environment';

/** Persist active trx row id + cached remaining balance (updated from API only). */
export const LS_ACTIVE_TRX_ROW_ID = 'cheradipActiveTrxRowId';
export const LS_TRX_TOKEN_REMAINING = 'cheradipTrxTokenRemaining';

/** Server deducts this many token units per NTRCA unlock (must match backend use_trx). */
export const NTRCA_UNLOCK_DEBIT = 20;

@Injectable({ providedIn: 'root' })
export class TrxUnlockService {
  constructor(private http: HttpClient) {}

  getActiveTrxRowId(): number | null {
    const v = localStorage.getItem(LS_ACTIVE_TRX_ROW_ID);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Pin unlock debits to this cheradip_trxmanagement row until user applies another TrxID. */
  setActiveTrxRowId(id: number, remaining?: number): void {
    localStorage.setItem(LS_ACTIVE_TRX_ROW_ID, String(id));
    if (remaining !== undefined) {
      localStorage.setItem(LS_TRX_TOKEN_REMAINING, String(Math.max(0, remaining)));
    }
  }

  getCachedRemaining(): number {
    const v = localStorage.getItem(LS_TRX_TOKEN_REMAINING);
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  setCachedRemaining(n: number): void {
    localStorage.setItem(LS_TRX_TOKEN_REMAINING, String(Math.max(0, n)));
  }

  /** POST activate: credits token += received_amount*100, status=1; returns new balance. */
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
        })
      );
  }

  /** POST use_trx: debits NTRCA_UNLOCK_DEBIT units per unlock on the active row. */
  useOneUnlock(): Observable<{ success: boolean; remaining: number }> {
    const id = this.getActiveTrxRowId();
    if (id == null) {
      return of({ success: false, remaining: 0 });
    }
    return this.http.post<{ success: boolean; remaining: number }>(
      `${environment.apiUrl}/token/use_trx/`,
      { id }
    );
  }
}
