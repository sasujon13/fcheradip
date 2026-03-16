import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-questionform',
  templateUrl: './questionform.component.html',
  styleUrls: ['./questionform.component.css']
})
export class QuestionFormComponent implements OnInit, OnChanges {
  @Input() question: any | null = null;
  @Input() subject: string = '';
  @Input() chapter: string = '';
  @Input() isNewMode = false;
  @Input() chapters: Array<{ id: string; name: string }> = [];
  @Input() topics: Array<{ id: string; name: string; topic_no?: string }> = [];
  @Input() levelTr = '';
  @Input() classLevel = '';
  @Output() save = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();
  @Output() chapterChange = new EventEmitter<string>();

  questionForm!: FormGroup;
  readonly ADD_NEW_TOPIC_ID = '__add_new_topic__';
  showNewTopicInput = false;
  newTopicName = '';

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.initializeForm();
    if (this.question) {
      this.questionForm.patchValue(this.question);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chapter'] && this.questionForm && !this.question) {
      this.questionForm.patchValue({ chapter: this.chapter });
    }
    if (changes['topics'] && this.questionForm && this.isNewMode) {
      const topic = this.questionForm.get('topic')?.value;
      if (topic && topic !== this.ADD_NEW_TOPIC_ID && !this.topics.some(t => t.id === topic || t.name === topic)) {
        this.questionForm.patchValue({ topic: '' });
      }
    }
  }

  initializeForm(): void {
    this.questionForm = this.fb.group({
      type: ['CQ', Validators.required],
      subject: [this.subject, Validators.required],
      chapter: [this.chapter, Validators.required],
      topic: ['', this.isNewMode ? Validators.required : null],
      topic_no: [''],
      number: ['', this.isNewMode ? null : Validators.required],
      text: ['', Validators.required],
      marks: [1, [Validators.required, Validators.min(1)]],
      difficulty: [''],
      year: [''],
      answer: [''],
      explanation: [''],
      options: [[{ label: 'A', text: '', isCorrect: false }, { label: 'B', text: '', isCorrect: false }]]
    });
  }

  onChapterSelect(chapterIdOrName: string): void {
    this.questionForm.patchValue({ chapter: chapterIdOrName });
    this.chapterChange.emit(chapterIdOrName);
    this.questionForm.patchValue({ topic: '', topic_no: '' });
    this.showNewTopicInput = false;
    this.newTopicName = '';
  }

  /** True if the form has a topic value that is not in the topics list (e.g. custom value). */
  isTopicValueNotInList(): boolean {
    const val = this.questionForm.get('topic')?.value;
    if (!val || val === this.ADD_NEW_TOPIC_ID) return false;
    return !this.topics.some(t => t.id === val || t.name === val);
  }

  onTopicSelect(value: string): void {
    if (value === this.ADD_NEW_TOPIC_ID) {
      this.showNewTopicInput = true;
      this.newTopicName = '';
      this.questionForm.patchValue({ topic: '', topic_no: '' });
    } else {
      this.showNewTopicInput = false;
      const t = this.topics.find(x => x.id === value || x.name === value);
      this.questionForm.patchValue({ topic: t ? t.name : value, topic_no: t?.topic_no ?? '' });
    }
  }

  confirmNewTopic(): void {
    const name = (this.newTopicName || '').trim();
    if (name) {
      this.questionForm.patchValue({ topic: name, topic_no: '' });
      this.showNewTopicInput = false;
      this.newTopicName = '';
    }
  }

  get effectiveTopic(): string {
    if (this.showNewTopicInput && this.newTopicName.trim()) return this.newTopicName.trim();
    return this.questionForm?.get('topic')?.value || '';
  }

  onSubmit(): void {
    if (this.questionForm.valid) {
      const v = this.questionForm.value;
      const topic = this.effectiveTopic;
      if (this.isNewMode && !topic) return;
      const payload = { ...v, topic };
      if (this.isNewMode) {
        const opt = (v.options || []);
        payload.option_1 = opt[0]?.text ?? '';
        payload.option_2 = opt[1]?.text ?? '';
        payload.option_3 = opt[2]?.text ?? '';
        payload.option_4 = opt[3]?.text ?? '';
        payload.question = v.text ?? '';
      }
      this.save.emit(payload);
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }
}

