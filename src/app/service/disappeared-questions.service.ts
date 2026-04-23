import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

const DISAPPEARED_LOCAL_KEY = 'cheradip_disappeared_question_ids';
const SETTINGS_KEY = 'disappeared_question_ids';

/** Stored item: qid plus optional full question data for display on Disappeared Questions page. */
export interface DisappearedItem {
  qid: string;
  question?: string | null;
  option_1?: string | null;
  option_2?: string | null;
  option_3?: string | null;
  option_4?: string | null;
  answer?: string | null;
  explanation?: string | null;
  type?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DisappearedQuestionsService {
  private ids = new Set<string>();
  /** Full items for display (qid + question text, options, etc.). */
  private items: DisappearedItem[] = [];

  constructor(private api: ApiService) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(DISAPPEARED_LOCAL_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.items = arr.map((x: any) =>
            typeof x === 'string' ? { qid: String(x) } : { qid: String(x?.qid ?? ''), question: x.question, option_1: x.option_1, option_2: x.option_2, option_3: x.option_3, option_4: x.option_4, answer: x.answer, explanation: x.explanation, type: x.type }
          ).filter((it: DisappearedItem) => it.qid);
          this.ids = new Set(this.items.map(it => it.qid));
        }
      }
    } catch (_) {}
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(DISAPPEARED_LOCAL_KEY, JSON.stringify(this.items));
    } catch (_) {}
  }

  /** Load from API (customer settings). Call after login or when component needs sync. Optional callback when done. */
  load(onLoaded?: () => void): void {
    if (!this.api.isLoggedIn()) {
      this.loadFromStorage();
      onLoaded?.();
      return;
    }
    this.api.getCustomerSettings().subscribe({
      next: (res) => {
        const arr = res.settings?.[SETTINGS_KEY];
        if (Array.isArray(arr)) {
          this.items = arr.map((x: any) =>
            typeof x === 'string' ? { qid: String(x) } : { qid: String(x?.qid ?? ''), question: x.question, option_1: x.option_1, option_2: x.option_2, option_3: x.option_3, option_4: x.option_4, answer: x.answer, explanation: x.explanation, type: x.type }
          ).filter((it: DisappearedItem) => it.qid);
          this.ids = new Set(this.items.map(it => it.qid));
        }
        this.saveToStorage();
        onLoaded?.();
      },
      error: () => {
        this.loadFromStorage();
        onLoaded?.();
      }
    });
  }

  private persist(): void {
    this.saveToStorage();
    if (!this.api.isLoggedIn()) return;
    this.api.updateCustomerSettings({ [SETTINGS_KEY]: this.items }).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  private norm(qid: number | string): string {
    return qid == null ? '' : String(qid);
  }

  isDisappeared(qid: number | string): boolean {
    const s = this.norm(qid);
    return s !== '' && this.ids.has(s);
  }

  add(qid: number | string): void {
    const s = this.norm(qid);
    if (s && !this.ids.has(s)) { this.ids.add(s); this.items.push({ qid: s }); this.persist(); }
  }

  /** Add with full question data for display on Disappeared Questions page. */
  addWithData(qid: number | string, data: Partial<DisappearedItem>): void {
    const s = this.norm(qid);
    if (!s) return;
    if (this.ids.has(s)) return;
    this.ids.add(s);
    this.items.push({
      qid: s,
      question: data.question ?? null,
      option_1: data.option_1 ?? null,
      option_2: data.option_2 ?? null,
      option_3: data.option_3 ?? null,
      option_4: data.option_4 ?? null,
      answer: data.answer ?? null,
      explanation: data.explanation ?? null,
      type: data.type ?? null
    });
    this.persist();
  }

  remove(qid: number | string): void {
    const s = this.norm(qid);
    if (s) {
      this.ids.delete(s);
      this.items = this.items.filter(it => it.qid !== s);
      this.persist();
    }
  }

  removeAll(): void {
    this.ids.clear();
    this.items = [];
    this.persist();
  }

  getAll(): string[] {
    return Array.from(this.ids);
  }

  /** All disappeared items with full data for display. */
  getItems(): DisappearedItem[] {
    return this.items.slice();
  }
}
