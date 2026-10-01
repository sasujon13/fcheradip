import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ExamService } from '../../../service/exam.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
    selector: 'app-liveexam',
    templateUrl: './liveexam.component.html',
    styleUrls: ['./liveexam.component.css'],
    standalone: false
})
export class LiveexamComponent implements OnInit, AfterViewInit {
  loading = false;
  errorMessage = '';
  selectedLevel: string = '';
  selectedGroup: string = '';
  selectedSubject: string = '';
  exams: any[] = [];
  levels = ['Higher Secondary'];
  groups = ['S', 'A', 'B', 'I', 'H', 'M'];

  constructor(
    private examService: ExamService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadExams();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadExams(): void {
    this.loading = true;
    this.errorMessage = '';
    this.examService.getLiveExams(
      this.selectedLevel || undefined,
      undefined,
      this.selectedSubject || undefined
    ).subscribe({
      next: (data: any) => {
        this.exams = data;
        this.loading = false;
      },
      error: () => {
        this.exams = [];
        this.loading = false;
        this.errorMessage = 'Available exams could not be loaded. Please try again.';
      }
    });
  }

  onFilterChange(): void {
    this.loadExams();
  }
}

