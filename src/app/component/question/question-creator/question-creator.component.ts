import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-question-creator',
  templateUrl: './question-creator.component.html',
  styleUrls: ['./question-creator.component.css']
})
export class QuestionCreatorComponent implements OnInit {
  questions: any[] = [];
  context: { level_tr?: string; class_level?: string; subject_tr?: string; chapter?: string; topic?: string } = {};
  questionHeader = '';
  pageSize = 'A4';
  pageMargin = '20';
  questionsPadding = '16';
  questionsGap = '12';

  constructor(private router: Router) {}

  ngOnInit(): void {
    const state = history.state;
    if (state?.questions && Array.isArray(state.questions) && state.questions.length > 0) {
      this.questions = state.questions;
      this.context = state.context || {};
    } else {
      this.router.navigate(['/question']);
    }
  }

  removeQuestion(id: number): void {
    this.questions = this.questions.filter(q => q.id !== id);
  }

  goBack(): void {
    this.router.navigate(['/question']);
  }

  onSmartQuestionCreator(): void {
    // To be defined later
  }
}
