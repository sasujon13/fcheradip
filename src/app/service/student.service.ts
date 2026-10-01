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
    answers: Record<string, string>;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/student/exam-results/`, result);
  }

  /** Upload older exam-set results that were saved before server-side progress existed. */
  syncLocalExamResults(): Observable<any> {
    // Historical browser-only scores cannot be trusted by the server. New attempts
    // are submitted with their answer map and scored authoritatively.
    return of({ saved: true, added: 0, skippedLegacy: true });
  }
}
