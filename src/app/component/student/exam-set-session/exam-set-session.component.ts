import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../service/api.service';
import { interval, Subscription } from 'rxjs';

const OPTION_KEYS = ['ক', 'খ', 'গ', 'ঘ'] as const;
const EXAM_DURATION_SEC = 20 * 60; // 20 minutes
const MAX_QUESTIONS = 30;
const SUBJECT_CACHE_PREFIX = 'cheradip_subject_all_';
const SUBJECT_LIST_CHUNK_SIZE = 200;

@Component({
  selector: 'app-exam-set-session',
  templateUrl: './exam-set-session.component.html',
  styleUrls: ['./exam-set-session.component.css']
})
export class ExamSetSessionComponent implements OnInit, OnDestroy {
  setId = 0;
  set: any = null;
  questions: any[] = [];
  answers: Record<string, string> = {};
  timeRemaining = EXAM_DURATION_SEC;
  timerSub?: Subscription;
  isSubmitted = false;
  result: { score: number; correct: number; total: number } | null = null;
  error = '';
  loading = true;
  Math = Math;
  readonly optionKeys = OPTION_KEYS;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.setId = +params['id'];
      if (this.setId) this.loadSetAndQuestions();
    });
  }

  ngOnDestroy(): void {
    this.timerSub?.unsubscribe();
  }

  loadSetAndQuestions(): void {
    this.loading = true;
    this.error = '';
    this.api.getExamSetById(this.setId).subscribe({
      next: (data: any) => {
        this.set = data;
        const qids = this.parseQidsFromSet(data);
        const levelTr = (data?.level_tr || '').trim();
        const classLevel = (data?.class_level || '').trim();
        const subjectTr = (data?.subject_tr || '').trim();
        const fromCache = (levelTr && subjectTr) ? this.loadSubjectQuestionsFromCache(levelTr, classLevel, subjectTr, qids) : null;
        if (fromCache && fromCache.length > 0) {
          this.questions = fromCache.slice(0, MAX_QUESTIONS);
          this.timeRemaining = EXAM_DURATION_SEC;
          this.startTimer();
          this.loading = false;
          return;
        }
        this.api.getExamSetQuestions(this.setId).subscribe({
          next: (q: any) => {
            this.questions = (q.questions || []).slice(0, MAX_QUESTIONS);
            this.timeRemaining = EXAM_DURATION_SEC;
            this.startTimer();
            this.loading = false;
          },
          error: () => {
            this.error = 'Could not load questions.';
            this.loading = false;
          }
        });
      },
      error: () => {
        this.error = 'Exam set not found.';
        this.loading = false;
      }
    });
  }

  /** Parse qids array from exam set (qids_json string). */
  private parseQidsFromSet(set: any): string[] {
    try {
      const raw = set?.qids_json;
      if (raw == null || raw === '') return [];
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return [];
      return arr.map((x: any) => String(x)).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Load subject questions from localStorage (same cache as question component).
   * Returns questions filtered and ordered by qids, or null if cache miss / no subject.
   */
  private loadSubjectQuestionsFromCache(levelTr: string, classLevel: string, subjectTr: string, qids: string[]): any[] | null {
    if (!qids.length) return null;
    const keyBase = `${SUBJECT_CACHE_PREFIX}${levelTr}_${classLevel}_${subjectTr}`;
    try {
      const listMetaStr = localStorage.getItem(`${keyBase}_list_meta`);
      const listMeta = listMetaStr ? JSON.parse(listMetaStr) : null;
      if (!listMeta || typeof listMeta.total !== 'number') return null;
      const chunkCount = (listMeta.chunkCount ?? Math.ceil(listMeta.total / SUBJECT_LIST_CHUNK_SIZE)) || 1;
      const all: any[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const str = localStorage.getItem(`${keyBase}_list_chunk_${i}`);
        const chunk = str ? JSON.parse(str) : null;
        if (Array.isArray(chunk)) all.push(...chunk);
      }
      if (all.length === 0) return null;
      const qidSet = new Set(qids);
      const byQid = new Map<string, any>();
      for (const q of all) {
        const qid = q?.qid != null ? String(q.qid) : (q?.id != null ? String(q.id) : '');
        if (!qid || !qidSet.has(qid)) continue;
        byQid.set(qid, this.normalizeQuestionForSession(q));
      }
      const ordered: any[] = [];
      for (const qid of qids) {
        const q = byQid.get(qid);
        if (q) ordered.push(q);
      }
      return ordered;
    } catch {
      return null;
    }
  }

  private normalizeQuestionForSession(q: any): any {
    const qid = q?.qid != null ? String(q.qid) : (q?.id != null ? String(q.id) : '');
    return {
      qid,
      id: qid,
      question: q?.question ?? '',
      option_1: q?.option_1 ?? '',
      option_2: q?.option_2 ?? '',
      option_3: q?.option_3 ?? '',
      option_4: q?.option_4 ?? '',
      answer: (q?.answer != null ? String(q.answer) : '').trim()
    };
  }

  startTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = interval(1000).subscribe(() => {
      if (this.timeRemaining > 0) this.timeRemaining--;
      else this.submitExam();
    });
  }

  selectAnswer(qid: string, key: string): void {
    this.answers[qid] = key;
  }

  getOptionText(q: any, key: string): string {
    const idx = OPTION_KEYS.indexOf(key as typeof OPTION_KEYS[number]);
    const opt = idx >= 0 ? (q['option_' + (idx + 1)] ?? '') : '';
    return (opt && String(opt).trim()) || '';
  }

  getTimerDisplay(): string {
    const m = Math.floor(this.timeRemaining / 60);
    const s = this.timeRemaining % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /** Serial number as 001, 002, ... */
  formatSl(i: number): string {
    return i.toString().padStart(3, '0');
  }

  get answeredCount(): number {
    return this.questions.filter(q => this.answers[q.qid]).length;
  }

  /** Normalized correct option key (ক/খ/গ/ঘ) for result display. */
  getCorrectAnswer(q: any): string {
    return this.normalizeAnswer(q?.answer) || '';
  }

  isUserCorrect(q: any): boolean {
    const expected = this.getCorrectAnswer(q);
    return !!expected && this.answers[q.qid] === expected;
  }

  submitExam(): void {
    this.timerSub?.unsubscribe();
    let correct = 0;
    const total = this.questions.length;
    for (const q of this.questions) {
      const userAnswer = this.answers[q.qid];
      const expected = this.normalizeAnswer(q.answer);
      if (expected && userAnswer === expected) correct++;
    }
    const score = total ? Math.round((correct / total) * 100) : 0;
    this.result = { score, correct, total };
    this.isSubmitted = true;
    this.storeExamResult(score, correct, total);
  }

  /** Persist result for history/report. Extend with API call if backend supports it. */
  private storeExamResult(score: number, correct: number, total: number): void {
    try {
      const key = 'exam_set_results';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift({
        setId: this.setId,
        setName: this.set?.name_label || '',
        score,
        correct,
        total,
        at: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  private normalizeAnswer(a: any): string {
    if (a == null || a === '') return '';
    const s = String(a).trim();
    if (OPTION_KEYS.includes(s as any)) return s;
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 4) return OPTION_KEYS[n - 1];
    if (/option_?1/i.test(s)) return 'ক';
    if (/option_?2/i.test(s)) return 'খ';
    if (/option_?3/i.test(s)) return 'গ';
    if (/option_?4/i.test(s)) return 'ঘ';
    return '';
  }

  backToRegularExam(): void {
    this.router.navigate(['/student/regularexam']);
  }
}
