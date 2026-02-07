import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-subject-selector',
  templateUrl: './subject-selector.component.html',
  styleUrls: ['./subject-selector.component.css']
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

