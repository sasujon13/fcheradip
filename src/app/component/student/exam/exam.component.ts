import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamService } from '../../../service/exam.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-exam',
  templateUrl: './exam.component.html',
  styleUrls: ['./exam.component.css']
})
export class ExamComponent implements OnInit, OnDestroy {
  examId: number = 0;
  exam: any = null;
  questions: any[] = [];
  currentQuestionIndex: number = 0;
  answers: any = {};
  markedQuestions: Set<number> = new Set();
  timeRemaining: number = 0;
  timerSubscription?: Subscription;
  isSubmitted: boolean = false;
  result: any = null;
  Math = Math;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private examService: ExamService
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.examId = +params['id'];
      this.loadExam();
    });
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  loadExam(): void {
    this.examService.getExamById(this.examId).subscribe(
      (data: any) => {
        this.exam = data;
        this.timeRemaining = data.duration * 60; // Convert to seconds
        this.startTimer();
        this.loadQuestions();
      }
    );
  }

  loadQuestions(): void {
    this.examService.getExamQuestions(this.examId).subscribe(
      (data: any) => {
        this.questions = data;
      }
    );
  }

  startTimer(): void {
    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
      } else {
        this.submitExam();
      }
    });
  }

  selectAnswer(questionId: number, answer: string): void {
    this.answers[questionId] = answer;
    this.saveAnswer(questionId, answer);
  }

  saveAnswer(questionId: number, answer: string): void {
    this.examService.saveExamProgress(this.examId, questionId, answer).subscribe();
  }

  markForReview(): void {
    const currentId = this.questions[this.currentQuestionIndex].id;
    if (this.markedQuestions.has(currentId)) {
      this.markedQuestions.delete(currentId);
    } else {
      this.markedQuestions.add(currentId);
    }
  }

  goToQuestion(index: number): void {
    this.currentQuestionIndex = index;
  }

  previousQuestion(): void {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
    }
  }

  nextQuestion(): void {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.currentQuestionIndex++;
    }
  }

  submitExam(): void {
    const answerArray = Object.keys(this.answers).map(key => ({
      question_id: +key,
      answer: this.answers[key]
    }));

    this.examService.submitExam(this.examId, answerArray).subscribe(
      (data: any) => {
        this.isSubmitted = true;
        this.result = data;
        if (this.timerSubscription) {
          this.timerSubscription.unsubscribe();
        }
      }
    );
  }

  getCurrentQuestion(): any {
    return this.questions[this.currentQuestionIndex];
  }

  getTimerDisplay(): string {
    const hours = Math.floor(this.timeRemaining / 3600);
    const minutes = Math.floor((this.timeRemaining % 3600) / 60);
    const seconds = this.timeRemaining % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}
