import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TrxUnlockService } from './trx-unlock.service';

/** Keep aligned with backend ``TokenViewSet.QUESTION_UNLOCK_DEBIT_*``. */
export const QUESTION_UNLOCK_DEBIT_MCQ = 10;
export const QUESTION_UNLOCK_DEBIT_CQ = 50;

export interface QuestionUnlockItem {
  qid: string;
  is_cq: boolean;
}

export interface QuestionUnlockResult {
  success: boolean;
  /** When false, UI must not overwrite cached coin balance from ``remaining``. */
  updateBalance: boolean;
  remaining: number;
  debited?: number;
  detail?: string;
  /** Full list from server after unlock (cross-device). */
  unlockedQids?: string[];
}

function parseApiRemaining(body: unknown): number | null {
  if (!body || typeof body !== 'object' || !('remaining' in body)) return null;
  const n = Number((body as { remaining?: unknown }).remaining);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function errorDetail(err: { status?: number; error?: unknown }): string {
  const body = err?.error;
  if (body && typeof body === 'object' && body !== null) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === 'string' && d.trim()) return d.trim();
  }
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (err?.status === 401) return 'Login required';
  if (err?.status === 403) return 'Request blocked (CSRF). Restart the API server after updating CSRF_TRUSTED_ORIGINS.';
  return 'Unlock failed';
}

@Injectable({ providedIn: 'root' })
export class QuestionUnlockService {
  constructor(
    private http: HttpClient,
    private trxUnlock: TrxUnlockService
  ) {}

  unlockQuestions(items: QuestionUnlockItem[]): Observable<QuestionUnlockResult> {
    const cached = this.trxUnlock.getCachedRemaining();
    if (!items.length) {
      return of({ success: true, updateBalance: false, remaining: cached, debited: 0 });
    }
    return this.http
      .post<{
        success?: boolean;
        remaining?: number;
        debited?: number;
        detail?: string;
        unlocked_qids?: unknown;
      }>(`${environment.apiUrl}/token/unlock_questions/`, { items })
      .pipe(
        map((r) => {
          const success = Boolean(r?.success);
          const rem = parseApiRemaining(r);
          const unlockedQids = Array.isArray(r?.unlocked_qids)
            ? r!.unlocked_qids!.map((x) => String(x).trim()).filter(Boolean)
            : undefined;
          return {
            success,
            updateBalance: success,
            remaining: success && rem != null ? rem : cached,
            debited: typeof r?.debited === 'number' ? r.debited : undefined,
            detail: r?.detail,
            unlockedQids,
          };
        }),
        catchError((err: { status?: number; error?: unknown }) => {
          const rem = parseApiRemaining(err?.error);
          const insufficient =
            err?.status === 400 &&
            typeof (err?.error as { detail?: string } | undefined)?.detail === 'string' &&
            ((err.error as { detail: string }).detail.includes('Insufficient') ||
              (err.error as { detail: string }).detail.includes('insufficient'));
          return of({
            success: false,
            updateBalance: insufficient && rem != null,
            remaining: insufficient && rem != null ? rem : cached,
            detail: errorDetail(err),
          });
        })
      );
  }
}
