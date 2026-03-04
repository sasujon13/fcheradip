import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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
    const username = localStorage.getItem('username');
    return this.http.get(`${this.baseUrl}/student/stats/${username}/`);
  }
}
