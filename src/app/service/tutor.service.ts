import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, of } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TutorService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getContent(level: string, subject: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/?level=${level}&subject=${subject}`);
  }

  getSubjects(level: string, group?: string): Observable<any> {
    const params: any = { level_tr: level };
    if (group) params.group = group;
    return this.http.get<any>(`${this.baseUrl}/question_subjects/`, { params }).pipe(
      map(response => response?.subjects || [])
    );
  }

  getTopics(level: string, subject: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/question_topics/`, {
      params: { level_tr: level, class_level: '11-12', subject_tr: subject }
    }).pipe(map(response => response?.topics || []));
  }

  getChapters(level: string, subject: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/chapters/?level=${level}&subject=${subject}`);
  }

  sendMessage(level: string, subject: string, message: string, conversationId?: string): Observable<any> {
    const topic = conversationId || '';
    return this.http.post(`${this.baseUrl}/tutor/chat/`, {
      messages: [{ role: 'user', content: message }],
      learning_context: {
        level_tr: level,
        class_level: '11-12',
        subject_tr: subject,
        topic
      },
      model: 'auto',
      preferences: { promptReadyEnabled: false }
    }, { responseType: 'text' }).pipe(map(body => ({ reply: this.readSseReply(body) })));
  }

  getConversationHistory(level?: string, subject?: string): Observable<any> {
    return of([]);
  }

  saveConversation(conversation: any): Observable<any> {
    return of({ saved: true });
  }

  private readSseReply(body: string): string {
    const chunks: string[] = [];
    for (const line of String(body || '').split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const value = line.slice(5).trim();
      if (!value || value === '[DONE]') continue;
      try {
        const event = JSON.parse(value);
        if (typeof event.content === 'string') chunks.push(event.content);
        else if (typeof event.error === 'string') chunks.push(event.error);
      } catch {
        // Ignore malformed status events while preserving valid content events.
      }
    }
    return chunks.join('').trim() || 'No response was returned. Please try again.';
  }
}
