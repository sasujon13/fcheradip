import { Component, OnInit, AfterViewInit } from '@angular/core';
import { TutorService } from '../../../service/tutor.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-tutor',
  templateUrl: './tutor.component.html',
  styleUrls: ['./tutor.component.css']
})
export class TutorComponent implements OnInit, AfterViewInit {
  selectedLevel: string = 'HSC';
  selectedGroup: string = '';
  selectedSubject: string = '';
  selectedTopic: string = '';
  subjects: any[] = [];
  topics: any[] = [];
  messages: any[] = [];
  newMessage: string = '';
  currentMessage: string = '';
  loading: boolean = false;
  levels = ['PSC', 'JSC', 'SSC', 'HSC'];
  groups = [
    { value: 'S', label: 'Science' },
    { value: 'A', label: 'Arts' },
    { value: 'B', label: 'Business Studies' },
    { value: 'I', label: 'Islamic Studies' },
    { value: 'H', label: 'Humanities' },
    { value: 'M', label: 'Music' }
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
    this.tutorService.getSubjects(this.selectedLevel, this.selectedGroup).subscribe(
      (data: any) => {
        this.subjects = data;
      }
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
        console.error('Error sending message:', error);
      }
    );
  }
}
