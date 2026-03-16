import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-questioncard',
  templateUrl: './questioncard.component.html',
  styleUrls: ['./questioncard.component.css']
})
export class QuestionCardComponent {
  @Input() question: any;
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<number | string>();
  @Output() duplicate = new EventEmitter<any>();

  onEdit(): void {
    this.edit.emit(this.question);
  }

  onDelete(): void {
    if (confirm('Are you sure you want to delete this question?')) {
      this.delete.emit(this.question.qid);
    }
  }

  onDuplicate(): void {
    this.duplicate.emit(this.question);
  }
}

