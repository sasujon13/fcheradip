import { Component, OnInit, HostListener, ElementRef } from '@angular/core';
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
export class QuestionComponent implements OnInit {
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
  /** Set of question id (from topicQuestions) that user has selected. */
  selectedQuestionIds: Set<number> = new Set();
  currentPage: number = 1;
  totalPages: number = 1;
  breadcrumbItems: any[] = [];
  isFormMode: boolean = false;
  isEditRoute: boolean = false;
  editQuestion: any | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private elRef: ElementRef<HTMLElement>
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.elRef.nativeElement.contains(target)) return;
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.levelDropdownOpen = false;
    this.classDropdownOpen = false;
    this.groupDropdownOpen = false;
    this.subjectDropdownOpen = false;
  }

  ngOnInit(): void {
    this.loadQuestionLevels();
    this.route.params.subscribe(params => {
      this.currentSubject = params['subject'] || '';
      this.currentChapter = params['chapterName'] || '';
      const id = params['id'];
      const urlSegments = this.route.snapshot.url;
      const lastPath = urlSegments.length ? urlSegments[urlSegments.length - 1].path : '';
      this.isEditRoute = !!id;
      this.isFormMode = lastPath === 'new' || !!id;
      this.editQuestion = null;
      this.updateBreadcrumb();
      if (this.isFormMode && id) {
        this.loadQuestionForEdit(+id);
      } else {
        this.loadData();
      }
    });
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

  /** If the dropdown panel would overflow the right edge, align it to the right so it opens to the left. */
  positionDropdownPanel(event?: MouseEvent): void {
    if (!event?.target) return;
    const wrapper = (event.target as HTMLElement).closest('.filter-dropdown');
    if (!wrapper) return;
    const panel = wrapper.querySelector('.filter-dropdown-panel') as HTMLElement;
    const trigger = wrapper.querySelector('.filter-dropdown-btn') as HTMLElement;
    if (!panel || !trigger) return;
    panel.classList.remove('dropdown-panel-right');
    const tr = trigger.getBoundingClientRect();
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
    this.selectedQuestionIds = new Set();
    this.topicQuestionsLoaded = false;
    if (this.selectedTopicIds.size && this.primarySubject) {
      this.loadQuestionsByTopics();
    } else {
      this.topicQuestions = [];
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
            if (q.id != null && !seenIds.has(q.id)) { seenIds.add(q.id); all.push(q); }
          });
          pending--;
          if (pending === 0) {
            this.topicQuestions = all;
            this.topicQuestionsLoaded = true;
          }
        },
        error: () => {
          pending--;
          if (pending === 0) { this.topicQuestions = all; this.topicQuestionsLoaded = true; }
        }
      });
    });
  }

  toggleQuestionSelection(id: number): void {
    if (this.selectedQuestionIds.has(id)) {
      this.selectedQuestionIds.delete(id);
    } else {
      this.selectedQuestionIds.add(id);
    }
    this.selectedQuestionIds = new Set(this.selectedQuestionIds);
  }

  isQuestionSelected(id: number): boolean {
    return this.selectedQuestionIds.has(id);
  }

  selectAllTopicQuestions(): void {
    this.selectedQuestionIds = new Set(this.topicQuestions.map((q: any) => q.id));
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
    return this.topicQuestions.filter((q: any) => this.selectedQuestionIds.has(q.id));
  }

  /** Smart Question Creator – to be defined later. */
  onSmartQuestionCreator(): void {
    // TODO: define behavior
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

  loadQuestionForEdit(id: number): void {
    this.apiService.getQuestionById(id).subscribe({
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

  onCreateQuestion(): void {
    // Navigate to create question form
    if (this.currentSubject && this.currentChapter) {
      this.router.navigate(['/question', this.currentSubject, 'chapter', this.currentChapter, 'new']);
    }
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadQuestions();
  }

  onQuestionSelect(question: any): void {
    // Navigate to edit question
    if (this.currentSubject && this.currentChapter) {
      this.router.navigate(['/question', this.currentSubject, 'chapter', this.currentChapter, 'question', question.id]);
    }
  }

  onQuestionDelete(id: number): void {
    this.apiService.deleteQuestion(id).subscribe({
      next: () => this.loadQuestions(),
      error: () => this.loadQuestions()
    });
  }

  onSaveQuestion(payload: any): void {
    if (this.editQuestion?.id) {
      this.apiService.updateQuestion(this.editQuestion.id, payload).subscribe({
        next: () => this.goBackToList(),
        error: () => {}
      });
    } else {
      this.apiService.createQuestion(payload).subscribe({
        next: () => this.goBackToList(),
        error: () => {}
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
