import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-questionform',
  templateUrl: './questionform.component.html',
  styleUrls: ['./questionform.component.css']
})
export class QuestionFormComponent implements OnInit {
  @Input() question: any | null = null;
  @Input() subject: string = '';
  @Input() chapter: string = '';
  @Output() save = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  questionForm!: FormGroup;

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.initializeForm();
    if (this.question) {
      this.questionForm.patchValue(this.question);
    }
  }

  initializeForm(): void {
    this.questionForm = this.fb.group({
      type: ['CQ', Validators.required],
      subject: [this.subject, Validators.required],
      chapter: [this.chapter, Validators.required],
      number: ['', Validators.required],
      text: ['', Validators.required],
      marks: [1, [Validators.required, Validators.min(1)]],
      difficulty: [''],
      year: [''],
      answer: [''],
      explanation: [''],
      options: [[{ label: 'A', text: '', isCorrect: false }, { label: 'B', text: '', isCorrect: false }]]
    });
  }

  onSubmit(): void {
    if (this.questionForm.valid) {
      this.save.emit(this.questionForm.value);
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }
}

