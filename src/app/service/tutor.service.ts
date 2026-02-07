import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TutorService {
  private baseUrl = 'https://cheradip.com/api';

  constructor(private http: HttpClient) { }

  getContent(level: string, subject: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/?level=${level}&subject=${subject}`);
  }

  getSubjects(level: string, group?: string): Observable<any> {
    let url = `${this.baseUrl}/subjects/`;
    const params: string[] = [`level=${level}`];
    if (group) params.push(`group=${group}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  getTopics(level: string, subject: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/topics/?level=${level}&subject=${subject}`);
  }

  getChapters(level: string, subject: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/chapters/?level=${level}&subject=${subject}`);
  }

  sendMessage(level: string, subject: string, message: string, conversationId?: string): Observable<any> {
    const username = localStorage.getItem('username');
    return this.http.post(`${this.baseUrl}/tutor/chat/`, {
      username,
      level,
      subject,
      message,
      conversationId
    });
  }

  getConversationHistory(level?: string, subject?: string): Observable<any> {
    const username = localStorage.getItem('username');
    let url = `${this.baseUrl}/tutor/conversations/${username}/`;
    const params: string[] = [];
    if (level) params.push(`level=${level}`);
    if (subject) params.push(`subject=${subject}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  saveConversation(conversation: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/tutor/conversations/save/`, conversation);
  }
}
