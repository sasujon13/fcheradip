import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/** Stored on ``Customer.settings`` (JSON); synced across devices when Bearer is present. */
export const UNLOCKED_QUESTION_QIDS_SETTINGS_KEY = 'unlocked_question_qids';

const LEGACY_SESSION_PREFIX = 'cheradip_unlocked_qids_';

@Injectable({ providedIn: 'root' })
export class QuestionUnlockedQidsService {
  constructor(private http: HttpClient) {}

  private hasBearerSession(): boolean {
    const t = (localStorage.getItem('authToken') || '').trim();
    return !!t && localStorage.getItem('isLoggedIn') === 'true';
  }

  normalizeList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of raw) {
      const s = String(x ?? '').trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }

  /** Legacy per-subject sessionStorage entries (pre-server sync). */
  readLegacySessionQids(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith(LEGACY_SESSION_PREFIX)) continue;
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as unknown;
        out.push(...this.normalizeList(parsed));
      }
    } catch {
      /* ignore */
    }
    return [...new Set(out)];
  }

  private writeLegacySessionMirror(qids: string[]): void {
    try {
      const list = this.normalizeList(qids);
      sessionStorage.setItem(`${LEGACY_SESSION_PREFIX}_all`, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  /**
   * Load unlocked qids from server; merge with legacy sessionStorage once and persist merged list.
   * When not logged in, returns legacy session list only.
   */
  syncFromServer(): Observable<string[]> {
    const local = this.readLegacySessionQids();
    if (!this.hasBearerSession()) {
      return of([...new Set(local)]);
    }
    return this.http
      .get<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`)
      .pipe(
        map((res) => {
          const server = this.normalizeList(res?.settings?.[UNLOCKED_QUESTION_QIDS_SETTINGS_KEY]);
          const merged = [...new Set([...server, ...local])];
          return { server, merged };
        }),
        switchMap(({ server, merged }) => {
          const needPush =
            merged.length !== server.length || local.some((q) => !server.includes(q));
          if (!needPush) {
            this.writeLegacySessionMirror(merged);
            return of(merged);
          }
          return this.http
            .post<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`, {
              settings: { [UNLOCKED_QUESTION_QIDS_SETTINGS_KEY]: merged },
            })
            .pipe(
              map((postRes) => {
                const saved = this.normalizeList(
                  postRes?.settings?.[UNLOCKED_QUESTION_QIDS_SETTINGS_KEY]
                );
                const finalList = saved.length ? saved : merged;
                this.writeLegacySessionMirror(finalList);
                return finalList;
              }),
              catchError(() => {
                this.writeLegacySessionMirror(merged);
                return of(merged);
              })
            );
        }),
        catchError(() => of([...new Set(local)]))
      );
  }

  /** Persist full list after new unlock(s). */
  persistFullList(qids: string[]): Observable<string[]> {
    const unique = this.normalizeList(qids);
    this.writeLegacySessionMirror(unique);
    if (!this.hasBearerSession()) {
      return of(unique);
    }
    return this.http
      .post<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`, {
        settings: { [UNLOCKED_QUESTION_QIDS_SETTINGS_KEY]: unique },
      })
      .pipe(
        map((res) => {
          const saved = this.normalizeList(res?.settings?.[UNLOCKED_QUESTION_QIDS_SETTINGS_KEY]);
          const finalList = saved.length ? saved : unique;
          this.writeLegacySessionMirror(finalList);
          return finalList;
        }),
        catchError(() => of(unique))
      );
  }
}
