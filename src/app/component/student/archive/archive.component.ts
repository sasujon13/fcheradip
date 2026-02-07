import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../service/exam.service';

@Component({
  selector: 'app-archive',
  templateUrl: './archive.component.html',
  styleUrls: ['./archive.component.css']
})
export class ArchiveComponent implements OnInit {
  selectedLevel: string = '';
  selectedGroup: string = '';
  selectedSubject: string = '';
  selectedType: string = '';
  exams: any[] = [];
  levels = ['PSC', 'JSC', 'SSC', 'HSC'];
  groups = ['S', 'A', 'B', 'I', 'H', 'M'];
  examTypes = [
    { value: '25', label: 'Short (25 questions)' },
    { value: '50', label: 'Middle (50 questions)' },
    { value: '100', label: 'Hard (100 questions)' }
  ];

  constructor(private examService: ExamService) { }

  ngOnInit(): void {
    this.loadExams();
  }

  loadExams(): void {
    this.examService.getArchiveExams(
      this.selectedLevel || undefined,
      this.selectedGroup || undefined,
      this.selectedSubject || undefined,
      this.selectedType || undefined
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

