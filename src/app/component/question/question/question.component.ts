import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../service/api.service';

@Component({
  selector: 'app-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.css']
})
export class QuestionComponent implements OnInit {
  currentSubject: string = '';
  currentChapter: string = '';
  questions: any[] = [];
  subjects: any[] = [];
  chapters: any[] = [];
  currentPage: number = 1;
  totalPages: number = 1;
  breadcrumbItems: any[] = [];
  /** True when showing create or edit form */
  isFormMode: boolean = false;
  /** True when route has question id (edit mode) */
  isEditRoute: boolean = false;
  /** Set when editing an existing question (loaded from API) */
  editQuestion: any | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService
  ) { }

  ngOnInit(): void {
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
    // Load subjects, chapters, and questions based on current route
    if (this.currentSubject && this.currentChapter) {
      this.loadQuestions();
    } else if (this.currentSubject) {
      this.loadChapters();
    } else {
      this.loadSubjects();
    }
  }

  loadSubjects(): void {
    this.apiService.getSubjects().subscribe(
      (data: any) => {
        this.subjects = data;
      }
    );
  }

  loadChapters(): void {
    if (this.currentSubject) {
      this.apiService.getChaptersBySubject([this.currentSubject]).subscribe(
        (data: any) => {
          this.chapters = data;
        }
      );
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

  onSubjectChange(subject: string): void {
    this.router.navigate(['/question', subject]);
  }

  onChapterChange(chapter: string): void {
    if (this.currentSubject) {
      this.router.navigate(['/question', this.currentSubject, 'chapter', chapter]);
    }
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
