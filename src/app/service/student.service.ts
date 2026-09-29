import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getStudentProfile(): Observable<any> {
    const username = localStorage.getItem('username');
    return this.http.get(`${this.baseUrl}/student/profile/${username}/`);
  }

  updateStudentProfile(profileData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/student/profile/update/`, profileData);
  }

  isPremium(): boolean {
    // Check if student has premium subscription
    const premiumStatus = localStorage.getItem('isPremium');
    return premiumStatus === 'true';
  }

  getStudentStats(): Observable<any> {
    return this.http.get(`${this.baseUrl}/student/stats/`);
  }

  saveExamResult(result: {
    attemptId: string;
    setId: number;
    setName: string;
    score: number;
    correct: number;
    total: number;
    subjectTr?: string;
    levelTr?: string;
    classLevel?: string;
    setKey?: string;
    examType?: string;
    examMode?: string;
    examVariant?: string;
    completed?: boolean;
    at: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/student/exam-results/`, result);
  }

  /** Upload older exam-set results that were saved before server-side progress existed. */
  syncLocalExamResults(): Observable<any> {
    try {
      const raw = localStorage.getItem('exam_set_results');
      const stored = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(stored) || stored.length === 0) return of({ saved: true, added: 0 });
      const results = stored.slice(0, 250).map((item: any) => ({
        ...item,
        attemptId: String(item?.attemptId || `legacy-${item?.setId || 0}-${item?.at || ''}-${item?.score || 0}-${item?.correct || 0}-${item?.total || 0}`).slice(0, 80)
      }));
      return this.http.post(`${this.baseUrl}/student/exam-results/`, { results });
    } catch {
      return of({ saved: false, added: 0 });
    }
  }
}
