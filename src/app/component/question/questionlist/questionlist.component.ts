import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-questionlist',
  templateUrl: './questionlist.component.html',
  styleUrls: ['./questionlist.component.css']
})
export class QuestionListComponent implements OnInit {
  @Input() questions: any[] = [];
  @Input() currentPage: number = 1;
  @Input() totalPages: number = 1;
  @Output() pageChange = new EventEmitter<number>();
  @Output() questionSelect = new EventEmitter<any>();
  @Output() questionDelete = new EventEmitter<number | string>();

  constructor() { }

  ngOnInit(): void {
  }

  onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  onQuestionSelect(question: any): void {
    this.questionSelect.emit(question);
  }

  onQuestionDelete(qid: number | string): void {
    this.questionDelete.emit(qid);
  }
}

