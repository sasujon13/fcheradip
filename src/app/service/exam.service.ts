import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getLiveExams(level?: string, group?: string, subject?: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/exam_sets/`).pipe(map(response =>
      this.toExamCards(response?.exam_sets || [], level, subject, 'subject')
    ));
  }

  getArchiveExams(level?: string, group?: string, subject?: string, examType?: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/exam_sets/`).pipe(map(response =>
      this.toExamCards(response?.exam_sets || [], level, subject, examType)
    ));
  }

  private toExamCards(sets: any[], level?: string, subject?: string, examType?: string): any[] {
    return sets
      .filter(set => !level || set.level_tr === level)
      .filter(set => !subject || set.subject_tr === subject)
      .filter(set => !examType || set.exam_type === examType)
      .map(set => ({
        ...set,
        subject_name: set.subject_tr || 'Exam',
        subject_code: set.set_key || '',
        type: set.exam_type || 'practice',
        duration: 20,
        title: set.name_label || set.set_key || 'Exam'
      }));
  }

  getExamById(examId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/exams/${examId}/`);
  }

  getExamQuestions(examId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/exams/${examId}/questions/`);
  }

  submitExam(examId: number, answers: any): Observable<any> {
    const username = localStorage.getItem('username');
    return this.http.post(`${this.baseUrl}/exams/${examId}/submit/`, {
      username,
      answers
    });
  }

  saveExamProgress(examId: number, questionId: number, answer: string | number): Observable<any> {
    const username = localStorage.getItem('username');
    return this.http.post(`${this.baseUrl}/exams/${examId}/save-progress/`, {
      username,
      questionId,
      answer
    });
  }

  getExamHistory(): Observable<any> {
    const username = localStorage.getItem('username');
    return this.http.get(`${this.baseUrl}/student/exam-history/${username}/`);
  }

  getExamResult(examId: number): Observable<any> {
    const username = localStorage.getItem('username');
    return this.http.get(`${this.baseUrl}/exams/${examId}/result/${username}/`);
  }
}
