import { LovedQuestionsService } from './loved-questions.service';

describe('Shared liked questions', () => {
  let service: LovedQuestionsService;
  beforeEach(() => {
    localStorage.removeItem('cheradip_loved_qids');
    localStorage.removeItem('cheradip_loved_qids_meta');
  });
  afterEach(() => {
    service.ngOnDestroy();
    localStorage.removeItem('cheradip_loved_qids');
    localStorage.removeItem('cheradip_loved_qids_meta');
  });
  it('publishes the count immediately on like and unlike', () => {
    service = new LovedQuestionsService();
    const counts: number[] = [];
    const sub = service.count$.subscribe(count => counts.push(count));
    service.toggle(12, { qid: 12, table: 'physics' });
    expect(service.has('12', { table: 'physics' })).toBeTrue();
    service.toggle('12', { table: 'physics' });
    expect(counts).toEqual([0, 1, 0]); sub.unsubscribe();
  });
  it('keeps identical IDs in different subjects as separate likes', () => {
    service = new LovedQuestionsService();
    service.toggle('01_1_0001', { table: 'physics', question: 'Physics question' });
    service.toggle('01_1_0001', { table: 'bengali', question: 'Bengali question' });
    expect(service.count).toBe(2);
    expect(service.lovedQuestions().map(q => q.question)).toEqual(['Physics question', 'Bengali question']);
    service.toggle('01_1_0001', { table: 'physics' });
    expect(service.has('01_1_0001', { table: 'bengali' })).toBeTrue();
    expect(service.has('01_1_0001', { table: 'physics' })).toBeFalse();
  });
  it('preserves old qid-only likes and metadata', () => {
    localStorage.setItem('cheradip_loved_qids', '[12]');
    localStorage.setItem('cheradip_loved_qids_meta', JSON.stringify({ '12': { qid: 12, table: 'physics', question: 'Saved question' } }));
    service = new LovedQuestionsService();
    expect(service.count).toBe(1);
    expect(service.lovedQuestions()[0].question).toBe('Saved question');
    service.toggle(12, { table: 'bengali' });
    expect(service.count).toBe(2);
    service.toggle('12', { table: 'physics' });
    expect(service.count).toBe(1);
  });
  it('restores all contextual snapshots after reload', () => {
    service = new LovedQuestionsService();
    service.toggle(1, { level_tr: 'SSC', class_level: '9-10', subject_tr: 'Physics' });
    service.toggle(1, { level_tr: 'HSC', class_level: '11-12', subject_tr: 'Physics' });
    service.ngOnDestroy(); service = new LovedQuestionsService();
    expect(service.count).toBe(2);
    expect(service.lovedQuestions().map(q => q.level_tr)).toEqual(['SSC', 'HSC']);
  });
});
