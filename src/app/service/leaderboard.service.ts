import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LeaderboardService {
  private baseUrl = 'https://cheradip.com/api';

  constructor(private http: HttpClient) { }

  getLeaderboard(level?: string, group?: string, subject?: string, period?: string, limit?: number): Observable<any> {
    let url = `${this.baseUrl}/leaderboard/`;
    const params: string[] = [];
    if (level) params.push(`level=${level}`);
    if (group) params.push(`group=${group}`);
    if (subject) params.push(`subject=${subject}`);
    if (period) params.push(`period=${period}`);
    if (limit) params.push(`limit=${limit}`);
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
    return this.getLeaderboard(level, group, undefined, period, limit);
  }
}
