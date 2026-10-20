import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { StudentService } from '../../../service/student.service';
import { LiveClass } from '../../../service/live-class';

@Component({
  selector: 'app-live-class', standalone: true, imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './live-class.component.html', styleUrls: ['./live-class.component.css'],
})
export class LiveClassComponent implements OnInit, OnDestroy {
  classes: LiveClass[] = [];
  loading = false;
  error = '';
  search = '';
  private request?: Subscription;
  constructor(private student: StudentService) {}
  ngOnInit() { this.load(); }
  ngOnDestroy() { this.request?.unsubscribe(); }
  get visibleClasses() {
    const search = this.search.trim().toLocaleLowerCase();
    return this.classes.filter(item => [item.title, item.subject, item.level, item.topic, item.teacher_name]
      .some(value => (value || '').toLocaleLowerCase().includes(search)));
  }
  isLive(item: LiveClass) { return Date.parse(item.starts_at) <= Date.now() && Date.parse(item.ends_at) > Date.now(); }
  load() {
    this.request?.unsubscribe(); this.loading = true; this.error = '';
    this.request = this.student.getLiveClasses().subscribe({
      next: data => { this.classes = data.classes; this.loading = false; },
      error: () => { this.classes = []; this.loading = false; this.error = 'The class schedule could not be loaded. Please refresh and try again.'; },
    });
  }
}
