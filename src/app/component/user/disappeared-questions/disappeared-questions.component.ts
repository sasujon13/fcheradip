import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { DisappearedQuestionsService, DisappearedItem } from '../../../service/disappeared-questions.service';

@Component({
  selector: 'app-disappeared-questions',
  templateUrl: './disappeared-questions.component.html',
  styleUrls: ['./disappeared-questions.component.css']
})
export class DisappearedQuestionsComponent implements OnInit {
  items: DisappearedItem[] = [];
  message = '';

  constructor(
    public disappeared: DisappearedQuestionsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.disappeared.load(() => {
      this.refresh();
      this.cdr.detectChanges();
    });
  }

  refresh(): void {
    this.items = this.disappeared.getItems();
  }

  live(qid: string): void {
    this.disappeared.remove(qid);
    this.refresh();
    this.message = 'Question ' + qid + ' restored. It will show again in the question list.';
    setTimeout(() => (this.message = ''), 7000);
    this.cdr.detectChanges();
  }

  liveAll(): void {
    const count = this.items.length;
    this.disappeared.removeAll();
    this.refresh();
    this.message = count > 0 ? 'All ' + count + ' question(s) restored. They will show again in the question list.' : 'No questions to restore.';
    setTimeout(() => (this.message = ''), 7000);
    this.cdr.detectChanges();
  }
}
