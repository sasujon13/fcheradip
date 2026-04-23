import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { ApiService } from '../../../service/api.service';
import { LoadingService } from '../../../service/loading.service';

export interface ExamSetItem {
  id: number;
  exam_type: string;
  set_key: string;
  name_label: string;
  level_tr?: string;
  class_level?: string;
  subject_tr?: string;
}

const REGULAREXAM_STORAGE_KEY = 'regularexam_filters';

/** Level from question_levels API. */
interface QuestionLevel {
  level: string;
  level_tr: string;
  label: string;
  sort_order?: number;
}

/** Subject from question_subjects API. */
interface QuestionSubject {
  level_tr: string;
  class_level: string;
  subject_tr: string;
  id: string;
  name: string;
  subject_name?: string;
  subject_code?: string;
  sq?: number;
}

@Component({
  selector: 'app-regularexam',
  templateUrl: './regularexam.component.html',
  styleUrls: ['./regularexam.component.css']
})
export class RegularexamComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Same filter as /question: Level → Class → Group → Subject (no questions loaded or displayed). */
  levels: QuestionLevel[] = [];
  selectedLevel = '';
  classes: Array<{ value: string; label: string }> = [];
  selectedClass = '';
  groups: string[] = [];
  selectedGroup = '';
  subjects: QuestionSubject[] = [];
  selectedSubjectTr = '';

  chapters: Array<{ id: string; name: string }> = [];
  selectedChapters: string[] = [];
  topics: Array<{ id: string; name: string }> = [];
  selectedTopics: string[] = [];

  levelDropdownOpen = false;
  classDropdownOpen = false;
  groupDropdownOpen = false;
  subjectDropdownOpen = false;
  chapterDropdownOpen = false;
  topicDropdownOpen = false;
  private dropdownLeaveKind: string | null = null;
  private dropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  examSets: ExamSetItem[] = [];
  errorMessage = '';
  loading = false;

  constructor(
    private api: ApiService,
    private loadingService: LoadingService
  ) {}

  get selectedLevelLabel(): string {
    if (!this.selectedLevel) return 'Select Level';
    const lvl = this.levels.find(l => l.level_tr === this.selectedLevel);
    return lvl ? lvl.label : this.selectedLevel;
  }

  get selectedClassLabel(): string {
    if (!this.selectedClass) return 'Select Class';
    const c = this.classes.find(x => x.value === this.selectedClass);
    return c ? c.label : this.selectedClass;
  }

  get selectedGroupLabel(): string {
    if (!this.selectedGroup) return 'Select Group';
    return this.selectedGroup;
  }

  get selectedSubjectLabel(): string {
    if (!this.selectedSubjectTr) return 'Select Subject';
    const sub = this.subjects.find(s => s.subject_tr === this.selectedSubjectTr);
    return sub ? (sub.name || sub.subject_tr) : this.selectedSubjectTr;
  }

  get selectedChapterLabel(): string {
    if (!this.selectedChapters.length) return 'Select Chapter';
    if (this.selectedChapters.length === 1) return this.selectedChapters[0];
    return this.selectedChapters.length + ' selected';
  }

  get selectedTopicLabel(): string {
    if (!this.selectedTopics.length) return 'Select Topic';
    if (this.selectedTopics.length === 1) return this.selectedTopics[0];
    return this.selectedTopics.length + ' selected';
  }

  /** Filter exam sets by Level/Class/Subject and by chapters/topics (client-side). */
  get filteredExamSets(): ExamSetItem[] {
    if (!this.examSets.length) return [];
    let list = this.examSets;
    if (this.selectedLevel) {
      list = list.filter(set => (set.level_tr || '') === this.selectedLevel);
    }
    if (this.selectedClass) {
      list = list.filter(set => (set.class_level || '') === this.selectedClass);
    }
    if (this.selectedSubjectTr) {
      list = list.filter(set => (set.subject_tr || '') === this.selectedSubjectTr);
    }
    const chapterSet = new Set(this.selectedChapters.map(s => s.trim()).filter(Boolean));
    const topicSet = new Set(this.selectedTopics.map(s => s.trim()).filter(Boolean));
    if (chapterSet.size === 0 && topicSet.size === 0) return list;
    return list.filter(set => {
      if (set.exam_type === 'chapter') {
        const labelPart = (set.name_label || '').replace(/^\d+:\s*/, '').trim();
        if (chapterSet.size > 0) return chapterSet.has(labelPart);
        return true;
      }
      if (set.exam_type === 'topic') {
        const labelPart = (set.name_label || '').replace(/^\d+\.\d+:\s*/, '').trim();
        if (topicSet.size > 0) return topicSet.has(labelPart);
        return true;
      }
      if (set.exam_type === 'subject') {
        return true;
      }
      return true;
    });
  }

  isChapterSelected(ch: { id: string; name: string }): boolean {
    return this.selectedChapters.indexOf(ch.name) !== -1 || this.selectedChapters.indexOf(ch.id) !== -1;
  }

  isTopicSelected(t: { id: string; name: string }): boolean {
    return this.selectedTopics.indexOf(t.name) !== -1 || this.selectedTopics.indexOf(t.id) !== -1;
  }

  onChapterCheckboxChange(ch: { id: string; name: string }, checked: boolean): void {
    const name = ch.name;
    if (checked) {
      if (this.selectedChapters.indexOf(name) === -1) this.selectedChapters = [...this.selectedChapters, name];
    } else {
      this.selectedChapters = this.selectedChapters.filter(x => x !== name && x !== ch.id);
    }
    this.saveFiltersToStorage();
  }

  onTopicCheckboxChange(t: { id: string; name: string }, checked: boolean): void {
    const name = t.name;
    if (checked) {
      if (this.selectedTopics.indexOf(name) === -1) this.selectedTopics = [...this.selectedTopics, name];
    } else {
      this.selectedTopics = this.selectedTopics.filter(x => x !== name && x !== t.id);
    }
    this.saveFiltersToStorage();
  }

  get allChaptersSelected(): boolean {
    return this.chapters.length > 0 && this.chapters.every(ch => this.isChapterSelected(ch));
  }

  get allTopicsSelected(): boolean {
    return this.topics.length > 0 && this.topics.every(t => this.isTopicSelected(t));
  }

  onChapterSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedChapters = this.chapters.map(c => c.name);
    } else {
      this.selectedChapters = [];
    }
    this.saveFiltersToStorage();
  }

  onTopicSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedTopics = this.topics.map(t => t.name);
    } else {
      this.selectedTopics = [];
    }
    this.saveFiltersToStorage();
  }

  clearChapterFilter(): void {
    this.selectedChapters = [];
    this.saveFiltersToStorage();
  }

  clearTopicFilter(): void {
    this.selectedTopics = [];
    this.saveFiltersToStorage();
  }

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.restoreFiltersFromStorage();
    this.loadQuestionLevels();
    this.loadAllExamSets();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  ngOnDestroy(): void {
    if (this.dropdownLeaveTimer) clearTimeout(this.dropdownLeaveTimer);
  }

  loadQuestionLevels(): void {
    this.api.getQuestionLevels().subscribe({
      next: (res) => {
        const list = (res.levels || []) as QuestionLevel[];
        this.levels = list.slice().sort((a, b) => {
          const orderA = a.sort_order ?? 0;
          const orderB = b.sort_order ?? 0;
          if (orderB !== orderA) return orderB - orderA;
          return (a.level_tr || '').localeCompare(b.level_tr || '');
        });
        this.loadCascadeForRestoredFilters();
      },
      error: () => { this.levels = []; }
    });
  }

  private loadAllExamSets(): void {
    this.loading = true;
    this.api.getExamSets().subscribe({
      next: (res) => {
        this.examSets = res.exam_sets || [];
        this.errorMessage = res.error || '';
        this.loading = false;
      },
      error: (err) => {
        this.examSets = [];
        this.errorMessage = err?.error?.error || 'Failed to load exam sets';
        this.loading = false;
      }
    });
  }

  private restoreFiltersFromStorage(): void {
    try {
      const raw = localStorage.getItem(REGULAREXAM_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.selectedLevel != null) this.selectedLevel = String(data.selectedLevel);
      if (data.selectedClass != null) this.selectedClass = String(data.selectedClass);
      if (data.selectedGroup != null) this.selectedGroup = String(data.selectedGroup);
      if (data.selectedSubjectTr != null) this.selectedSubjectTr = String(data.selectedSubjectTr);
      if (Array.isArray(data.selectedChapters)) this.selectedChapters = data.selectedChapters;
      if (Array.isArray(data.selectedTopics)) this.selectedTopics = data.selectedTopics;
    } catch {
      // ignore invalid stored data
    }
  }

  private saveFiltersToStorage(): void {
    try {
      localStorage.setItem(REGULAREXAM_STORAGE_KEY, JSON.stringify({
        selectedLevel: this.selectedLevel,
        selectedClass: this.selectedClass,
        selectedGroup: this.selectedGroup,
        selectedSubjectTr: this.selectedSubjectTr,
        selectedChapters: this.selectedChapters,
        selectedTopics: this.selectedTopics
      }));
    } catch {
      // ignore
    }
  }

  private loadCascadeForRestoredFilters(): void {
    if (!this.selectedLevel) return;
    this.api.getQuestionClasses(this.selectedLevel).subscribe({
      next: (res) => {
        this.classes = res.classes || [];
        this.loadGroupsAndSubjects();
      },
      error: () => { this.classes = []; }
    });
  }

  onFilterDropdownEnter(): void {
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
    this.dropdownLeaveKind = null;
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
    }
  }

  toggleLevelDropdown(_event?: MouseEvent): void {
    this.levelDropdownOpen = !this.levelDropdownOpen;
    if (this.levelDropdownOpen) {
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
    }
  }

  toggleClassDropdown(_event?: MouseEvent): void {
    this.classDropdownOpen = !this.classDropdownOpen;
    if (this.classDropdownOpen) {
      this.levelDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
    }
  }

  toggleGroupDropdown(_event?: MouseEvent): void {
    this.groupDropdownOpen = !this.groupDropdownOpen;
    if (this.groupDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
    }
  }

  toggleSubjectDropdown(_event?: MouseEvent): void {
    this.subjectDropdownOpen = !this.subjectDropdownOpen;
    if (this.subjectDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
    }
  }

  toggleChapterDropdown(_event?: MouseEvent): void {
    this.chapterDropdownOpen = !this.chapterDropdownOpen;
    if (this.chapterDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.topicDropdownOpen = false;
    }
  }

  toggleTopicDropdown(_event?: MouseEvent): void {
    this.topicDropdownOpen = !this.topicDropdownOpen;
    if (this.topicDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
    }
  }

  onLevelSelect(levelTr: string): void {
    this.levelDropdownOpen = false;
    this.selectedLevel = levelTr || '';
    this.selectedClass = '';
    this.selectedGroup = '';
    this.selectedSubjectTr = '';
    this.selectedChapters = [];
    this.selectedTopics = [];
    this.classes = [];
    this.groups = [];
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.errorMessage = '';
    if (this.selectedLevel) {
      this.api.getQuestionClasses(this.selectedLevel).subscribe({
        next: (res) => {
          this.classes = res.classes || [];
          if (this.classes.length === 1) {
            this.selectedClass = this.classes[0].value;
            this.loadGroupsAndSubjects();
          } else if (this.classes.length === 0) {
            this.loadGroupsAndSubjects();
          }
        },
        error: () => { this.classes = []; this.loadGroupsAndSubjects(); }
      });
    }
    this.saveFiltersToStorage();
  }

  onClassSelect(classVal: string): void {
    this.classDropdownOpen = false;
    this.selectedClass = classVal || '';
    this.selectedGroup = '';
    this.selectedSubjectTr = '';
    this.selectedChapters = [];
    this.selectedTopics = [];
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.errorMessage = '';
    this.loadGroupsAndSubjects();
    this.saveFiltersToStorage();
  }

  onGroupSelect(group: string): void {
    this.groupDropdownOpen = false;
    this.selectedGroup = group || '';
    this.selectedSubjectTr = '';
    this.selectedChapters = [];
    this.selectedTopics = [];
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.errorMessage = '';
    this.loadSubjects();
    this.saveFiltersToStorage();
  }

  onSubjectSelect(subjectTr: string): void {
    this.subjectDropdownOpen = false;
    this.selectedSubjectTr = subjectTr || '';
    this.selectedChapters = [];
    this.selectedTopics = [];
    this.chapters = [];
    this.topics = [];
    this.errorMessage = '';
    if (this.selectedSubjectTr && this.selectedLevel) {
      this.loadChapters();
      this.loadTopics();
    }
    this.saveFiltersToStorage();
  }

  private loadGroupsAndSubjects(): void {
    this.api.getQuestionGroups(this.selectedLevel, this.selectedClass || undefined).subscribe({
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
    this.api.getQuestionSubjects(params).subscribe({
      next: (res) => {
        this.subjects = res.subjects || [];
        if (this.selectedSubjectTr && this.selectedLevel) {
          this.loadChapters();
          this.loadTopics();
        }
      },
      error: () => { this.subjects = []; }
    });
  }

  private loadChapters(): void {
    if (!this.selectedLevel || !this.selectedSubjectTr) return;
    const classLevel = this.selectedClass || this.subjects.find(s => s.subject_tr === this.selectedSubjectTr)?.class_level || '';
    this.api.getQuestionChapters({
      level_tr: this.selectedLevel,
      class_level: classLevel,
      subject_tr: this.selectedSubjectTr
    }).subscribe({
      next: (res) => { this.chapters = res.chapters || []; },
      error: () => { this.chapters = []; }
    });
  }

  private loadTopics(): void {
    if (!this.selectedLevel || !this.selectedSubjectTr) return;
    const classLevel = this.selectedClass || this.subjects.find(s => s.subject_tr === this.selectedSubjectTr)?.class_level || '';
    this.api.getQuestionTopics({
      level_tr: this.selectedLevel,
      class_level: classLevel,
      subject_tr: this.selectedSubjectTr
    }).subscribe({
      next: (res) => { this.topics = res.topics || []; },
      error: () => { this.topics = []; }
    });
  }

}
