import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/** Stored on ``Customer.settings`` (JSON); synced across devices when Bearer is present. */
export const NTRCA_UNLOCKED_EIINS_SETTINGS_KEY = 'unlocked_ntrca_eiins';

const LEGACY_LS_KEY = 'unlockedEIINs';

@Injectable({ providedIn: 'root' })
export class NtrcaUnlockedEiinsService {
  constructor(private http: HttpClient) {}

  private hasBearerSession(): boolean {
    const t = (localStorage.getItem('authToken') || '').trim();
    return !!t && localStorage.getItem('isLoggedIn') === 'true';
  }

  /** Normalize API / JSON value to a list of non-empty EIIN strings. */
  normalizeList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const x of raw) {
      const s = this.normalizeEiinKey(x);
      if (s) out.push(s);
    }
    return out;
  }

  /** Single EIIN for Set lookup and banbeis URLs; must match row matching in ``hydrateUnlockedSubset``. */
  normalizeEiinKey(eiin: unknown): string {
    return String(eiin ?? '').trim();
  }

  readLegacyLocalList(): string[] {
    try {
      const s = localStorage.getItem(LEGACY_LS_KEY);
      if (!s) return [];
      const arr = JSON.parse(s) as unknown;
      return this.normalizeList(arr);
    } catch {
      return [];
    }
  }

  /**
   * Load unlocked EIINs from server; merge with legacy localStorage list and persist merged
   * to server + localStorage once (migration). When not logged in, returns legacy local only.
   */
  syncServerWithLocalMigration(): Observable<string[]> {
    const local = this.readLegacyLocalList();
    if (!this.hasBearerSession()) {
      return of([...new Set(local)]);
    }
    return this.http
      .get<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`)
      .pipe(
        map((res) => {
          const server = this.normalizeList(res?.settings?.[NTRCA_UNLOCKED_EIINS_SETTINGS_KEY]);
          const merged = [...new Set([...server, ...local])];
          return { server, merged };
        }),
        switchMap(({ server, merged }) => {
          const needPush =
            merged.length !== server.length || local.some((e) => !server.includes(e));
          if (!needPush) {
            try {
              localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(merged));
            } catch {
              /* ignore */
            }
            return of(merged);
          }
          return this.http
            .post<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`, {
              settings: { [NTRCA_UNLOCKED_EIINS_SETTINGS_KEY]: merged },
            })
            .pipe(
              map((postRes) => {
                const saved = this.normalizeList(postRes?.settings?.[NTRCA_UNLOCKED_EIINS_SETTINGS_KEY]);
                const finalList = saved.length ? saved : merged;
                try {
                  localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(finalList));
                } catch {
                  /* ignore */
                }
                return finalList;
              }),
              catchError(() => {
                try {
                  localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(merged));
                } catch {
                  /* ignore */
                }
                return of(merged);
              })
            );
        }),
        catchError(() => of([...new Set(local)]))
      );
  }

  /** Persist full list (e.g. after new unlock). Caller passes complete merged array. */
  persistFullList(eiins: string[]): Observable<void> {
    const unique = [...new Set(this.normalizeList(eiins))];
    try {
      localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(unique));
    } catch {
      /* ignore */
    }
    if (!this.hasBearerSession()) {
      return of(undefined);
    }
    return this.http
      .post(`${environment.apiUrl}/customer_settings/`, {
        settings: { [NTRCA_UNLOCKED_EIINS_SETTINGS_KEY]: unique },
      })
      .pipe(
        map(() => undefined),
        catchError(() => of(undefined))
      );
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
