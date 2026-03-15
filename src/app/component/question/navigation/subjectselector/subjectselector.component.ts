import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-subjectselector',
  templateUrl: './subjectselector.component.html',
  styleUrls: ['./subjectselector.component.css']
})
export class SubjectSelectorComponent implements OnInit {
  @Input() subjects: any[] = [];
  /** Current selected subject identifier (e.g. subject_tr) for binding. */
  @Input() currentSubject: string = '';
  /** Emits the full subject object when user selects (for question page: level_tr, class_level, subject_tr). */
  @Output() subjectChange = new EventEmitter<any>();

  constructor() { }

  ngOnInit(): void {
  }

  onSelect(value: string): void {
    const subject = this.subjects.find((s: any) => (s.subject_tr || s.id || s.name) === value);
    this.subjectChange.emit(subject || null);
  }
}

