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
    if (!this.hasBearerSession()) return of([]);
    return this.http.get<{ settings?: Record<string, unknown> }>(`${environment.apiUrl}/customer_settings/`)
      .pipe(map(res => this.normalizeList(res?.settings?.['unlocked_question_keys'])));
  }

  /** Only the priced unlock API can grant an entitlement. */
  persistFullList(_qids: string[]): Observable<string[]> {
    return this.syncFromServer();
  }
}
