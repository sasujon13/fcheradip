import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/** Stored on ``Customer.settings`` (JSON); synced across devices when Bearer is present. */
export const NTRCA_UNLOCKED_EIINS_SETTINGS_KEY = 'unlocked_ntrca_eiins_v2';


@Injectable({ providedIn: 'root' })
export class NtrcaUnlockedEiinsService {
  private trustedOwner = '';
  private trusted = new Set<string>();
  constructor(private http: HttpClient) {}

  private checkOwner(): void {
    const owner = this.hasBearerSession() ? (localStorage.getItem('username') || '') : '';
    if (this.trustedOwner !== owner) {
      this.trustedOwner = owner;
      this.trusted.clear();
    }
  }

  confirmServerUnlock(eiin: string): void {
    this.checkOwner();
    if (this.trustedOwner) this.trusted.add(this.normalizeEiinKey(eiin));
  }

  private trustServerList(raw: unknown): string[] {
    this.checkOwner();
    const values = Array.isArray(raw) ? raw.map(value => this.normalizeEiinKey(value)).filter(Boolean) : [];
    this.trusted = new Set(values);
    return [...this.trusted];
  }

  private hasBearerSession(): boolean {
    const t = (localStorage.getItem('authToken') || '').trim();
    return !!t && localStorage.getItem('isLoggedIn') === 'true';
  }

  /** Normalize API / JSON value to a list of non-empty EIIN strings. */
  normalizeList(raw: unknown): string[] {
    this.checkOwner();
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const x of raw) {
      const s = this.normalizeEiinKey(x);
      if (s && this.trusted.has(s)) out.push(s);
    }
    return out;
  }

  /** Single EIIN for Set lookup and banbeis URLs; must match row matching in ``hydrateUnlockedSubset``. */
  normalizeEiinKey(eiin: unknown): string {
    return String(eiin ?? '').trim();
  }

  readLegacyLocalList(): string[] {
    // Historical local lists were client-writable and cannot grant paid access.
    return [];
  }

  /** Load only server-confirmed EIIN unlocks; legacy browser lists do not grant access. */
  syncServerWithLocalMigration(): Observable<string[]> {
    if (!this.hasBearerSession()) return of([]);
    return this.http.get<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`)
      .pipe(
        map(res => this.trustServerList(res?.settings?.[NTRCA_UNLOCKED_EIINS_SETTINGS_KEY])),
        catchError(() => of([])),
      );
  }

  /** Persist full list (e.g. after new unlock). Caller passes complete merged array. */
  persistFullList(_eiins: string[]): Observable<void> {
    // The debit endpoint has already persisted the entitlement atomically.
    return of(undefined);
  }

  /** For each EIIN in ``unlocked`` that appears on ``vacancies``, fetch banbeis details (paid row data). */
  hydrateUnlockedSubset(unlocked: Iterable<unknown>, vacancies: any[], baseUrl2: string): void {
    if (!vacancies?.length || !baseUrl2) return;
    const keys = [...new Set(this.normalizeList(Array.from(unlocked)))];
    if (!keys.length) return;
    for (const eiin of keys) {
      const vacancy = vacancies.find((v) => this.normalizeEiinKey(v?.EIIN) === eiin);
      if (vacancy) {
        const url = `${baseUrl2}?eiin=${encodeURIComponent(eiin)}`;
        this.http.get<any>(url).subscribe({
          next: (res) => {
            vacancy.parameter = res;
          },
          error: (err) => {
            console.warn(`Hydrate EIIN ${eiin} failed`, err);
          },
        });
      }
    }
  }
}
