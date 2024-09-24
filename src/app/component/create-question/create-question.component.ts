import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../service/api.service';

interface Question {
  id: number; // Adjust according to your API response
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  answer: string;
  explanation?: string; // Optional field
}

interface Year {
  year_code: string; // Assuming this is the code you use
  year_name: string; // This should match the property in your API
}

interface Institute {
  institute_code: string; // Assuming this is the code you use
  institute_name: string; // This should match the property in your API
}

interface InstituteType {
  institute_code: string; // Assuming this is the code you use
  institute_type: string; // This should match the property in your API
}

interface Group {
  group_code: string; // Assuming this is the code you use
  group_name: string; // This should match the property in your API
}

interface Subject {
  subject_code: string; // Assuming this is the code you use
  subject_name: string; // This should match the property in your API
}

interface Chapter {
  chapter_no: string; // Assuming this is the code you use
  chapter_name: string; // This should match the property in your API
}

interface Topic {
  topic_no: string; // Assuming this is the code you use
  topic_name: string; // This should match the property in your API
}

@Component({
  selector: 'app-create-question',
  templateUrl: './create-question.component.html',
  styleUrls: ['./create-question.component.css']
})
export class CreateQuestionComponent implements OnInit {
  
  questions: Question[] = []; // Ensure questions is typed correctly
  years: Year[] = [];
  institutes: Institute[] = [];
  instituteTypes: InstituteType[] = [];
  groups: Group[] = [];
  subjects: Subject[] = [];
  chapters: Chapter[] = [];
  topics: Topic[] = [];

  filters: {
    group: string[];
    subject: string[];
    chapter: string[];
    topic: string[];
    instituteType: string[];
    institute: string[];
    year: string[];
  } = {
    group: [],
    subject: [],
    chapter: [],
    topic: [],
    instituteType: [],
    institute: [],
    year: []
  };

  constructor(private apiService: ApiService) { }

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    const notification = document.getElementById('marquee');
    const notificationdiv = document.getElementById('notification');

    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    if (notification) {
      notification.style.display = 'none';
    }
    if (notificationdiv) {
      notificationdiv.style.display = 'none';
    }
    
    this.apiService.getGroups().subscribe(data => this.groups = data);
    this.apiService.getSubjects().subscribe(data => this.subjects = data);
    this.apiService.getChapters().subscribe(data => this.chapters = data);
    this.apiService.getTopics().subscribe(data => this.topics = data);
    this.apiService.getInstituteTypes().subscribe(data => this.instituteTypes = data);
    this.apiService.getInstitutes().subscribe(data => this.institutes = data);
    this.apiService.getYears().subscribe(data => this.years = data);

    // Fetch initial questions
    this.getQuestions();
  }

  getQuestions(): void {
    this.apiService.getQuestions(this.filters).subscribe(
      (data: Question[]) => this.questions = data,
      error => console.error('Error fetching questions', error)
    );
  }

  onCheckboxChange(event: any, filterType: keyof typeof this.filters) {
    const isChecked = event.target.checked;
    const value = event.target.value;

    if (isChecked) {
      this.filters[filterType].push(value);
    } else {
      const index = this.filters[filterType].indexOf(value);
      if (index !== -1) {
        this.filters[filterType].splice(index, 1);
      }
    }

    // Trigger filtering
    this.getQuestions();
  }
}
