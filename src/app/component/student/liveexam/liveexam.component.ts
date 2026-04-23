import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ExamService } from '../../../service/exam.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-liveexam',
  templateUrl: './liveexam.component.html',
  styleUrls: ['./liveexam.component.css']
})
export class LiveexamComponent implements OnInit, AfterViewInit {
  selectedLevel: string = '';
  selectedGroup: string = '';
  selectedSubject: string = '';
  exams: any[] = [];
  levels = ['PSC', 'JSC', 'SSC', 'HSC'];
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
    this.examService.getLiveExams(
      this.selectedLevel || undefined,
      this.selectedGroup || undefined,
      this.selectedSubject || undefined
    ).subscribe(
      (data: any) => {
        this.exams = data;
      }
    );
  }

  onFilterChange(): void {
    this.loadExams();
  }
}

