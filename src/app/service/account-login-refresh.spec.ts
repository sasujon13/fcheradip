import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { ApiService } from './api.service';
import { LovedQuestionsService } from './loved-questions.service';
import { TrxUnlockService } from './trx-unlock.service';
import { AuthInterceptor } from './auth.interceptor';

describe('account records refresh after every login', () => {
  let previous: Record<string, string>;
  let likes: LovedQuestionsService | undefined;
  beforeEach(() => {
    previous = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)!]));
    localStorage.clear();
  });
  afterEach(() => {
    likes?.ngOnDestroy(); likes = undefined;
    localStorage.clear();
    Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value));
  });
  const signIn = (name: string, token: string) => {
    localStorage.setItem('username', name);
    localStorage.setItem('authToken', token);
    localStorage.setItem('isLoggedIn', 'true');
  };

  it('notifies the heart counter on login without visiting any question page', fakeAsync(() => {
    const settings = new Subject<any>();
    const http = {get: jasmine.createSpy().and.returnValue(settings),
      post: () => of({token: 'session-a', username: 'account-a', fullName: 'Account A'})} as any;
    likes = new LovedQuestionsService(http);
    const counts: number[] = [];
    likes.count$.subscribe(count => counts.push(count));
    const api = new ApiService(http);
    api.login('account-a', 'test-only-password').subscribe();
    flushMicrotasks();
    settings.next({settings: {loved_questions: {'q1': {qid: 1}, 'q2': {qid: 2}}}});
    expect(counts[counts.length - 1]).toBe(2);
    // Logging out and returning to the same account must load its saved count again.
    localStorage.setItem('isLoggedIn', 'false');
    window.dispatchEvent(new Event('cheradip-session-changed'));
    expect(counts[counts.length - 1]).toBe(0);
    api.login('account-a', 'test-only-password').subscribe();
    flushMicrotasks();
    expect(counts[counts.length - 1]).toBe(2);
    expect(http.get).toHaveBeenCalledTimes(2);
  }));

  it('keeps existing server likes when a new like arrives while login is loading', () => {
    signIn('account-a', 'session-a');
    const settings = new Subject<any>();
    const http = {get: () => settings, post: jasmine.createSpy().and.returnValue(of({}))} as any;
    likes = new LovedQuestionsService(http);
    likes.toggle('new', {question: 'New question'});
    expect(http.post).not.toHaveBeenCalled();
    settings.next({settings: {loved_questions: {old: {qid: 'old', question: 'Existing record'}}}});
    expect(likes.qids().sort()).toEqual(['new', 'old']);
    const saved = http.post.calls.mostRecent().args[1].settings.loved_questions;
    expect(Object.keys(saved).sort()).toEqual(['new', 'old']);
  });

  it('also syncs cached likes that have not reached the account on the server yet', () => {
    signIn('account-a', 'session-a');
    localStorage.setItem('cheradip_loved_qids:account-a', '["offline"]');
    localStorage.setItem('cheradip_loved_qids_meta:account-a', JSON.stringify({offline: {qid: 'offline'}}));
    const settings = new Subject<any>();
    const http = {get: () => settings, post: jasmine.createSpy().and.returnValue(of({}))} as any;
    likes = new LovedQuestionsService(http);
    settings.next({settings: {loved_questions: {old: {qid: 'old'}}}});
    expect(likes.qids().sort()).toEqual(['offline', 'old']);
    expect(Object.keys(http.post.calls.mostRecent().args[1].settings.loved_questions).sort()).toEqual(['offline', 'old']);
  });

  it('does not apply a previous account response to the next login', () => {
    signIn('account-a', 'session-a');
    const old = new Subject<any>();
    const current = new Subject<any>();
    const http = {get: jasmine.createSpy().and.returnValues(old, current), post: () => of({})} as any;
    likes = new LovedQuestionsService(http);
    const counts: number[] = [];
    likes.count$.subscribe(count => counts.push(count));
    signIn('account-b', 'session-b');
    window.dispatchEvent(new Event('cheradip-session-changed'));
    current.next({settings: {loved_questions: {b: {qid: 'b'}}}});
    old.next({settings: {loved_questions: {a1: {qid: 'a1'}, a2: {qid: 'a2'}}}});
    expect(counts[counts.length - 1]).toBe(1);
    expect(likes.qids()).toEqual(['b']);
  });

  it('does not reuse an earlier login balance request or clear the newer pending request', () => {
    signIn('account-a', 'session-a');
    const old = new Subject<any>();
    const current = new Subject<any>();
    const http = {get: jasmine.createSpy().and.returnValues(old, current)} as any;
    const wallet = new TrxUnlockService(http, {} as any, {} as any, {} as any);
    wallet.fetchCoinBalance().subscribe();
    signIn('account-b', 'session-b');
    expect(wallet.getCachedRemaining()).toBe(0);
    wallet.fetchCoinBalance().subscribe();
    old.next({settings: {balance: 99999}}); old.complete();
    wallet.fetchCoinBalance().subscribe();
    expect(http.get).toHaveBeenCalledTimes(2);
    current.next({settings: {balance: 1200}}); current.complete();
    expect(wallet.getCachedRemaining()).toBe(1200);
  });

  it('ignores a stale unauthorized response instead of logging out the newer account', () => {
    signIn('account-a', 'session-a');
    const invalidateSession = jasmine.createSpy();
    const interceptor = new AuthInterceptor({invalidateSession} as any);
    const response = new Subject<any>();
    interceptor.intercept(new HttpRequest('GET', '/api/customer_settings/'), {handle: () => response} as any)
      .subscribe({error: () => {}});
    signIn('account-b', 'session-b');
    response.error(new HttpErrorResponse({status: 401}));
    expect(invalidateSession).not.toHaveBeenCalled();
  });
});
