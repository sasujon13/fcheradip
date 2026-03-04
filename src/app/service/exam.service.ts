import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getLiveExams(level?: string, group?: string, subject?: string): Observable<any> {
    let url = `${this.baseUrl}/live-exams/`;
    const params: string[] = [];
    if (level) params.push(`level=${level}`);
    if (group) params.push(`group=${group}`);
    if (subject) params.push(`subject=${subject}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  getArchiveExams(level?: string, group?: string, subject?: string, examType?: string): Observable<any> {
    let url = `${this.baseUrl}/archive-exams/`;
    const params: string[] = [];
    if (level) params.push(`level=${level}`);
    if (group) params.push(`group=${group}`);
    if (subject) params.push(`subject=${subject}`);
    if (examType) params.push(`type=${examType}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
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
