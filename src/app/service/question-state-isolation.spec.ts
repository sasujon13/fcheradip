import { of } from 'rxjs';
import { LovedQuestionsService } from './loved-questions.service';
import { DisappearedQuestionsService } from './disappeared-questions.service';

describe('Question state belongs to the account and subject', () => {
  const before: Record<string, string | null> = {};
  const keys = ['authToken', 'username', 'isLoggedIn', 'cheradip-liked-legacy-owner', 'cheradip_loved_qids', 'cheradip_loved_qids_meta'];
  beforeEach(() => {
    keys.forEach(key => { before[key] = localStorage.getItem(key); localStorage.removeItem(key); });
    for (const owner of ['audit-a', 'audit-b']) {
      for (const key of ['cheradip_loved_qids', 'cheradip_loved_qids_meta', 'cheradip_disappeared_question_ids']) localStorage.removeItem(`${key}:${owner}`);
    }
    localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('username', 'audit-a');
    localStorage.setItem('authToken', 'test-session');
  });
  afterEach(() => {
    keys.forEach(key => { if (before[key] == null) localStorage.removeItem(key); else localStorage.setItem(key, before[key]!); });
    for (const owner of ['audit-a', 'audit-b']) {
      for (const key of ['cheradip_loved_qids', 'cheradip_loved_qids_meta', 'cheradip_disappeared_question_ids']) localStorage.removeItem(`${key}:${owner}`);
    }
  });

  it('does not expose another account likes, even without a session event', () => {
    const store = new LovedQuestionsService();
    store.toggle(1, { table: 'physics', question: 'Account A question' });
    localStorage.setItem('username', 'audit-b');
    expect(store.count).toBe(0);
    store.toggle(2, { table: 'bengali', question: 'Account B question' });
    localStorage.setItem('username', 'audit-a');
    expect(store.lovedQuestions().map(q => q.question)).toEqual(['Account A question']);
    store.ngOnDestroy();
  });

  it('keeps hidden question IDs separate by subject and account', () => {
    const api = { isLoggedIn: () => false, updateCustomerSettings: () => of({}) } as any;
    const store = new DisappearedQuestionsService(api);
    store.addWithData('1', { table: 'physics', question: 'Physics question' });
    expect(store.isDisappeared('1', { table: 'physics' })).toBeTrue();
    expect(store.isDisappeared('1', { table: 'bengali' })).toBeFalse();
    localStorage.setItem('username', 'audit-b');
    expect(store.isDisappeared('1', { table: 'physics' })).toBeFalse();
    localStorage.setItem('username', 'audit-a');
    store.remove('1', { table: 'physics' });
    expect(store.getItems()).toEqual([]);
  });
});
