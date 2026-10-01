import { Component, OnInit, AfterViewInit } from '@angular/core';
import { TutorService } from '../../../service/tutor.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
    selector: 'app-tutor',
    templateUrl: './tutor.component.html',
    styleUrls: ['./tutor.component.css'],
    standalone: false
})
export class TutorComponent implements OnInit, AfterViewInit {
  selectedLevel: string = 'Higher Secondary';
  selectedGroup: string = '';
  selectedSubject: string = '';
  selectedTopic: string = '';
  subjects: any[] = [];
  topics: any[] = [];
  messages: any[] = [];
  newMessage: string = '';
  currentMessage: string = '';
  loading: boolean = false;
  errorMessage: string = '';
  levels = ['Higher Secondary'];
  groups = [
    { value: 'Science', label: 'Science' },
    { value: 'Humanities', label: 'Humanities' },
    { value: 'Business Studies', label: 'Business Studies' }
  ];

  constructor(
    private tutorService: TutorService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadSubjects();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadSubjects(): void {
    this.errorMessage = '';
    this.tutorService.getSubjects(this.selectedLevel, this.selectedGroup).subscribe(
      (data: any) => {
        this.subjects = Array.isArray(data) ? data : [];
      },
      () => { this.subjects = []; this.errorMessage = 'Subjects could not be loaded. Please try again.'; }
    );
  }

  onLevelChange(): void {
    this.selectedSubject = '';
    this.selectedTopic = '';
    this.topics = [];
    this.loadSubjects();
  }

  onGroupChange(): void {
    this.selectedSubject = '';
    this.selectedTopic = '';
    this.topics = [];
    this.loadSubjects();
  }

  onSubjectChange(): void {
    this.selectedTopic = '';
    this.loadTopics();
    this.loadChatHistory();
  }

  loadTopics(): void {
    if (this.selectedSubject) {
      this.tutorService.getTopics(this.selectedLevel, this.selectedSubject).subscribe(
        (data: any) => {
          this.topics = data;
        }
      );
    }
  }

  loadChatHistory(): void {
    if (this.selectedSubject) {
      this.tutorService.getConversationHistory(this.selectedLevel, this.selectedSubject).subscribe(
        (data: any) => {
          this.messages = data;
        }
      );
    }
  }

  sendMessage(): void {
    if (!this.currentMessage.trim() || !this.selectedSubject) return;

    this.loading = true;
    this.errorMessage = '';
    const message = {
      text: this.currentMessage,
      type: 'user',
      timestamp: new Date()
    };
    this.messages.push(message);

    this.tutorService.sendMessage(
      this.selectedLevel,
      this.selectedSubject,
      this.currentMessage,
      this.selectedTopic
    ).subscribe(
      (response: any) => {
        this.messages.push({
          text: response.reply || response.message || response.text,
          type: 'tutor',
          timestamp: new Date()
        });
        this.currentMessage = '';
        this.loading = false;
      },
      (error: any) => {
        this.loading = false;
        this.errorMessage = 'The tutor could not answer right now. Please try again.';
      }
    );
  }
}
