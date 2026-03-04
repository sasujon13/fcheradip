import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getReport(period: string, level?: string, group?: string): Observable<any> {
    const username = localStorage.getItem('username');
    let url = `${this.baseUrl}/student/reports/${username}/`;
    const params: string[] = [`period=${period}`];
    if (level) params.push(`level=${level}`);
    if (group) params.push(`group=${group}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  getWeeklyReport(level?: string, group?: string): Observable<any> {
    return this.getReport('weekly', level, group);
  }

  getMonthlyReport(level?: string, group?: string): Observable<any> {
    return this.getReport('monthly', level, group);
  }

  getQuarterlyReport(level?: string, group?: string): Observable<any> {
    return this.getReport('quarterly', level, group);
  }

  getHalfYearlyReport(level?: string, group?: string): Observable<any> {
    return this.getReport('half-yearly', level, group);
  }

  getYearlyReport(level?: string, group?: string): Observable<any> {
    return this.getReport('yearly', level, group);
  }

  getAllTimeReport(level?: string, group?: string): Observable<any> {
    return this.getReport('all-time', level, group);
  }

  exportReportAsPDF(period: string, level?: string, group?: string): Observable<Blob> {
    const username = localStorage.getItem('username');
    let url = `${this.baseUrl}/student/reports/${username}/export/`;
    const params: string[] = [`period=${period}`];
    if (level) params.push(`level=${level}`);
    if (group) params.push(`group=${group}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url, { responseType: 'blob' });
  }
}
