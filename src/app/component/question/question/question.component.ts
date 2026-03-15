import { Component, OnInit } from '@angular/core';
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
  selectedSubject: QuestionSubject | null = null;
  chapters: any[] = [];
  /** Topics from subject table (ordered by topic asc). */
  topics: Array<{ id: string; name: string }> = [];
  selectedTopic: string = '';
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
    private apiService: ApiService
  ) { }

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

  onLevelChange(levelTr: string): void {
    this.selectedLevel = levelTr || '';
    this.selectedClass = '';
    this.selectedGroup = '';
    this.classes = [];
    this.groups = [];
    this.selectedSubject = null;
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedTopic = '';
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

  onClassChange(classVal: string): void {
    this.selectedClass = classVal || '';
    this.selectedGroup = '';
    this.selectedSubject = null;
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedTopic = '';
    this.currentSubject = '';
    this.currentChapter = '';
    this.loadGroupsAndSubjects();
    this.router.navigate(['/question']);
  }

  onGroupChange(group: string): void {
    this.selectedGroup = group || '';
    this.selectedSubject = null;
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedTopic = '';
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

  onSubjectSelect(subjectTr: string): void {
    const subject = this.subjects.find(s => s.subject_tr === subjectTr) || null;
    this.onSubjectChange(subject);
  }

  onSubjectChange(subject: QuestionSubject | null): void {
    this.selectedSubject = subject;
    this.chapters = [];
    this.topics = [];
    this.selectedTopic = '';
    this.currentSubject = subject ? subject.subject_tr : '';
    this.currentChapter = '';
    if (subject) {
      this.apiService.getQuestionChapters({
        level_tr: subject.level_tr,
        class_level: subject.class_level,
        subject_tr: subject.subject_tr
      }).subscribe({
        next: (res) => { this.chapters = res.chapters || []; },
        error: () => { this.chapters = []; }
      });
      this.loadTopics();
    }
    // Do not navigate here: going to /question/:subject can match a different route and recreate the
    // component, wiping selectedLevel/selectedSubject. Navigate only when chapter is selected.
  }

  onChapterChange(chapter: string): void {
    this.currentChapter = chapter || '';
    this.selectedTopic = '';
    this.topicQuestions = [];
    this.selectedQuestionIds = new Set();
    if (this.currentSubject && this.selectedSubject) {
      this.loadTopics();
    }
    // Do not navigate: same as subject - avoids route change and component recreate.
  }

  onTopicChange(topic: string): void {
    this.selectedTopic = topic || '';
    this.selectedQuestionIds = new Set();
    this.topicQuestionsLoaded = false;
    if (topic && this.selectedSubject) {
      this.loadQuestionsByTopic();
    } else {
      this.topicQuestions = [];
      this.topicQuestionsLoaded = true;
    }
  }

  private loadTopics(): void {
    if (!this.selectedSubject) return;
    this.apiService.getQuestionTopics({
      level_tr: this.selectedSubject.level_tr,
      class_level: this.selectedSubject.class_level,
      subject_tr: this.selectedSubject.subject_tr,
      chapter: this.currentChapter || undefined
    }).subscribe({
      next: (res) => { this.topics = res.topics || []; },
      error: () => { this.topics = []; }
    });
  }

  private loadQuestionsByTopic(): void {
    if (!this.selectedSubject || !this.selectedTopic) return;
    this.topicQuestionsLoaded = false;
    this.apiService.getQuestionListByTopic({
      level_tr: this.selectedSubject.level_tr,
      class_level: this.selectedSubject.class_level,
      subject_tr: this.selectedSubject.subject_tr,
      chapter: this.currentChapter || undefined,
      topic: this.selectedTopic
    }).subscribe({
      next: (res) => { this.topicQuestions = res.questions || []; this.topicQuestionsLoaded = true; },
      error: () => { this.topicQuestions = []; this.topicQuestionsLoaded = true; }
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
    this.router.navigate(['/question/create'], {
      state: {
        questions,
        context: {
          level_tr: this.selectedLevel,
          class_level: this.selectedClass,
          subject_tr: this.selectedSubject?.subject_tr,
          chapter: this.currentChapter,
          topic: this.selectedTopic
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
    if (this.selectedSubject) {
      this.apiService.getQuestionChapters({
        level_tr: this.selectedSubject.level_tr,
        class_level: this.selectedSubject.class_level,
        subject_tr: this.selectedSubject.subject_tr
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
