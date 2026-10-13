import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { normalizeQuestionRecordFromApi } from '../shared/question-api-normalize';

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
  level_tr?: string;
  class_level?: string;
  subject_tr?: string;
  table?: string;
}

@Injectable({ providedIn: 'root' })
export class DisappearedQuestionsService {
  private ids = new Set<string>();
  /** Full items for display (qid + question text, options, etc.). */
  private items: DisappearedItem[] = [];
  private owner = '';
  private currentOwner(): string { return localStorage.getItem('isLoggedIn') === 'true' ? localStorage.getItem('username') || 'guest' : 'guest'; }
  private storageKey(): string { return `${DISAPPEARED_LOCAL_KEY}:${this.currentOwner()}`; }
  private ensureOwner(): void {
    if (this.owner === this.currentOwner()) return;
    this.owner = this.currentOwner(); this.ids.clear(); this.items = []; this.loadFromStorage();
  }
  private itemKey(qid: number | string, context?: Partial<DisappearedItem>): string {
    const scope = context?.table || [context?.level_tr, context?.class_level, context?.subject_tr].filter(Boolean).join('|');
    return scope ? JSON.stringify([scope, String(qid)]) : String(qid);
  }

  constructor(private api: ApiService) {
    this.owner = this.currentOwner();
    const legacy = localStorage.getItem(DISAPPEARED_LOCAL_KEY);
    const claimed = localStorage.getItem('cheradip-disappeared-legacy-owner');
    if (legacy && (!claimed || claimed === this.owner) && !localStorage.getItem(this.storageKey())) {
      localStorage.setItem(this.storageKey(), legacy);
      if (this.owner !== 'guest') localStorage.setItem('cheradip-disappeared-legacy-owner', this.owner);
    }
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.items = arr
            .map((x: any) =>
              typeof x === 'string'
                ? { qid: String(x) }
                : normalizeQuestionRecordFromApi({
                    ...x,
                    qid: String(x?.qid ?? ''),
                    question: x.question,
                    option_1: x.option_1,
                    option_2: x.option_2,
                    option_3: x.option_3,
                    option_4: x.option_4,
                    answer: x.answer,
                    explanation: x.explanation,
                    type: x.type,
                  })
            )
            .filter((it: DisappearedItem) => it.qid);
          this.ids = new Set(this.items.map(it => this.itemKey(it.qid, it)));
        }
      }
    } catch (_) {}
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.items));
    } catch (_) {}
  }

  /** Load from API (customer settings). Call after login or when component needs sync. Optional callback when done. */
  load(onLoaded?: () => void): void {
    this.ensureOwner();
    const owner = this.currentOwner();
    if (!this.api.isLoggedIn()) {
      this.loadFromStorage();
      onLoaded?.();
      return;
    }
    this.api.getCustomerSettings().subscribe({
      next: (res) => {
        if (owner !== this.currentOwner()) return;
        const arr = res.settings?.[SETTINGS_KEY];
        if (Array.isArray(arr)) {
          this.items = arr
            .map((x: any) =>
              typeof x === 'string'
                ? { qid: String(x) }
                : normalizeQuestionRecordFromApi({
                    ...x,
                    qid: String(x?.qid ?? ''),
                    question: x.question,
                    option_1: x.option_1,
                    option_2: x.option_2,
                    option_3: x.option_3,
                    option_4: x.option_4,
                    answer: x.answer,
                    explanation: x.explanation,
                    type: x.type,
                  })
            )
            .filter((it: DisappearedItem) => it.qid);
          this.ids = new Set(this.items.map(it => this.itemKey(it.qid, it)));
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

  isDisappeared(qid: number | string, context?: Partial<DisappearedItem>): boolean {
    this.ensureOwner();
    const s = this.norm(qid);
    if (s && context?.table && this.ids.has(s)) {
      const legacy = this.items.find(item => item.qid === s && this.itemKey(item.qid, item) === s);
      if (legacy && (!context.question || !legacy.question || context.question === legacy.question)) {
        Object.assign(legacy, { table: context.table });
        this.ids.delete(s); this.ids.add(this.itemKey(s, legacy)); this.persist();
      }
    }
    return s !== '' && this.ids.has(this.itemKey(s, context));
  }

  add(qid: number | string): void {
    this.ensureOwner();
    const s = this.norm(qid);
    if (s && !this.ids.has(s)) { this.ids.add(s); this.items.push({ qid: s }); this.persist(); }
  }

  /** Add with full question data for display on Disappeared Questions page. */
  addWithData(qid: number | string, data: Partial<DisappearedItem>): void {
    this.ensureOwner();
    const s = this.norm(qid);
    if (!s) return;
    const key = this.itemKey(s, data);
    if (this.ids.has(key)) return;
    this.ids.add(key);
    this.items.push(
      normalizeQuestionRecordFromApi({
        ...data,
        qid: s,
        question: data.question ?? null,
        option_1: data.option_1 ?? null,
        option_2: data.option_2 ?? null,
        option_3: data.option_3 ?? null,
        option_4: data.option_4 ?? null,
        answer: data.answer ?? null,
        explanation: data.explanation ?? null,
        type: data.type ?? null,
      }) as DisappearedItem
    );
    this.persist();
  }

  remove(qid: number | string, context?: Partial<DisappearedItem>): void {
    this.ensureOwner();
    const s = this.norm(qid);
    if (s) {
      const key = this.itemKey(s, context);
      this.ids.delete(key);
      this.items = this.items.filter(it => this.itemKey(it.qid, it) !== key);
      this.persist();
    }
  }

  removeAll(): void {
    this.ensureOwner();
    this.ids.clear();
    this.items = [];
    this.persist();
  }

  getAll(): string[] {
    this.ensureOwner();
    return Array.from(this.ids);
  }

  /** All disappeared items with full data for display. */
  getItems(): DisappearedItem[] {
    this.ensureOwner();
    return this.items.slice();
  }
}
