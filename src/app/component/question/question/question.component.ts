import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ElementRef, ViewChildren, QueryList, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../service/api.service';

/** Level from question_levels API; sort_order = class_level number for ordering. */
export interface QuestionLevel {
  level: string;
  level_tr: string;
  label: string;
  sort_order?: number;
}

/** Subject from question_subjects API (cheradip_hsc.cheradip_subject). */
export interface QuestionSubject {
  level_tr: string;
  class_level: string;
  subject_tr: string;
  id: string;
  name: string;
}

@Component({
  selector: 'app-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.css']
})
export class QuestionComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Current subject slug for route (subject_tr). */
  currentSubject: string = '';
  currentChapter: string = '';
  questions: any[] = [];
  /** Levels from cheradip_hsc (first dropdown). */
  levels: QuestionLevel[] = [];
  /** Selected level (level_tr). */
  selectedLevel: string = '';
  /** Classes for selected level (show dropdown only if classes.length > 1). */
  classes: Array<{ value: string; label: string }> = [];
  selectedClass: string = '';
  /** Groups from cheradip_subject.groups (show only if groups.length > 0). */
  groups: string[] = [];
  selectedGroup: string = '';
  subjects: QuestionSubject[] = [];
  /** Single subject selection. */
  selectedSubjectTr: string = '';
  chapters: Array<{ id: string; name: string }> = [];
  /** Multi-select: chapter ids. */
  selectedChapterIds: Set<string> = new Set();
  chapterDropdownOpen = false;
  levelDropdownOpen = false;
  classDropdownOpen = false;
  groupDropdownOpen = false;
  subjectDropdownOpen = false;
  /** Topics from subject table (ordered by topic asc). */
  topics: Array<{ id: string; name: string }> = [];
  /** Multi-select: topic ids. */
  selectedTopicIds: Set<string> = new Set();
  topicDropdownOpen = false;
  get primarySubject(): QuestionSubject | null {
    if (!this.subjects.length || !this.selectedSubjectTr) return null;
    return this.subjects.find(s => s.subject_tr === this.selectedSubjectTr) || null;
  }
  /** Questions for selected topic (from HSC subject table); user can select which to use. */
  topicQuestions: any[] = [];
  topicQuestionsLoaded = false;
  /** More Filters: unique subsource values from loaded questions; filter by selected (multi-select). */
  subsourceOptions: string[] = [];
  selectedSubsourceIds: Set<string> = new Set();
  moreFiltersOpen = false;
  /** Topics for the current chapter when in form mode (new question); used by question form dropdown. */
  formTopics: Array<{ id: string; name: string; topic_no?: string }> = [];
  /** Set of question id (from topicQuestions) that user has selected. */
  /** Set of question qid (from topicQuestions). */
  selectedQuestionIds: Set<number | string> = new Set();
  currentPage: number = 1;
  totalPages: number = 1;
  breadcrumbItems: any[] = [];
  isFormMode: boolean = false;
  isEditRoute: boolean = false;
  editQuestion: any | null = null;

  @ViewChildren('filterItem') filterItems!: QueryList<ElementRef<HTMLElement>>;

  /** Layout per question index: '1row' | '2row' | '4row' based on content width. */
  optionsLayouts: ('1row' | '2row' | '4row')[] = [];
  private readonly OPTIONS_GAP_PX = 24;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) { }

  ngAfterViewInit(): void {
    const run = () => this.updateFilterLineStartMargins();
    setTimeout(run, 0);
    this.filterItems.changes.subscribe(() => setTimeout(run, 0));
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateFilterLineStartMargins();
    this.measureOptionsLayouts();
  }

  /** Mark the first element of each wrapped line so only they get margin-left: 21px */
  private updateFilterLineStartMargins(): void {
    if (!this.filterItems?.length) return;
    const items = this.filterItems.map(f => f.nativeElement);
    const LINE_THRESHOLD = 2; // px tolerance for same line
    let prevTop = -1;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const isFirstOnLine = i > 0 && (prevTop < 0 || rect.top > prevTop + LINE_THRESHOLD);
      if (isFirstOnLine) {
        el.classList.add('filter-item-line-start');
      } else {
        el.classList.remove('filter-item-line-start');
      }
      prevTop = rect.top;
    });
  }

  /** Timer for auto-close when cursor leaves dropdown (1000ms). */
  private dropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  private dropdownLeaveKind: string | null = null;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.elRef.nativeElement.contains(target) && target.closest('.filter-dropdown')) return;
    this.closeAllDropdowns();
  }

  onFilterDropdownEnter(): void {
    this.dropdownLeaveKind = null;
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
  }

  onFilterDropdownLeave(kind: string): void {
    this.dropdownLeaveKind = kind;
    this.dropdownLeaveTimer = setTimeout(() => {
      if (this.dropdownLeaveKind === kind) this.closeDropdownByKind(kind);
      this.dropdownLeaveTimer = null;
    }, 1000);
  }

  private closeDropdownByKind(kind: string): void {
    switch (kind) {
      case 'level': this.levelDropdownOpen = false; break;
      case 'class': this.classDropdownOpen = false; break;
      case 'group': this.groupDropdownOpen = false; break;
      case 'subject': this.subjectDropdownOpen = false; break;
      case 'chapter': this.chapterDropdownOpen = false; break;
      case 'topic': this.topicDropdownOpen = false; break;
      case 'moreFilters': this.moreFiltersOpen = false; break;
    }
  }

  private closeAllDropdowns(): void {
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
    this.dropdownLeaveKind = null;
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.levelDropdownOpen = false;
    this.classDropdownOpen = false;
    this.groupDropdownOpen = false;
    this.subjectDropdownOpen = false;
    this.moreFiltersOpen = false;
  }

  ngOnInit(): void {
    this.loadQuestionLevels();
    this.route.params.subscribe(params => {
      this.currentSubject = params['subject'] || '';
      this.currentChapter = params['chapterName'] || '';
      const qid = params['id'];
      const urlSegments = this.route.snapshot.url;
      const lastPath = urlSegments.length ? urlSegments[urlSegments.length - 1].path : '';
      this.isEditRoute = !!qid;
      this.isFormMode = lastPath === 'new' || !!qid;
      this.editQuestion = null;
      this.updateBreadcrumb();
      if (this.isFormMode && qid) {
        this.loadQuestionForEdit(qid);
      } else {
        this.loadData();
        if (this.isFormMode && !qid && this.primarySubject && this.currentChapter) {
          this.loadFormTopics(this.currentChapter);
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.dropdownLeaveTimer) clearTimeout(this.dropdownLeaveTimer);
  }

  /** Load levels from cheradip_hsc (first dropdown). Order by class_level descending (highest first). */
  loadQuestionLevels(): void {
    this.apiService.getQuestionLevels().subscribe({
      next: (res) => {
        const list: QuestionLevel[] = (res.levels || []) as QuestionLevel[];
        this.levels = list.slice().sort((a, b) => {
          const orderA = a.sort_order ?? 0;
          const orderB = b.sort_order ?? 0;
          if (orderB !== orderA) return orderB - orderA; // descending
          return ((a.level_tr || '').localeCompare(b.level_tr || ''));
        });
      },
      error: () => { this.levels = []; }
    });
  }

  get selectedLevelLabel(): string {
    if (!this.selectedLevel) return 'Select Level';
    const lvl = this.levels.find(l => l.level_tr === this.selectedLevel);
    return lvl ? lvl.label : this.selectedLevel;
  }

  toggleLevelDropdown(event?: MouseEvent): void {
    this.levelDropdownOpen = !this.levelDropdownOpen;
    if (this.levelDropdownOpen) {
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onLevelSelect(levelTr: string): void {
    this.levelDropdownOpen = false;
    this.onLevelChange(levelTr || '');
  }

  onLevelChange(levelTr: string): void {
    this.selectedLevel = levelTr || '';
    this.selectedClass = '';
    this.selectedGroup = '';
    this.classes = [];
    this.groups = [];
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.currentSubject = '';
    this.currentChapter = '';
    if (!this.selectedLevel) {
      this.router.navigate(['/question']);
      return;
    }
    this.apiService.getQuestionClasses(this.selectedLevel).subscribe({
      next: (res) => {
        this.classes = res.classes || [];
        if (this.classes.length === 1) {
          this.selectedClass = this.classes[0].value;
          this.loadGroupsAndSubjects();
        } else {
          if (this.classes.length === 0) this.loadGroupsAndSubjects();
          else this.loadGroups();
        }
      },
      error: () => { this.classes = []; this.loadGroupsAndSubjects(); }
    });
    this.router.navigate(['/question']);
  }

  get selectedClassLabel(): string {
    if (!this.selectedClass) return 'Select Class';
    const c = this.classes.find(x => x.value === this.selectedClass);
    return c ? c.label : this.selectedClass;
  }

  toggleClassDropdown(event?: MouseEvent): void {
    this.classDropdownOpen = !this.classDropdownOpen;
    if (this.classDropdownOpen) {
      this.levelDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onClassSelect(classVal: string): void {
    this.classDropdownOpen = false;
    this.onClassChange(classVal || '');
  }

  onClassChange(classVal: string): void {
    this.selectedClass = classVal || '';
    this.selectedGroup = '';
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.currentSubject = '';
    this.currentChapter = '';
    this.loadGroupsAndSubjects();
    this.router.navigate(['/question']);
  }

  get selectedGroupLabel(): string {
    if (!this.selectedGroup) return 'Select Group';
    return this.selectedGroup;
  }

  toggleGroupDropdown(event?: MouseEvent): void {
    this.groupDropdownOpen = !this.groupDropdownOpen;
    if (this.groupDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onGroupSelect(group: string): void {
    this.groupDropdownOpen = false;
    this.onGroupChange(group || '');
  }

  onGroupChange(group: string): void {
    this.selectedGroup = group || '';
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.currentSubject = '';
    this.currentChapter = '';
    this.loadSubjects();
    this.router.navigate(['/question']);
  }

  private loadGroups(): void {
    this.groups = [];
    this.apiService.getQuestionGroups(this.selectedLevel, this.selectedClass || undefined).subscribe({
      next: (res) => { this.groups = res.groups || []; },
      error: () => { this.groups = []; }
    });
  }

  private loadGroupsAndSubjects(): void {
    this.apiService.getQuestionGroups(this.selectedLevel, this.selectedClass || undefined).subscribe({
      next: (res) => {
        this.groups = res.groups || [];
        this.loadSubjects();
      },
      error: () => { this.groups = []; this.loadSubjects(); }
    });
  }

  private loadSubjects(): void {
    const params: { level_tr: string; class_level?: string; group?: string } = { level_tr: this.selectedLevel };
    if (this.selectedClass) params.class_level = this.selectedClass;
    if (this.selectedGroup) params.group = this.selectedGroup;
    this.apiService.getQuestionSubjects(params).subscribe({
      next: (res) => { this.subjects = res.subjects || []; },
      error: () => { this.subjects = []; }
    });
  }

  get selectedSubjectLabel(): string {
    if (!this.selectedSubjectTr) return 'Select Subject';
    const sub = this.subjects.find(s => s.subject_tr === this.selectedSubjectTr);
    return sub ? (sub.name || sub.subject_tr) : this.selectedSubjectTr;
  }

  toggleSubjectDropdown(event?: MouseEvent): void {
    this.subjectDropdownOpen = !this.subjectDropdownOpen;
    if (this.subjectDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onSubjectSelect(subjectTr: string): void {
    this.subjectDropdownOpen = false;
    this.onSubjectChange(subjectTr || '');
  }

  onSubjectChange(subjectTr: string): void {
    this.selectedSubjectTr = subjectTr || '';
    this.onSubjectSelectionChange();
  }

  private onSubjectSelectionChange(): void {
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.topicQuestions = [];
    this.subsourceOptions = [];
    this.selectedSubsourceIds = new Set();
    this.selectedQuestionIds = new Set();
    const sub = this.primarySubject;
    this.currentSubject = sub ? sub.subject_tr : '';
    this.currentChapter = '';
    if (sub) {
      this.apiService.getQuestionChapters({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      }).subscribe({
        next: (res) => { this.chapters = res.chapters || []; },
        error: () => { this.chapters = []; }
      });
      this.loadTopics();
    }
  }

  toggleChapterDropdown(event?: MouseEvent): void {
    this.chapterDropdownOpen = !this.chapterDropdownOpen;
    if (this.chapterDropdownOpen) {
      this.topicDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  get allChaptersSelected(): boolean {
    return this.chapters.length > 0 && this.chapters.every(c => this.selectedChapterIds.has(c.id));
  }

  onChapterSelectAllToggle(): void {
    if (this.allChaptersSelected) {
      this.selectedChapterIds = new Set();
    } else {
      this.selectedChapterIds = new Set(this.chapters.map(c => c.id));
    }
    this.onChapterSelectionChange();
  }

  onChapterSelect(chapterId: string): void {
    const next = new Set(this.selectedChapterIds);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    this.selectedChapterIds = next;
    this.onChapterSelectionChange();
  }

  clearChapterSelection(): void {
    this.selectedChapterIds = new Set();
    this.onChapterSelectionChange();
  }

  get selectedChapterName(): string {
    if (this.selectedChapterIds.size === 0) return 'Select Chapter';
    if (this.selectedChapterIds.size === 1) {
      const ch = this.chapters.find(c => this.selectedChapterIds.has(c.id));
      return ch ? ch.name : '';
    }
    return this.selectedChapterIds.size + ' chapters';
  }

  private onChapterSelectionChange(): void {
    this.topics = [];
    this.selectedTopicIds = new Set();
    this.topicDropdownOpen = false;
    this.topicQuestions = [];
    this.subsourceOptions = [];
    this.selectedSubsourceIds = new Set();
    this.selectedQuestionIds = new Set();
    const firstCh = this.chapters.find(c => this.selectedChapterIds.has(c.id));
    this.currentChapter = firstCh ? firstCh.name : '';
    this.loadTopics();
  }

  toggleTopicDropdown(event?: MouseEvent): void {
    this.topicDropdownOpen = !this.topicDropdownOpen;
    if (this.topicDropdownOpen) {
      this.chapterDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  /** Position dropdown panel: flip to right if it would overflow; reduce max-height so gap to window bottom is at least 100px. */
  positionDropdownPanel(event?: MouseEvent): void {
    if (!event?.target) return;
    const wrapper = (event.target as HTMLElement).closest('.filter-dropdown');
    if (!wrapper) return;
    const panel = wrapper.querySelector('.filter-dropdown-panel') as HTMLElement;
    const trigger = wrapper.querySelector('.filter-dropdown-btn') as HTMLElement;
    if (!panel || !trigger) return;
    panel.classList.remove('dropdown-panel-right');
    panel.style.maxHeight = '';
    const tr = trigger.getBoundingClientRect();
    const marginTop = 4;
    const minGapToBottom = 100;
    const defaultMaxHeight = 600;
    const minPanelHeight = 150;
    const spaceBelow = window.innerHeight - tr.bottom - marginTop;
    const maxHeightToFit = spaceBelow - minGapToBottom;
    const maxHeight = Math.min(defaultMaxHeight, Math.max(minPanelHeight, maxHeightToFit));
    panel.style.maxHeight = maxHeight + 'px';
    const pw = panel.offsetWidth;
    if (tr.left + pw > window.innerWidth) {
      panel.classList.add('dropdown-panel-right');
    }
  }

  get allTopicsSelected(): boolean {
    return this.topics.length > 0 && this.topics.every(t => this.selectedTopicIds.has(t.id));
  }

  onTopicSelectAllToggle(): void {
    if (this.allTopicsSelected) {
      this.selectedTopicIds = new Set();
    } else {
      this.selectedTopicIds = new Set(this.topics.map(t => t.id));
    }
    this.onTopicSelectionChange();
  }

  onTopicSelect(topicId: string): void {
    const next = new Set(this.selectedTopicIds);
    if (next.has(topicId)) next.delete(topicId);
    else next.add(topicId);
    this.selectedTopicIds = next;
    this.onTopicSelectionChange();
  }

  clearTopicSelection(): void {
    this.selectedTopicIds = new Set();
    this.onTopicSelectionChange();
  }

  get selectedTopicName(): string {
    if (this.selectedTopicIds.size === 0) return 'Select Topic';
    if (this.selectedTopicIds.size === 1) {
      const t = this.topics.find(x => this.selectedTopicIds.has(x.id));
      return t ? t.name : '';
    }
    return this.selectedTopicIds.size + ' topics';
  }

  private onTopicSelectionChange(): void {
    this.topicQuestions = [];
    this.subsourceOptions = [];
    this.selectedSubsourceIds = new Set();
    this.selectedQuestionIds = new Set();
    this.topicQuestionsLoaded = false;
    if (this.selectedTopicIds.size && this.primarySubject) {
      this.loadQuestionsByTopics();
    } else {
      this.topicQuestions = [];
      this.subsourceOptions = [];
      this.selectedSubsourceIds = new Set();
      this.topicQuestionsLoaded = true;
    }
  }

  private loadTopics(): void {
    const sub = this.primarySubject;
    if (!sub) return;
    if (this.selectedChapterIds.size === 0) {
      this.apiService.getQuestionTopics({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      }).subscribe({
        next: (res) => { this.topics = res.topics || []; },
        error: () => { this.topics = []; }
      });
      return;
    }
    const done: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();
    let pending = this.selectedChapterIds.size;
    this.selectedChapterIds.forEach(chapterId => {
      const chapterParam = this.chapters.find(c => c.id === chapterId);
      const chapterName = chapterParam?.name ?? chapterId;
      this.apiService.getQuestionTopics({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr,
        chapter: chapterName
      }).subscribe({
        next: (res) => {
          (res.topics || []).forEach((t: { id: string; name: string }) => {
            if (!seen.has(t.id)) { seen.add(t.id); done.push(t); }
          });
          pending--;
          if (pending === 0) this.topics = done.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        },
        error: () => { pending--; if (pending === 0) this.topics = done; }
      });
    });
  }

  private loadQuestionsByTopics(): void {
    const sub = this.primarySubject;
    if (!sub || !this.selectedTopicIds.size) return;
    this.topicQuestionsLoaded = false;
    const all: any[] = [];
    const seenIds = new Set<number>();
    let pending = this.selectedTopicIds.size;
    const chapterParam = this.selectedChapterIds.size === 1
      ? (this.chapters.find(c => this.selectedChapterIds.has(c.id))?.name)
      : undefined;
    this.selectedTopicIds.forEach(topicId => {
      const topicName = this.topics.find(t => t.id === topicId)?.name ?? topicId;
      this.apiService.getQuestionListByTopic({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr,
        chapter: chapterParam || undefined,
        topic: topicName
      }).subscribe({
        next: (res) => {
          (res.questions || []).forEach((q: any) => {
            if (all.length >= 999) return;
            const qid = q.qid;
            if (qid != null && !seenIds.has(qid)) {
              seenIds.add(qid);
              all.push(q);
            }
          });
          pending--;
          if (pending === 0) {
            this.topicQuestions = all.slice(0, 999);
            this.updateSubsourceOptions();
            this.topicQuestionsLoaded = true;
            setTimeout(() => this.measureOptionsLayouts(), 80);
          }
        },
        error: () => {
          pending--;
          if (pending === 0) {
            this.topicQuestions = all.slice(0, 999);
            this.updateSubsourceOptions();
            this.topicQuestionsLoaded = true;
            setTimeout(() => this.measureOptionsLayouts(), 80);
          }
        }
      });
    });
  }

  private updateSubsourceOptions(): void {
    const set = new Set<string>();
    (this.topicQuestions || []).forEach((q: any) => {
      const s = (q.subsource != null ? String(q.subsource).trim() : '');
      if (s) set.add(s);
    });
    this.subsourceOptions = Array.from(set).sort();
    this.selectedSubsourceIds = new Set([...this.selectedSubsourceIds].filter(s => set.has(s)));
  }

  /** Displayed list: filtered by selected subsources when any selected; empty set = show all. */
  getDisplayedQuestions(): { q: any; fullIndex: number }[] {
    const list = this.selectedSubsourceIds.size === 0
      ? this.topicQuestions
      : this.topicQuestions.filter((q: any) => this.selectedSubsourceIds.has((q.subsource != null ? String(q.subsource).trim() : '')));
    return list.map((q: any) => ({ q, fullIndex: this.topicQuestions.indexOf(q) }));
  }

  get allSubsourcesSelected(): boolean {
    return this.subsourceOptions.length > 0 && this.selectedSubsourceIds.size === this.subsourceOptions.length;
  }

  get moreFiltersLabel(): string {
    const n = this.selectedSubsourceIds.size;
    return n === 0 ? 'More Filters' : `More Filters (${n})`;
  }

  onSubsourceSelectAllToggle(): void {
    if (this.allSubsourcesSelected) {
      this.selectedSubsourceIds = new Set();
    } else {
      this.selectedSubsourceIds = new Set(this.subsourceOptions);
    }
  }

  onSubsourceToggle(src: string): void {
    const next = new Set(this.selectedSubsourceIds);
    if (next.has(src)) next.delete(src);
    else next.add(src);
    this.selectedSubsourceIds = next;
  }

  clearSubsourceSelection(): void {
    this.selectedSubsourceIds = new Set();
  }

  toggleMoreFiltersDropdown(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.moreFiltersOpen = !this.moreFiltersOpen;
  }

  /** Returns true if any option in the container has content wrapped to multiple lines. */
  private optionContentWrapped(container: HTMLElement): boolean {
    return this.optionContentWrappedCount(container) > 0;
  }

  /** Returns how many options in the container have content wrapped to multiple lines. */
  private optionContentWrappedCount(container: HTMLElement): number {
    const opts = container.querySelectorAll<HTMLElement>('.topic-question-opt');
    let count = 0;
    for (let i = 0; i < opts.length; i++) {
      const el = opts[i];
      const style = getComputedStyle(el);
      const lh = parseFloat(style.lineHeight);
      const fs = parseFloat(style.fontSize);
      const singleLineH = (isNaN(lh) || lh <= 0 ? fs * 1.2 : lh);
      if (el.offsetHeight > singleLineH * 1.25) count++;
    }
    return count;
  }

  /** For each question try 4 cols → if options wrap try 2 cols → if still wrap use 1 col. */
  measureOptionsLayouts(): void {
    if (!this.topicQuestions?.length) {
      this.optionsLayouts = [];
      this.cdr.markForCheck();
      return;
    }
    const host = this.elRef.nativeElement;
    const listEl = host.querySelector<HTMLElement>('.topic-questions-list');
    const items = host.querySelectorAll<HTMLElement>('.topic-question-item');
    const layouts: ('1row' | '2row' | '4row')[] = new Array(this.topicQuestions.length);

    for (let i = 0; i < this.topicQuestions.length; i++) layouts[i] = '2row';
    const container = items[0]?.querySelector<HTMLElement>('.topic-question-options');
    if (!container) {
      this.optionsLayouts = layouts;
      this.cdr.markForCheck();
      return;
    }

    if (listEl) listEl.classList.add('topic-questions-list-measure');
    this.optionsLayouts = this.topicQuestions.map(() => '1row');
    this.cdr.markForCheck();

    requestAnimationFrame(() => {
      const step1: ('1row' | '2row')[] = new Array(this.topicQuestions.length);
      for (let index = 0; index < this.topicQuestions.length; index++) step1[index] = '1row';
      items.forEach((item, index) => {
        const cont = item.querySelector<HTMLElement>('.topic-question-options');
        if (!cont) return;
        const opts = cont.querySelectorAll<HTMLElement>('.topic-question-opt');
        if (opts.length <= 1) return;
        step1[index] = this.optionContentWrapped(cont) ? '2row' : '1row';
      });
      for (let i = 0; i < this.topicQuestions.length; i++) layouts[i] = step1[i];
      this.optionsLayouts = layouts.slice();
      this.cdr.markForCheck();

      requestAnimationFrame(() => {
        for (let index = 0; index < this.topicQuestions.length; index++) {
          if (step1[index] !== '2row') continue;
          const cont = items[index]?.querySelector<HTMLElement>('.topic-question-options');
          if (!cont) continue;
          /* Only switch to 1 column when 3 or more options wrap in 2-column layout */
          if (this.optionContentWrappedCount(cont) >= 3) layouts[index] = '4row';
        }
        if (listEl) listEl.classList.remove('topic-questions-list-measure');
        this.optionsLayouts = layouts.slice();
        this.cdr.markForCheck();
      });
    });
  }

  /** Max questions shown (no navigating past this). */
  readonly maxTopicQuestionsShown = 999;

  /** Serial number for loaded questions list: 001, 002, ... 999. */
  formatSl(index: number): string {
    return (index + 1).toString().padStart(3, '0');
  }

  /** Get question text for display; if type is সৃজনশীল প্রশ্ন, put each (ক)(খ)(গ)(ঘ) on a new line and use (ক)(খ)(গ)(ঘ) labels. */
  getQuestionDisplayText(q: { question?: unknown; type?: string }): string {
    const raw = q?.question != null ? String(q.question).trim() : '';
    if (!raw) return '';
    const type = (q?.type ?? '').toString().trim();
    if (type !== 'সৃজনশীল প্রশ্ন') return raw;
    const withNewlines = raw
      .replace(/\s+(ক\.|খ\.|গ\.|ঘ\.)/g, '\n$1')
      .replace(/([।,])\s*(ক\.|খ\.|গ\.|ঘ\.)/g, '$1\n$2');
    return withNewlines
      .replace(/ক\./g, '(ক)')
      .replace(/খ\./g, '(খ)')
      .replace(/গ\./g, '(গ)')
      .replace(/ঘ\./g, '(ঘ)');
  }

  /** For সৃজনশীল প্রশ্ন: { intro, parts }; parts get 22px indent on wrap. Otherwise { intro: full text, parts: [] }. */
  getQuestionDisplayStructure(q: { question?: unknown; type?: string }): { intro: string; parts: string[] } {
    const full = this.getQuestionDisplayText(q);
    if (!full) return { intro: '', parts: [] };
    const type = (q?.type ?? '').toString().trim();
    if (type !== 'সৃজনশীল প্রশ্ন') return { intro: full, parts: [] };
    const lines = full.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) return { intro: full, parts: [] };
    const intro = lines[0];
    const parts = lines.slice(1);
    return { intro, parts };
  }

  /** Display text for option value (plain text; JSON has been removed from DB). */
  getOptionDisplayText(opt: unknown): string {
    if (opt == null) return '';
    return typeof opt === 'string' ? opt.trim() : String(opt);
  }

  toggleQuestionSelection(qid: number | string): void {
    if (this.selectedQuestionIds.has(qid)) {
      this.selectedQuestionIds.delete(qid);
    } else {
      this.selectedQuestionIds.add(qid);
    }
    this.selectedQuestionIds = new Set(this.selectedQuestionIds);
  }

  /** Row click: toggle selection when clicking anywhere except the checkbox (checkbox (change) handles itself). */
  onQuestionRowClick(event: MouseEvent, qid: number | string): void {
    const target = event.target as HTMLElement;
    if (target.closest('input[type="checkbox"]')) return;
    this.toggleQuestionSelection(qid);
  }

  /** Sync selection from checkbox (change) so the check icon shows when clicking the box. */
  setQuestionSelection(qid: number | string, checked: boolean): void {
    if (checked) {
      this.selectedQuestionIds.add(qid);
    } else {
      this.selectedQuestionIds.delete(qid);
    }
    this.selectedQuestionIds = new Set(this.selectedQuestionIds);
  }

  isQuestionSelected(qid: number | string): boolean {
    return this.selectedQuestionIds.has(qid);
  }

  /** True when all displayed (possibly subsource-filtered) questions are selected. */
  get allTopicQuestionsSelected(): boolean {
    const displayed = this.getDisplayedQuestions();
    return displayed.length > 0 && displayed.every(item => this.selectedQuestionIds.has(item.q.qid));
  }

  /** Toggle between select all and unselect all for displayed questions. */
  toggleSelectAllTopicQuestions(): void {
    const displayed = this.getDisplayedQuestions();
    if (this.allTopicQuestionsSelected) {
      const toRemove = new Set(displayed.map(item => item.q.qid));
      this.selectedQuestionIds = new Set([...this.selectedQuestionIds].filter(id => !toRemove.has(id)));
    } else {
      displayed.forEach(item => this.selectedQuestionIds.add(item.q.qid));
      this.selectedQuestionIds = new Set(this.selectedQuestionIds);
    }
  }

  selectAllTopicQuestions(): void {
    this.selectedQuestionIds = new Set(this.topicQuestions.map((q: any) => q.qid));
  }

  clearTopicQuestionSelection(): void {
    this.selectedQuestionIds = new Set();
  }

  /** Selected count for floating button. */
  get selectedCount(): number {
    return this.selectedQuestionIds?.size ?? 0;
  }

  /** Selected question objects (from topicQuestions) to pass to creator page. */
  get selectedQuestionsForCreate(): any[] {
    if (!this.topicQuestions.length) return [];
    return this.topicQuestions.filter((q: any) => this.selectedQuestionIds.has(q.qid));
  }

  /** Live Chat – open chat or external link. */
  onLiveChat(): void {
    // TODO: open live chat widget or navigate to chat
  }

  /** Navigate to create page with selected questions (click on "Create Question (N Selected)"). */
  goToCreateQuestion(): void {
    const questions = this.selectedQuestionsForCreate;
    if (!questions.length) return;
    const sub = this.primarySubject;
    const firstTopic = this.selectedTopicIds.size ? (this.topics.find(t => this.selectedTopicIds.has(t.id))?.name ?? '') : '';
    this.router.navigate(['/question/create'], {
      state: {
        questions,
        context: {
          level_tr: this.selectedLevel,
          class_level: this.selectedClass,
          subject_tr: sub?.subject_tr,
          chapter: this.currentChapter,
          topic: firstTopic
        }
      }
    });
  }

  loadQuestionForEdit(qid: number | string): void {
    this.apiService.getQuestionById(qid).subscribe({
      next: (q) => { this.editQuestion = q; },
      error: () => { this.isFormMode = false; this.loadData(); }
    });
  }

  updateBreadcrumb(): void {
    this.breadcrumbItems = [];
    if (this.currentSubject) {
      this.breadcrumbItems.push({ label: this.currentSubject });
    }
    if (this.currentChapter) {
      this.breadcrumbItems.push({ label: this.currentChapter });
    }
  }

  loadData(): void {
    if (this.currentSubject && this.currentChapter) {
      this.loadQuestions();
    }
  }

  /** Load topics for the given chapter (for new-question form dropdown). */
  loadFormTopics(chapterIdOrName: string): void {
    const sub = this.primarySubject;
    if (!sub) {
      this.formTopics = [];
      return;
    }
    this.apiService.getQuestionTopics({
      level_tr: sub.level_tr,
      class_level: sub.class_level,
      subject_tr: sub.subject_tr,
      chapter: chapterIdOrName
    }).subscribe({
      next: (res) => { this.formTopics = res.topics || []; },
      error: () => { this.formTopics = []; }
    });
  }

  loadChapters(): void {
    const sub = this.primarySubject;
    if (sub) {
      this.apiService.getQuestionChapters({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      }).subscribe({
        next: (res) => { this.chapters = res.chapters || []; },
        error: () => { this.chapters = []; }
      });
    }
  }

  loadQuestions(): void {
    const params: any = {};
    if (this.currentSubject) params['subject'] = this.currentSubject;
    if (this.currentChapter) params['chapter'] = this.currentChapter;
    this.apiService.getQuestions(params).subscribe({
      next: (data: any) => {
        this.questions = Array.isArray(data) ? data : (data?.results ?? data?.data ?? []);
        this.totalPages = Math.max(1, Math.ceil(this.questions.length / 10));
      },
      error: () => { this.questions = []; this.totalPages = 1; }
    });
  }

  onSearch(searchTerm: string): void {
    // Implement search functionality
  }

  /** Navigate to question-creator page with no selection (from FAB or "Create Question" when nothing selected). */
  goToQuestionCreator(): void {
    this.router.navigate(['/question/create'], {
      state: {
        questions: [],
        context: this.primarySubject ? {
          level_tr: this.selectedLevel,
          class_level: this.selectedClass,
          subject_tr: this.primarySubject.subject_tr,
          chapter: this.currentChapter,
          topic: this.selectedTopicIds.size ? (this.topics.find(t => this.selectedTopicIds.has(t.id))?.name ?? '') : ''
        } : undefined
      }
    });
  }

  /** Navigate to question-creator page for Smart Question Creator flow. */
  goToSmartQuestionCreator(): void {
    this.router.navigate(['/question/create'], {
      state: { smartCreator: true, questions: [], context: this.primarySubject ? {
        level_tr: this.selectedLevel,
        class_level: this.selectedClass,
        subject_tr: this.primarySubject.subject_tr,
        chapter: this.currentChapter,
        topic: this.selectedTopicIds.size ? (this.topics.find(t => this.selectedTopicIds.has(t.id))?.name ?? '') : ''
      } : undefined }
    });
  }

  onCreateQuestion(): void {
    // Navigate to question-creator page (same as "Create Question" button)
    this.goToQuestionCreator();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadQuestions();
  }

  onQuestionSelect(question: any): void {
    const qid = question.qid;
    if (this.currentSubject && this.currentChapter && qid != null) {
      this.router.navigate(['/question', this.currentSubject, 'chapter', this.currentChapter, 'question', qid]);
    }
  }

  onQuestionDelete(qid: number | string): void {
    this.apiService.deleteQuestion(qid).subscribe({
      next: () => this.loadQuestions(),
      error: () => this.loadQuestions()
    });
  }

  onSaveQuestion(payload: any): void {
    if (this.editQuestion?.qid) {
      this.apiService.updateQuestion(this.editQuestion.qid, payload).subscribe({
        next: () => this.goBackToList(),
        error: () => {}
      });
    } else {
      const sub = this.primarySubject;
      this.apiService.submitPendingQuestion({
        level_tr: sub?.level_tr ?? '',
        class_level: sub?.class_level ?? this.selectedClass ?? '',
        subject_tr: this.currentSubject || payload.subject || '',
        chapter_no: payload.chapter_no || (this.chapters.find(c => c.name === payload.chapter || c.id === payload.chapter)?.id) || payload.chapter,
        chapter: payload.chapter || this.currentChapter,
        topic_no: payload.topic_no || '',
        topic: payload.topic || '',
        question: payload.question || payload.text || '',
        option_1: payload.option_1,
        option_2: payload.option_2,
        option_3: payload.option_3,
        option_4: payload.option_4,
        answer: payload.answer || '',
        explanation: payload.explanation || '',
        type: payload.type || 'CQ'
      }).subscribe({
        next: () => {
          this.goBackToList();
        },
        error: (err) => {}
      });
    }
  }

  onCancelForm(): void {
    this.goBackToList();
  }

  private goBackToList(): void {
    this.router.navigate(['/question', this.currentSubject, 'chapter', this.currentChapter]);
  }
}
