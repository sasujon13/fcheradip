import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ExamService } from '../../../service/exam.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-archive',
  templateUrl: './archive.component.html',
  styleUrls: ['./archive.component.css']
})
export class ArchiveComponent implements OnInit, AfterViewInit {
  selectedLevel: string = '';
  selectedGroup: string = '';
  selectedSubject: string = '';
  selectedType: string = '';
  exams: any[] = [];
  levels = ['PSC', 'JSC', 'SSC', 'HSC'];
  groups = [
    { value: 'S', label: 'Science' },
    { value: 'A', label: 'Humanities' },
    { value: 'B', label: 'Business' },
    { value: 'I', label: 'Islamic Studies' },
    { value: 'H', label: 'Home Economics' },
    { value: 'M', label: 'Music' }
  ];
  examTypes = [
    { value: '25', label: 'Short (25 questions)' },
    { value: '50', label: 'Middle (50 questions)' },
    { value: '100', label: 'Hard (100 questions)' }
  ];

  levelDropdownOpen = false;
  groupDropdownOpen = false;
  typeDropdownOpen = false;
  private dropdownLeaveKind: string | null = null;
  private dropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private examService: ExamService,
    private loadingService: LoadingService
  ) {}

  get selectedLevelLabel(): string {
    return this.selectedLevel || 'Select Level';
  }

  get selectedGroupLabel(): string {
    if (!this.selectedGroup) return 'Select Group';
    const g = this.groups.find(x => x.value === this.selectedGroup);
    return g ? g.label : this.selectedGroup;
  }

  get selectedTypeLabel(): string {
    if (!this.selectedType) return 'Select Type';
    const t = this.examTypes.find(x => x.value === this.selectedType);
    return t ? t.label : this.selectedType;
  }

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadExams();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
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
      case 'group': this.groupDropdownOpen = false; break;
      case 'type': this.typeDropdownOpen = false; break;
    }
  }

  toggleLevelDropdown(_event?: MouseEvent): void {
    this.levelDropdownOpen = !this.levelDropdownOpen;
    if (this.levelDropdownOpen) {
      this.groupDropdownOpen = false;
      this.typeDropdownOpen = false;
    }
  }

  toggleGroupDropdown(_event?: MouseEvent): void {
    this.groupDropdownOpen = !this.groupDropdownOpen;
    if (this.groupDropdownOpen) {
      this.levelDropdownOpen = false;
      this.typeDropdownOpen = false;
    }
  }

  toggleTypeDropdown(_event?: MouseEvent): void {
    this.typeDropdownOpen = !this.typeDropdownOpen;
    if (this.typeDropdownOpen) {
      this.levelDropdownOpen = false;
      this.groupDropdownOpen = false;
    }
  }

  onLevelSelect(level: string): void {
    this.levelDropdownOpen = false;
    this.selectedLevel = level || '';
    this.loadExams();
  }

  onGroupSelect(group: string): void {
    this.groupDropdownOpen = false;
    this.selectedGroup = group || '';
    this.loadExams();
  }

  onTypeSelect(type: string): void {
    this.typeDropdownOpen = false;
    this.selectedType = type || '';
    this.loadExams();
  }
}
