import { Injectable } from '@angular/core';

/**
 * Lightweight shared "Liked / Loved Questions" store (localStorage-backed).
 * Used by the question page (love icons), the exam results page and the
 * Liked Questions page so a question loved anywhere is available everywhere.
 */
const LOVED_KEY = 'cheradip_loved_qids';
const LOVED_META_KEY = 'cheradip_loved_qids_meta';

@Injectable({ providedIn: 'root' })
export class LovedQuestionsService {
  private set = new Set<string>();
  private meta: Record<string, any> = {};

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(LOVED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      this.set = new Set((Array.isArray(arr) ? arr : []).map((x: any) => String(x)));
    } catch {
      this.set = new Set();
    }
    try {
      const raw = localStorage.getItem(LOVED_META_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      this.meta = (obj && typeof obj === 'object') ? obj : {};
    } catch {
      this.meta = {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(LOVED_KEY, JSON.stringify(Array.from(this.set)));
      localStorage.setItem(LOVED_META_KEY, JSON.stringify(this.meta));
    } catch { /* ignore */ }
  }

  has(qid: any): boolean {
    return this.set.has(String(qid));
  }

  /** Toggle love state. `meta` (question snapshot + subject context) is stored
   *  when loving and removed when unloving. Returns the new state (true = loved). */
  toggle(qid: any, meta?: any): boolean {
    const s = String(qid);
    if (this.set.has(s)) {
      this.set.delete(s);
      delete this.meta[s];
    } else {
      this.set.add(s);
      if (meta && typeof meta === 'object') {
        this.meta[s] = meta;
      }
    }
    this.persist();
    return this.set.has(s);
  }

  setMeta(qid: any, meta: any): void {
    this.meta[String(qid)] = meta;
    this.persist();
  }

  /** Snapshot of a loved question (saved when it was loved). */
  metaOf(qid: any): any {
    return this.meta[String(qid)] || null;
  }

  qids(): string[] {
    return Array.from(this.set);
  }

  /** All loved question snapshots (in love order). */
  lovedQuestions(): any[] {
    return this.qids()
      .map((qid) => this.meta[qid])
      .filter((m) => m && m.qid != null);
  }
}

