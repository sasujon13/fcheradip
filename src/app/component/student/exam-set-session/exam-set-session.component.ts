import { Component, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../service/api.service';
import { LovedQuestionsService } from '../../../service/loved-questions.service';
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
  explanationOpen: Record<string, boolean> = {};
  allExplanationsOpen = false;
  editingQid: string | null = null;
  topicEditMode = false;
  originalTopic = '';
  editForm: any = { question: '', option_1: '', option_2: '', option_3: '', option_4: '', answer: '', explanation: '' };
  editStatus = '';
  editTopics: string[] = [];
  timeRemaining = EXAM_DURATION_SEC;
  private deadlineTs = Date.now() + EXAM_DURATION_SEC * 1000;
  timerSub?: Subscription;
  isSubmitted = false;
  result: { score: number; correct: number; total: number } | null = null;
  error = '';
  loading = true;
  asideOpen = false;
  asideCardHidden: Record<string, boolean> = {};
  examSets: any[] = [];
  Math = Math;
  readonly optionKeys = OPTION_KEYS;

  /* ---- anti-cheat / secure-exam state ---- */
  private wakeLock: any = null;
  private secureOverlay: HTMLElement | null = null;
  private antiCheatStyleEl: HTMLStyleElement | null = null;
  private destroyed = false;
  private everFullscreen = false;
  private readonly antiCheatRemovers: Array<() => void> = [];
  private fitResizeHandler = (): void => this.fitSessionHeight();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private el: ElementRef,
    private lovedService: LovedQuestionsService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.setId = +params['id'];
      // Leaving an unfinished exam (e.g. "Start Next Exam" from the aside):
      // count that attempt as ended so the next one is a fresh iteration.
      if (this.questions.length && !this.isSubmitted) this.autoEndOnLeave();
      // Reset state when the route id changes (Next/Random exam navigation reuses the component)
      this.answers = {};
      this.result = null;
      this.isSubmitted = false;
      this.asideOpen = false;
      this.timeRemaining = EXAM_DURATION_SEC;
      this.explanationOpen = {};
      this.allExplanationsOpen = false;
      this.editingQid = null;
      this.editStatus = '';
      // (Re)arm the secure-exam guards for this attempt.
      this.disableAntiCheat();
      this.enableAntiCheat();
      if (this.setId) this.loadSetAndQuestions();
    });
    this.loadExamSets();
    window.addEventListener('resize', this.fitResizeHandler);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    window.removeEventListener('resize', this.fitResizeHandler);
    this.autoEndOnLeave();
    this.timerSub?.unsubscribe();
    this.disableAntiCheat();
  }

  /* ------------------------------------------------------ anti-cheat */

  /** Secure the session: lock UI to the exam, block selection/copy/context
   *  menu, hide the site header, request fullscreen + wake lock on the first
   *  user gesture (browser permission prompt), and cover the screen whenever
   *  the user switches tab/window/app (also deters screenshots). */
  private enableAntiCheat(): void {
    const host = this.el.nativeElement as HTMLElement;
    document.body.classList.add('cheradip-exam-lock');
    this.injectAntiCheatStyles();

    const addDoc = (type: string, fn: (ev: any) => void, capture: boolean = true) => {
      document.addEventListener(type, fn, capture);
      this.antiCheatRemovers.push(() => document.removeEventListener(type, fn, capture));
    };
    const addWin = (type: string, fn: (ev: any) => void) => {
      window.addEventListener(type, fn);
      this.antiCheatRemovers.push(() => window.removeEventListener(type, fn));
    };
    const outside = (ev: Event): boolean => {
      const t = ev.target as Node | null;
      if (!t) return true;
      if (host.contains(t)) return false;
      // Allow chrome we own: the full-screen "Return to Exam" overlay and the lock toast.
      const el = (t instanceof Element) ? t : t.parentElement;
      if (el && (el.closest('.cheradip-secure-overlay') || el.closest('#cheradip-lock-toast'))) return false;
      return true;
    };

    // 1) Clicks/pointer/touches outside the exam area: block the action and
    //    activate the navigation-lock overlay (the rest of the page stays
    //    visible underneath, but navigation is prevented).
    const lockOutside = (ev: Event) => {
      if (outside(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        this.showSecureOverlay('Navigation is locked during the exam — you cannot leave this page until you submit your exam.');
      }
    };
    addDoc('click', lockOutside);
    addDoc('pointerdown', lockOutside);
    addDoc('mousedown', lockOutside);
    addDoc('touchstart', lockOutside);
    addDoc('dblclick', lockOutside);

    // 2) No context menu, text selection, drag/copy/cut.
    addDoc('contextmenu', (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); });
    addDoc('selectstart', (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); });
    addDoc('dragstart', (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); });
    addDoc('copy', (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); });
    addDoc('cut', (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); });

    // 3) Common devtools / copy / print shortcuts.
    addDoc('keydown', (ev: KeyboardEvent) => {
      const k = (ev.key || '').toLowerCase();
      if (k === 'f12' || k === 'printscreen' || k === 'pauseprintscreen') { ev.preventDefault(); return; }
      if ((ev.ctrlKey || ev.metaKey) && ['c', 'x', 'a', 'p', 's', 'u'].includes(k)) { ev.preventDefault(); return; }
      if (ev.ctrlKey && ev.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) { ev.preventDefault(); return; }
      if (ev.ctrlKey && ev.altKey && k === 'tab') { ev.preventDefault(); }
    });

    // 4) Leave detection: switching tab/window/app covers the screen.
    const coverIfOut = () => {
      window.setTimeout(() => {
        if (this.isSubmitted && this.result) return;
        if (document.hidden || !document.hasFocus()) this.showSecureOverlay(
          'You left the exam session. Return to the exam or submit it before leaving.');
      }, 80);
    };
    addDoc('visibilitychange', () => { if (document.hidden) coverIfOut(); });
    addWin('blur', coverIfOut);

    // 4b) Esc / browser fullscreen exit -> force the choice (Return or Submit).
    addDoc('fullscreenchange', () => {
      if (this.destroyed) return;
      if (!document.fullscreenElement) {
        this.everFullscreen = false;
        if (!this.isSubmitted && this.questions.length) {
          this.showSecureOverlay(
            'You tried to exit full-screen mode. You must return to the exam or submit it before leaving.');
        }
      } else {
        this.everFullscreen = true;
      }
    });

    // 4c) Real page leave (tab close/reload/route-out) -> end the attempt now.
    const bye = () => this.autoEndOnLeave();
    addDoc('pagehide', bye);
    addDoc('beforeunload', bye);

    // 5) First user gesture -> fullscreen + screen wake lock (permission popups).
    const gesture = () => {
      if (this.isSubmitted && this.result) return;
      try {
        const docEl: any = document.documentElement;
        if (!document.fullscreenElement && docEl && docEl.requestFullscreen) {
          docEl.requestFullscreen().then(() => { this.everFullscreen = true; }).catch(() => { /* permission denied */ });
        }
      } catch { /* ignore */ }
      try {
        const nav: any = navigator;
        if (nav && nav.wakeLock && nav.wakeLock.request && (!this.wakeLock || this.wakeLock.released)) {
          nav.wakeLock.request('screen').then((wl: any) => { this.wakeLock = wl; }).catch(() => { /* denied */ });
        }
      } catch { /* ignore */ }
    };
    addDoc('pointerdown', gesture, true);
    addDoc('keydown', gesture, true);
  }

  private disableAntiCheat(): void {
    document.body.classList.remove('cheradip-exam-lock');
    this.antiCheatRemovers.splice(0).forEach(fn => { try { fn(); } catch { /* ignore */ } });
    if (this.antiCheatStyleEl) {
      try { this.antiCheatStyleEl.remove(); } catch { /* ignore */ }
      this.antiCheatStyleEl = null;
    }
    this.hideSecureOverlay();
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    try {
      if (this.wakeLock && !this.wakeLock.released) this.wakeLock.release().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    this.wakeLock = null;
  }

  private injectAntiCheatStyles(): void {
    if (document.getElementById('cheradip-exam-lock-style')) return;
    const style = document.createElement('style');
    style.id = 'cheradip-exam-lock-style';
    style.textContent = [
      'body.cheradip-exam-lock { user-select: none !important; -webkit-user-select: none !important; -webkit-touch-callout: none !important; }',
      '.cheradip-secure-overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0, 128, 128, 0.95); display: flex; align-items: center; justify-content: center; }',
      '.cheradip-secure-card { position: relative; background: #fff; border-radius: 16px; padding: 28px 24px; max-width: 380px; width: calc(100vw - 40px); box-sizing: border-box; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.35); animation: cheradip-slide-in .25s ease; }',
      '@keyframes cheradip-slide-in { from { transform: translateY(-30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }',
      '.cheradip-secure-x { position: absolute; top: 10px; right: 12px; width: 30px; height: 30px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-size: 20px; line-height: 1; cursor: pointer; }',
      '.cheradip-secure-x:hover { background: #f1f5f9; color: #1e293b; }',
      '.cheradip-secure-icon { font-size: 40px; }',
      '.cheradip-secure-title { font-size: 18px; font-weight: 700; color: #0f766e; margin: 8px 0 6px; }',
      '.cheradip-secure-msg { font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px; }',
      '.cheradip-secure-btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }',
      '.cheradip-secure-btn { padding: 9px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer; }',
      '.cheradip-secure-btn.return { background: #fff; color: #008080; border: 2px solid #008080; }',
      '.cheradip-secure-btn.return:hover { background: #f0fdfa; }',
      '.cheradip-secure-btn.submit { background: #dc2626; color: #fff; border: 2px solid #dc2626; }',
      '.cheradip-secure-btn.submit:hover { background: #b91c1c; border-color: #b91c1c; }',
      '#cheradip-lock-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px); background: #b91c1c; color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 13px; z-index: 2147483647; opacity: 0; transition: opacity .2s, transform .2s; pointer-events: none; }',
      '#cheradip-lock-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }'
    ].join('\n');
    document.head.appendChild(style);
    this.antiCheatStyleEl = style;
  }

  private showSecureOverlay(reason: string): void {
    if (this.secureOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'cheradip-secure-overlay';
    ov.innerHTML =
      '<div class="cheradip-secure-card">' +
      '<button type="button" class="cheradip-secure-x" aria-label="Return to exam">&times;</button>' +
      '<div class="cheradip-secure-icon">&#128274;</div>' +
      '<div class="cheradip-secure-title">Attention</div>' +
      '<div class="cheradip-secure-msg">' + (reason || 'You left the exam session.') + '</div>' +
      '<div class="cheradip-secure-btns">' +
      '<button type="button" class="cheradip-secure-btn return">Return to Exam</button>' +
      '<button type="button" class="cheradip-secure-btn submit">Submit Exam</button>' +
      '</div>' +
      '</div>';
    const x = ov.querySelector('.cheradip-secure-x') as HTMLElement | null;
    const ret = ov.querySelector('.cheradip-secure-btn.return') as HTMLElement | null;
    const sub = ov.querySelector('.cheradip-secure-btn.submit') as HTMLElement | null;
    if (x) x.addEventListener('click', () => this.hideSecureOverlay(true));
    if (ret) ret.addEventListener('click', () => this.hideSecureOverlay(true));
    if (sub) sub.addEventListener('click', () => this.submitFromLock());
    document.body.appendChild(ov);
    this.secureOverlay = ov;
  }

  private hideSecureOverlay(reenterFullscreen = false): void {
    if (this.secureOverlay) {
      try { this.secureOverlay.remove(); } catch { /* ignore */ }
      this.secureOverlay = null;
    }
    if (reenterFullscreen && !this.isSubmitted) {
      try {
        const docEl: any = document.documentElement;
        if (!document.fullscreenElement && docEl && docEl.requestFullscreen) {
          docEl.requestFullscreen().then(() => { this.everFullscreen = true; }).catch(() => { /* ignore */ });
        }
      } catch { /* ignore */ }
    }
  }

  /** "Submit Exam" from the lock overlay: score current answers immediately. */
  private submitFromLock(): void {
    this.hideSecureOverlay();
    this.submitExam();
  }

  /** Leave the page without submitting -> end the attempt now (counted as an
   *  iteration), clear the session so the next visit is a fresh retake. */
  private autoEndOnLeave(): void {
    if (this.destroyed || this.isSubmitted || !this.questions.length) return;
    let correct = 0;
    const total = this.questions.length;
    for (const q of this.questions) {
      const expected = this.getCorrectAnswer(q);
      if (expected && this.answers[q.qid] === expected) correct++;
    }
    const score = total ? Math.round((correct / total) * 100) : 0;
    this.storeExamResult(score, correct, total); // synchronous localStorage write
    this.clearSession();                          // next load = retake (next iteration)
    this.isSubmitted = true;                      // avoid double counting on unload
  }

  private flashLockedNotice(): void {
    let toast = document.getElementById('cheradip-lock-toast') as HTMLElement | null;
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cheradip-lock-toast';
      toast.textContent = 'Navigation is locked during the exam';
      document.body.appendChild(toast);
    }
    toast.classList.add('show');
    window.clearTimeout((toast as any)._hideTimer);
    (toast as any)._hideTimer = window.setTimeout(() => toast && toast.classList.remove('show'), 1200);
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
          this.restoreSession();
          if (this.isSubmitted) { this.loading = false; this.disableAntiCheat(); this.scheduleFit(); return; }
          if (this.timeRemaining <= 0) { this.submitExam(); this.loading = false; this.scheduleFit(); this.scheduleFullscreen(); return; }
          this.startTimer();
          this.loading = false;
          this.scheduleFit();
          this.scheduleFullscreen();
          return;
        }
        this.api.getExamSetQuestions(this.setId).subscribe({
          next: (q: any) => {
            this.questions = (q.questions || []).slice(0, MAX_QUESTIONS);
            this.restoreSession();
            if (this.isSubmitted) { this.loading = false; this.disableAntiCheat(); this.scheduleFit(); return; }
            if (this.timeRemaining <= 0) { this.submitExam(); this.loading = false; this.scheduleFit(); this.scheduleFullscreen(); return; }
            this.startTimer();
            this.loading = false;
            this.scheduleFit();
            this.scheduleFullscreen();
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
      answer: (q?.answer != null ? String(q.answer) : '').trim(),
      explanation: q?.explanation ?? '',
      explanation2: q?.explanation2 ?? '',
      explanation3: q?.explanation3 ?? '',
      subsource: (q?.subsource != null && String(q.subsource).trim() !== '')
        ? String(q.subsource).trim().replace(/"/g, '')
        : ''
    };
  }

  startTimer(): void {
    this.timerSub?.unsubscribe();
    // Anchor the countdown to the wall clock so leaving/hiding the tab still
    // consumes real time (browsers throttle background timers, not Date.now()).
    this.deadlineTs = Date.now() + this.timeRemaining * 1000;
    this.timerSub = interval(500).subscribe(() => {
      const left = Math.max(0, Math.round((this.deadlineTs - Date.now()) / 1000));
      if (left !== this.timeRemaining) {
        this.timeRemaining = left;
        this.persistSession();
      }
      if (left <= 0) this.submitExam();
    });
  }

  selectAnswer(qid: string, key: string): void {
    if (this.isSubmitted || this.answers[qid]) return; // lock: one answer per question
    this.answers[qid] = key;
    this.persistSession();
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

  /**
   * Smooth 4-stop gradient for the remaining-time color:
   * teal (full time) -> light green -> orange -> red (time up).
   */
  private readonly TIMER_GRADIENT_STOPS: Array<[number, number, number]> = [
    [0, 128, 128],    // teal       #008080
    [34, 197, 94],    // light green #22c55e
    [245, 158, 11],   // orange     #f59e0b
    [220, 38, 38],    // red        #dc2626
  ];

  /** Remaining-time text color, interpolated across the gradient by elapsed fraction. */
  get timerColor(): string {
    const total = Math.max(EXAM_DURATION_SEC, 1);
    const t = Math.max(0, Math.min(this.timeRemaining, total));
    const f = (total - t) / total; // 0 = full time (teal), 1 = time up (red)
    const stops = this.TIMER_GRADIENT_STOPS;
    const segments = stops.length - 1;
    let pos = f * segments;
    if (pos >= segments) pos = segments - 0.0001;
    const idx = Math.max(0, Math.floor(pos));
    const frac = pos - idx;
    const c0 = stops[idx];
    const c1 = stops[Math.min(idx + 1, segments)];
    const r = Math.round(c0[0] + (c1[0] - c0[0]) * frac);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * frac);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * frac);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** Serial number as 001, 002, ... */
  formatSl(i: number): string {
    return i.toString().padStart(3, '0');
  }

  get answeredCount(): number {
    return this.questions.filter(q => this.answers[q.qid]).length;
  }

  /** Normalized correct option key (ক/খ/গ/ঘ) for result display. */
  /**
   * Normalized correct option key for result display/detection.
   * 1) The stored answer may be an option letter (Ka/Kha/Ga/Gha, A-D, 1-4, option_N).
   * 2) Otherwise match by CONTENT: the option whose text equals the answer text
   *    (HSC/Honours MCQ rows often store the answer content, e.g. '1688' or a sentence).
   */
  getCorrectAnswer(q: any): string {
    const letter = this.normalizeAnswer(q?.answer);
    if (letter) return letter;
    const ansText = this.normPlain(q?.answer);
    if (!ansText) return '';
    for (let i = 0; i < OPTION_KEYS.length; i++) {
      const optText = this.normPlain((q as any)['option_' + (i + 1)]);
      if (optText && optText === ansText) return OPTION_KEYS[i];
    }
    // Prefix fallback: answer may repeat the option text plus extra words/punctuation.
    for (let i = 0; i < OPTION_KEYS.length; i++) {
      const optText = this.normPlain((q as any)['option_' + (i + 1)]);
      if (optText && ansText.indexOf(optText) === 0) return OPTION_KEYS[i];
    }
    return '';
  }

  /** Plain text used for content matching (lowercase, no spaces, marker prefix stripped). */
  private normPlain(a: any): string {
    const s = String(a == null ? '' : a).replace(/\s+/g, '').toLowerCase();
    return s.replace(/^[কখগঘ][:).\-]+/, '');
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
      const expected = this.getCorrectAnswer(q);
      if (expected && userAnswer === expected) correct++;
    }
    const score = total ? Math.round((correct / total) * 100) : 0;
    this.result = { score, correct, total };
    this.isSubmitted = true;
    this.storeExamResult(score, correct, total);
    this.persistSession();
    // Leave fullscreen once the exam is submitted (results view is shown normally).
    this.exitFullscreenIfActive();
    // After submission every restriction is lifted — the page works as usual.
    this.disableAntiCheat();
  }

  private exitFullscreenIfActive(): void {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
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
        subjectTr: (this.set?.subject_tr || '').trim(),
        levelTr: (this.set?.level_tr || '').trim(),
        classLevel: (this.set?.class_level || '').trim(),
        setKey: this.set?.set_key || '',
        examType: this.set?.exam_type || '',
        at: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  /* ------------------------------------------------------- exam session */

  private sessionKey(): string {
    return `cheradip_exam_session_${this.setId}`;
  }

  /** Save in-progress exam state so a page reload keeps time + answers. */
  private persistSession(): void {
    try {
      sessionStorage.setItem(this.sessionKey(), JSON.stringify({
        answers: this.answers,
        timeLeftSeconds: this.timeRemaining,
        savedAt: Date.now(),
        isSubmitted: this.isSubmitted,
        result: this.result,
      }));
    } catch {
      // ignore
    }
  }

  /**
   * Restore a previous session for this set id (if any). Uses the saved
   * timestamp so time that passed while the page was closed is subtracted.
   */
  private restoreSession(): void {
    try {
      const raw = sessionStorage.getItem(this.sessionKey());
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.isSubmitted && s.result) {
        this.answers = (s.answers && typeof s.answers === 'object') ? s.answers : {};
        this.result = s.result;
        this.isSubmitted = true;
        this.timerSub?.unsubscribe();
        return;
      }
      const savedAt = Number(s.savedAt) || Date.now();
      const elapsedSec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
      const left = Math.max(0, (Number(s.timeLeftSeconds) || EXAM_DURATION_SEC) - elapsedSec);
      this.answers = (s.answers && typeof s.answers === 'object') ? s.answers : {};
      this.timeRemaining = left;
    } catch {
      // ignore
    }
  }

  /** Remove the saved session (e.g. when retaking the exam from scratch). */
  private clearSession(): void {
    try {
      sessionStorage.removeItem(this.sessionKey());
    } catch {
      // ignore
    }
  }

  private normalizeAnswer(a: any): string {
    if (a == null || a === '') return '';
    const s = String(a).trim();
    const up = s.toUpperCase().replace(/^[\s\)\.\-\:]+/, '');
    if (OPTION_KEYS.includes(s as any)) return s;
    if (OPTION_KEYS.includes(up as any)) return up as string; // 'ক)' / 'খ.' etc.
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 4) return OPTION_KEYS[n - 1];
    if (up === 'A') return 'ক';
    if (up === 'B') return 'খ';
    if (up === 'C') return 'গ';
    if (up === 'D') return 'ঘ';
    if (/option_?1/i.test(s)) return 'ক';
    if (/option_?2/i.test(s)) return 'খ';
    if (/option_?3/i.test(s)) return 'গ';
    if (/option_?4/i.test(s)) return 'ঘ';
    return '';
  }

  /* ------------------------------------------------------------------ aside */

  loadExamSets(): void {
    this.api.getExamSets().subscribe({
      next: (res: any) => {
        const list = res?.exam_sets || [];
        this.examSets = list.sort((a: any, b: any) => (Number(a?.id) || 0) - (Number(b?.id) || 0));
      },
      error: () => { this.examSets = []; }
    });
  }

  toggleAside(): void {
    this.asideOpen = !this.asideOpen;
    if (this.asideOpen) this.positionAsideBelowHeader();
  }

  /** On small screens the aside is an absolute panel: anchor it just below the
   *  exam header row (under the hamburger) instead of the top of the viewport. */
  private positionAsideBelowHeader(): void {
    const host = this.el.nativeElement as HTMLElement;
    const aside = host.querySelector('.exam-aside') as HTMLElement | null;
    if (!aside || window.innerWidth > 1000) return;
    const header = host.querySelector('.topic-questions-header') as HTMLElement | null;
    const container = host.querySelector('.session-container') as HTMLElement | null;
    if (!header || !container) {
      aside.style.top = '0px';
      return;
    }
    try {
      const top = header.getBoundingClientRect().bottom - container.getBoundingClientRect().top;
      aside.style.top = Math.max(0, Math.floor(top)) + 'px';
    } catch { /* ignore */ }
  }

  toggleAsideCard(key: string): void {
    this.asideCardHidden[key] = !this.asideCardHidden[key];
  }

  isAsideCardOpen(key: string): boolean {
    return !this.asideCardHidden[key];
  }

  /** Pin the session layout to the available viewport height so only the inner
   *  content areas scroll (questions column + aside), never the page itself. */
  private fitSessionHeight(): void {
    const host = this.el.nativeElement as HTMLElement;
    const container = host.querySelector('.session-container') as HTMLElement | null;
    if (!container) return;
    try {
      const top = container.getBoundingClientRect().top;
      container.style.height = Math.max(320, Math.floor(window.innerHeight - top - 6)) + 'px';
    } catch { /* ignore */ }
  }

  private scheduleFit(): void {
    window.setTimeout(() => this.fitSessionHeight(), 60);
  }

  /** Enter fullscreen as early as possible once the exam has started. If the
   *  browser rejects it (needs a user gesture), the gesture listener in
   *  enableAntiCheat() retries on the first click/keypress. */
  private autoEnterFullscreen(): void {
    try {
      const docEl: any = document.documentElement;
      if (docEl && docEl.requestFullscreen && !document.fullscreenElement && !this.isSubmitted) {
        docEl.requestFullscreen().then(() => { this.everFullscreen = true; }).catch(() => { /* fallback: first user gesture */ });
      }
    } catch { /* ignore */ }
  }

  private scheduleFullscreen(): void {
    window.setTimeout(() => this.autoEnterFullscreen(), 120);
  }

  toggleExplanation(qid: string): void {
    this.explanationOpen[qid] = !this.explanationOpen[qid];
  }

  isExplanationOpen(qid: string): boolean {
    return !!this.explanationOpen[qid];
  }

  /** Open / hide the explanation of EVERY question with one click. */
  toggleAllExplanations(): void {
    this.allExplanationsOpen = !this.allExplanationsOpen;
    const open = this.allExplanationsOpen;
    this.questions.forEach((q: any) => {
      this.explanationOpen[q.qid] = open;
    });
  }

  /* ------------------------------------------------- love & edit request */

  isLoved(q: any): boolean {
    return !!this.lovedService.has(q?.qid);
  }

  toggleLove(q: any, ev?: Event): void {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!q) return;
    const level = this.set?.level_tr || q.level_tr || '';
    const cls = this.set?.class_level || q.class_level || '';
    const sub = this.set?.subject_tr || q.subject_tr || q.subject || '';
    const meta: any = {
      qid: q.qid,
      question: q.question, option_1: q.option_1, option_2: q.option_2,
      option_3: q.option_3, option_4: q.option_4, answer: q.answer,
      explanation: q.explanation, explanation2: q.explanation2, explanation3: q.explanation3,
      subsource: q.subsource, type: q.type, level: q.level,
      chapter_no: q.chapter_no, chapter: q.chapter, topic_no: q.topic_no, topic: q.topic,
      level_tr: level, class_level: cls, subject_tr: sub,
      table: q.table || this.subjectQuestionTableNameForPayload(),
    };
    this.lovedService.toggle(q.qid, meta);
  }

  startEdit(q: any, ev?: Event): void {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!q) return;
    this.editingQid = q.qid;
    this.topicEditMode = false;
    this.originalTopic = q.topic != null ? String(q.topic).trim() : '';
    this.editStatus = '';
    this.editTopics = q.topic ? [String(q.topic).trim()] : [];
    this.loadEditTopics(q);
    this.editForm = {
      question: (q.question != null ? String(q.question) : '').trim(),
      option_1: (q.option_1 != null ? String(q.option_1) : '').trim(),
      option_2: (q.option_2 != null ? String(q.option_2) : '').trim(),
      option_3: (q.option_3 != null ? String(q.option_3) : '').trim(),
      option_4: (q.option_4 != null ? String(q.option_4) : '').trim(),
      answer: (q.answer != null ? String(q.answer) : '').trim(),
      explanation: (q.explanation != null ? String(q.explanation) : '').trim(),
      topic: (q.topic != null ? String(q.topic) : '').trim(),
      subsource: (q.subsource != null ? String(q.subsource) : '').trim(),
      addTopic: false,
      newTopic: '',
    };
  }

  cancelEdit(): void {
    this.editingQid = null;
    this.topicEditMode = false;
    this.editStatus = '';
  }

  /** Revert the edited topic back to the question's original topic. */
  revertEditTopic(): void {
    if (this.originalTopic) this.editForm.topic = this.originalTopic;
    this.topicEditMode = false;
  }

  /** Fetch all topics under the question's chapter for the edit dropdown. */
  private loadEditTopics(q: any): void {
    const level = this.set?.level_tr || q.level_tr || '';
    const cls = this.set?.class_level || q.class_level || '';
    const sub = this.set?.subject_tr || q.subject_tr || q.subject || '';
    const chapter = q.chapter || '';
    if (!level || !sub) return;
    this.api.getQuestionTopics({
      level_tr: level,
      class_level: cls,
      subject_tr: sub,
      chapter: chapter || undefined,
    }).subscribe({
      next: (r: any) => {
        const ts = (r && r.topics) ? r.topics : (Array.isArray(r) ? r : []);
        const names = Array.from(new Set((ts as any[]).map((t: any) => String(t?.name || t?.topic || '').trim()).filter(Boolean)));
        const cur = (this.editForm?.topic || q.topic || '').trim();
        if (cur && !names.includes(cur)) names.unshift(cur);
        this.editTopics = names;
      },
      error: () => { /* keep default = question's topic */ },
    });
  }

  /** Same table slug as the /question page edits so admin approve writes to the right table. */
  private subjectQuestionTableNameForPayload(): string {
    const slug = (s: any) => {
      if (s == null || typeof s !== 'string') return 'unknown';
      let t = s.trim().toLowerCase().replace(/ /g, '_').replace(/-/g, '_');
      t = t.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unknown';
      return t;
    };
    const a = slug(this.set?.level_tr).slice(0, 12);
    const b = slug(this.set?.class_level).slice(0, 8);
    const c = slug(this.set?.subject_tr).slice(0, 36);
    let name = `cheradip_${a}_${b}_${c}`.replace(/_+$/, '');
    if (name.length > 64) name = name.slice(0, 64).replace(/_+$/, '');
    return name;
  }

  /** Sends an edit request exactly like the /question page (pending admin review). */
  submitEditRequest(): void {
    if (!this.editingQid) return;
    const q = this.questions.find((x: any) => x.qid === this.editingQid);
    if (!q) { this.cancelEdit(); return; }
    const origTopic = (q.topic || '').trim();
    const newTopicName = (this.editForm.topic || '').trim();
    // "Edit Topic" rename: table-wide topic rename request for admin approval
    if (this.topicEditMode && !this.editForm.addTopic && newTopicName && newTopicName !== origTopic) {
      const tblQue = q.table || this.subjectQuestionTableNameForPayload();
      const rp: any = {
        qid: this.editingQid,
        question: this.editForm.question || ' ',
        status: 'Topic Update',
        topic: newTopicName,
        subsource: JSON.stringify({ old_topic: origTopic, table: tblQue }),
        table: tblQue,
        type: q.type || '',
        level_tr: this.set?.level_tr || '',
        class_level: this.set?.class_level || '',
        subject_tr: (this.set?.subject_tr || q.subject_tr || q.subject) || '',
        chapter_no: q.chapter_no || '',
        chapter: q.chapter || '',
        topic_no: q.topic_no || '',
      };
      this.api.submitPendingQuestionRequest(rp).subscribe({
        next: () => {
          this.editStatus = 'Topic update submitted for review — all questions under this topic will be renamed once approved.';
          this.editingQid = null;
          this.topicEditMode = false;
        },
        error: () => { this.editStatus = 'Could not submit the topic update. Please try again.'; },
      });
      return;
    }
    const payload: any = {
      qid: this.editingQid,
      question: this.editForm.question || '',
      option_1: this.editForm.option_1 || '',
      option_2: this.editForm.option_2 || '',
      option_3: this.editForm.option_3 || '',
      option_4: this.editForm.option_4 || '',
      answer: this.editForm.answer || '',
      explanation: this.editForm.explanation || '',
      topic: (this.editForm.addTopic && (this.editForm.newTopic || '').trim())
        ? this.editForm.newTopic.trim()
        : (this.editForm.topic || q.topic || ''),
      subsource: this.editForm.subsource || '',
      type: q.type || '',
      level_tr: this.set?.level_tr || '',
      class_level: this.set?.class_level || '',
      subject_tr: (this.set?.subject_tr || q.subject_tr || q.subject) || '',
      table: q.table || this.subjectQuestionTableNameForPayload(),
      chapter_no: q.chapter_no || '',
      chapter: q.chapter || '',
      topic_no: q.topic_no || '',
      level: q.level || '',
      status: 'Update',
    };
    this.api.submitPendingQuestionRequest(payload).subscribe({
      next: () => {
        this.editStatus = 'Thanks! Your changes were submitted and are pending admin review.';
        this.editingQid = null;
      },
      error: () => {
        this.editStatus = 'Could not submit the edit request. Please try again.';
      },
    });
  }
  startExam(id: number): void {
    this.asideOpen = false;
    if (id === this.setId) {
      this.retakeExam();
      return;
    }
    this.router.navigate(['/student/exam-set', id]);
  }

  /** Restart the same exam set from scratch without leaving the page. */
  retakeExam(): void {
    this.asideOpen = false;
    this.clearSession();
    this.answers = {};
    this.result = null;
    this.isSubmitted = false;
    this.timeRemaining = EXAM_DURATION_SEC;
    // A new attempt re-arms the secure-exam guards (they were lifted on submit).
    this.disableAntiCheat();
    this.enableAntiCheat();
    // The retake click is a user gesture, so fullscreen can be entered immediately.
    this.autoEnterFullscreen();
    this.startTimer();
  }

  get resultsHistory(): any[] {
    try {
      const raw = localStorage.getItem('exam_set_results');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  get thisSetResults(): any[] {
    return this.resultsHistory.filter((r: any) => Number(r?.setId) === this.setId);
  }

  get attemptCountThisSet(): number {
    return this.thisSetResults.length;
  }

  get bestScoreThisSet(): number {
    const list = this.thisSetResults;
    return list.length ? Math.max(...list.map((r: any) => Number(r?.score) || 0)) : 0;
  }

  get averageScoreThisSet(): number {
    const list = this.thisSetResults;
    if (!list.length) return 0;
    const sum = list.reduce((a: number, r: any) => a + (Number(r?.score) || 0), 0);
    return Math.round(sum / list.length);
  }

  get currentSubjectKey(): string {
    return (this.set?.subject_tr || '').trim();
  }

  /** Results from exams of the same subject (or falls back to this set). */
  get subjectResults(): any[] {
    const subj = this.currentSubjectKey;
    if (!subj) return this.thisSetResults;
    return this.resultsHistory.filter((r: any) => (r?.subjectTr || '') === subj);
  }

  get subjectTopScore(): number {
    const list = this.subjectResults;
    return list.length ? Math.max(...list.map((r: any) => Number(r?.score) || 0)) : 0;
  }

  get subjectAverageScore(): number {
    const list = this.subjectResults;
    if (!list.length) return 0;
    const sum = list.reduce((a: number, r: any) => a + (Number(r?.score) || 0), 0);
    return Math.round(sum / list.length);
  }

  get totalExamsTaken(): number {
    return this.resultsHistory.length;
  }

  /** Exams in the same Level/Class/Subject (sorted by id), excluding this set. */
  get nextExamSets(): any[] {
    const lvl = (this.set?.level_tr || '').trim();
    const cls = (this.set?.class_level || '').trim();
    const subj = this.currentSubjectKey;
    const list = this.examSets.filter((s: any) =>
      Number(s?.id) !== this.setId &&
      (!lvl || (s?.level_tr || '') === lvl) &&
      (!cls || (s?.class_level || '') === cls) &&
      (!subj || (s?.subject_tr || '') === subj)
    );
    return list.slice(0, 8);
  }

  backToRegularExam(): void {
    this.router.navigate(['/student/regularexam']);
  }
}
