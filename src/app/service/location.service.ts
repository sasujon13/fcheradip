// location.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  constructor(private http: HttpClient) {}

  getDivisions(): Observable<string[]> {
    return this.http.get<string[]>('/api/divisions/');
  }

  getDistricts(division: string): Observable<string[]> {
    return this.http.get<string[]>(`/api/districts/?division=${division}`);
  }

  getThanas(division: string, district: string): Observable<string[]> {
    return this.http.get<string[]>(`/api/thanas/?division=${division}&district=${district}`);
  }
}
