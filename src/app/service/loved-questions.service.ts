import { Injectable, OnDestroy, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { BehaviorSubject, Subscription } from 'rxjs';
import { accountSessionKey } from './account-session-state';

/**
 * Lightweight shared "Liked / Loved Questions" store (localStorage-backed).
 * Used by the question page (love icons), the exam results page and the
 * Liked Questions page so a question loved anywhere is available everywhere.
 */
const LOVED_KEY = 'cheradip_loved_qids';
const LOVED_META_KEY = 'cheradip_loved_qids_meta';

@Injectable({ providedIn: 'root' })
export class LovedQuestionsService implements OnDestroy {
  private set = new Set<string>();
  private meta: Record<string, any> = {};
  private readonly countSubject = new BehaviorSubject(0);
  private readonly changesSubject = new BehaviorSubject(0);
  readonly count$ = this.countSubject.asObservable();
  readonly changes$ = this.changesSubject.asObservable();
  get count(): number { this.ensureOwner(); return this.set.size; }
  private owner = this.currentOwner();
  private syncSubscription?: Subscription;
  private serverReady = false;
  private syncPending = false;
  private readonly pendingMutations = new Map<string, boolean>();
  private readonly sessionChanged = (): void => {
    this.syncSubscription?.unsubscribe();
    if (this.owner !== this.currentOwner()) this.pendingMutations.clear();
    this.owner = this.currentOwner();
    this.serverReady = false;
    this.syncPending = false;
    this.claimLegacyOnce(); this.load(); this.syncFromServer();
  };
  private currentOwner(): string { return accountSessionKey() ? (localStorage.getItem('username') || 'guest') : 'guest'; }
  private storageKey(base: string): string { return this.owner === 'guest' ? base : `${base}:${this.owner}`; }
  private ensureOwner(): void { if (this.owner !== this.currentOwner()) this.sessionChanged(); }
  private readonly storageChanged = (event: StorageEvent): void => {
    if (event.key === 'username' || event.key === 'isLoggedIn' || event.key === 'authToken') { this.sessionChanged(); return; }
    if (event.key === this.storageKey(LOVED_KEY) || event.key === this.storageKey(LOVED_META_KEY) || event.key === null) this.load();
  };

  constructor(@Optional() private http: HttpClient | null = null) {
    this.claimLegacyOnce();
    this.load();
    this.syncFromServer();
    window.addEventListener('storage', this.storageChanged);
    window.addEventListener('cheradip-session-changed', this.sessionChanged);
  }

  private claimLegacyOnce(): void {
    if (this.owner === 'guest' || localStorage.getItem('cheradip-liked-legacy-owner')) return;
    for (const base of [LOVED_KEY, LOVED_META_KEY]) {
      const legacy = localStorage.getItem(base);
      if (legacy && !localStorage.getItem(this.storageKey(base))) localStorage.setItem(this.storageKey(base), legacy);
      localStorage.removeItem(base);
    }
    localStorage.setItem('cheradip-liked-legacy-owner', this.owner);
  }

  private syncFromServer(): void {
    if (this.owner === 'guest' || !this.http) return;
    const session = accountSessionKey();
    this.syncPending = true;
    this.syncSubscription = this.http.get<any>(`${environment.apiUrl}/customer_settings/`).subscribe({ next: res => {
      if (session !== accountSessionKey()) return;
      const saved = res.settings?.loved_questions;
      const serverLikes = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      const localOnlyLikes = Object.keys(this.meta).some(key => !Object.prototype.hasOwnProperty.call(serverLikes, key));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        this.meta = { ...saved, ...this.meta };
        this.set = new Set([...Object.keys(saved), ...this.set]);
      }
      // A like/unlike during the initial read must not erase server records or
      // resurrect a question the learner just unliked.
      const changed = this.pendingMutations.size > 0 || localOnlyLikes;
      for (const [key, liked] of this.pendingMutations) {
        if (!liked) { this.set.delete(key); delete this.meta[key]; }
      }
      this.pendingMutations.clear();
      this.serverReady = true;
      this.syncPending = false;
      this.persist(changed);
    }, error: () => {
      if (session === accountSessionKey()) this.syncPending = false;
    } });
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(this.storageKey(LOVED_KEY));
      const arr = raw ? JSON.parse(raw) : [];
      this.set = new Set((Array.isArray(arr) ? arr : []).map((x: any) => String(x)));
    } catch {
      this.set = new Set();
    }
    try {
      const raw = localStorage.getItem(this.storageKey(LOVED_META_KEY));
      const obj = raw ? JSON.parse(raw) : {};
      this.meta = (obj && typeof obj === 'object') ? obj : {};
    } catch {
      this.meta = {};
    }
    this.emitChanges();
  }

  private persist(writeServer = true): void {
    try {
      localStorage.setItem(this.storageKey(LOVED_KEY), JSON.stringify(Array.from(this.set)));
      localStorage.setItem(this.storageKey(LOVED_META_KEY), JSON.stringify(this.meta));
    } catch { /* ignore */ }
    this.emitChanges();
    if (writeServer && this.owner !== 'guest' && this.http && this.serverReady) this.http.post(`${environment.apiUrl}/customer_settings/`, {
      settings: { loved_questions: this.meta },
    }).subscribe({ error: () => undefined });
    else if (writeServer && this.owner !== 'guest' && this.http && !this.syncPending) this.syncFromServer();
  }

  private emitChanges(): void {
    this.countSubject.next(this.set.size);
    this.changesSubject.next(this.changesSubject.value + 1);
  }

  private matchingKey(qid: any, context?: any): string | undefined {
    this.ensureOwner();
    return Array.from(this.set).find(key => {
      const saved = this.meta[key];
      if (String(saved?.qid ?? key) !== String(qid)) return false;
      if (!context || !saved) return true;
      if (context.table && saved.table) return context.table === saved.table;
      return ['level_tr', 'class_level', 'subject_tr'].every(field =>
        !context[field] || !saved[field] || String(context[field]) === String(saved[field]));
    });
  }

  has(qid: any, context?: any): boolean {
    return this.matchingKey(qid, context) !== undefined;
  }

  /** Toggle love state. `meta` (question snapshot + subject context) is stored
   *  when loving and removed when unloving. Returns the new state (true = loved). */
  toggle(qid: any, meta?: any): boolean {
    if (qid == null || String(qid).trim() === '') return false;
    const existing = this.matchingKey(qid, meta);
    if (existing !== undefined) {
      this.set.delete(existing);
      delete this.meta[existing];
      this.pendingMutations.set(existing, false);
    } else {
      // Subject tables can reuse the same qid. Keep their likes separate,
      // while still reading older qid-only storage without losing saved data.
      const context = meta?.table || [meta?.level_tr, meta?.class_level, meta?.subject_tr].filter(Boolean).join('|');
      const s = context ? JSON.stringify([context, String(qid)]) : String(qid);
      this.set.add(s);
      this.pendingMutations.set(s, true);
      if (meta && typeof meta === 'object') {
        this.meta[s] = { ...meta, qid };
      } else this.meta[s] = { qid };
    }
    this.persist();
    return existing === undefined;
  }

  setMeta(qid: any, meta: any): void {
    const key = this.matchingKey(qid, meta) ?? String(qid);
    this.meta[key] = { ...meta, qid };
    this.pendingMutations.set(key, true);
    this.persist();
  }

  /** Snapshot of a loved question (saved when it was loved). */
  metaOf(qid: any, context?: any): any {
    return this.meta[this.matchingKey(qid, context) ?? String(qid)] || null;
  }

  qids(): string[] {
    this.ensureOwner();
    return Array.from(this.set).map(key => String(this.meta[key]?.qid ?? key));
  }

  /** All loved question snapshots (in love order). */
  lovedQuestions(): any[] {
    this.ensureOwner();
    return Array.from(this.set)
      .map((key) => this.meta[key])
      .filter((m) => m && m.qid != null);
  }

  ngOnDestroy(): void {
    this.syncSubscription?.unsubscribe();
    window.removeEventListener('storage', this.storageChanged);
    window.removeEventListener('cheradip-session-changed', this.sessionChanged);
  }
}

