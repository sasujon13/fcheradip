import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../service/exam.service';

@Component({
  selector: 'app-liveexam',
  templateUrl: './liveexam.component.html',
  styleUrls: ['./liveexam.component.css']
})
export class LiveexamComponent implements OnInit {
  selectedLevel: string = '';
  selectedGroup: string = '';
  selectedSubject: string = '';
  exams: any[] = [];
  levels = ['PSC', 'JSC', 'SSC', 'HSC'];
  groups = ['S', 'A', 'B', 'I', 'H', 'M'];

  constructor(private examService: ExamService) { }

  ngOnInit(): void {
    this.loadExams();
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

