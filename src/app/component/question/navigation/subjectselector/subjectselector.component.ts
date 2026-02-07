import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-subjectselector',
  templateUrl: './subjectselector.component.html',
  styleUrls: ['./subjectselector.component.css']
})
export class SubjectSelectorComponent implements OnInit {
  @Input() subjects: any[] = [];
  @Input() currentSubject: string = '';
  @Output() subjectChange = new EventEmitter<string>();

  constructor() { }

  ngOnInit(): void {
  }

  onSubjectChange(subject: string): void {
    this.subjectChange.emit(subject);
  }
}

