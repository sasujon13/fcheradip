import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LeaderboardService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getLeaderboard(filters?: { level?: string; group?: string; subject?: string; period?: string; limit?: number }): Observable<any> {
    let url = `${this.baseUrl}/leaderboard/`;
    const params: string[] = [];
    if (filters) {
      if (filters.level) params.push(`level=${encodeURIComponent(filters.level)}`);
      if (filters.group) params.push(`group=${encodeURIComponent(filters.group)}`);
      if (filters.subject) params.push(`subject=${encodeURIComponent(filters.subject)}`);
      if (filters.period) params.push(`period=${encodeURIComponent(filters.period)}`);
      if (filters.limit != null) params.push(`limit=${filters.limit}`);
    }
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  getStudentRank(level?: string, group?: string, subject?: string, period?: string): Observable<any> {
    const username = localStorage.getItem('username');
    let url = `${this.baseUrl}/leaderboard/rank/${username}/`;
    const params: string[] = [];
    if (level) params.push(`level=${level}`);
    if (group) params.push(`group=${group}`);
    if (subject) params.push(`subject=${subject}`);
    if (period) params.push(`period=${period}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  getTopStudents(limit: number = 10, level?: string, group?: string, period?: string): Observable<any> {
    return this.getLeaderboard({ level, group, period, limit });
  }
}
