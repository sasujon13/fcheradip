import { ElementRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { LovedQuestionsService } from '../../../service/loved-questions.service';
import { QuestionComponent } from './question.component';

describe('Liked question paging and filters', () => {
  let service: LovedQuestionsService;
  let component: QuestionComponent;
  beforeEach(() => {
    localStorage.removeItem('cheradip_loved_qids'); localStorage.removeItem('cheradip_loved_qids_meta');
    service = new LovedQuestionsService();
    for (let id = 1; id <= 78; id++) {
      service.toggle(id, { qid: id, question: `Question ${id}`, table: id <= 45 ? 'physics' : 'bengali',
        level_tr: id <= 45 ? 'HSC' : 'SSC', class_level: id <= 45 ? '11-12' : '9-10',
        subject_tr: id <= 45 ? 'Physics' : 'Bengali', group: id <= 45 ? 'Science' : 'Humanities',
        chapter_no: id % 2 ? '01' : '02', chapter: id % 2 ? 'Motion' : 'Energy',
        topic_no: id % 2 ? '1' : '2', topic: id % 2 ? 'Speed' : 'Work',
        subsource: id % 2 ? "BB'25" : "DU'24", type: id % 2 ? 'MCQ' : 'CQ' });
    }
    component = new QuestionComponent(null as any, null as any, null as any,
      { endPdfDocxExport: () => {} } as any, { isDisappeared: () => false } as any,
      service, null as any, null as any, null as any, new ElementRef(document.createElement('div')),
      { detectChanges: () => {}, markForCheck: () => {} } as any);
    component.likedOnly = true;
    spyOn<any>(component, 'measureOptionsLayouts').and.stub();
  });
  afterEach(() => { component.ngOnDestroy(); service.ngOnDestroy(); localStorage.removeItem('cheradip_loved_qids'); localStorage.removeItem('cheradip_loved_qids_meta'); });
  const ids = () => component.getDisplayedQuestions().map(item => item.q.qid);

  it('starts with 30 questions across all levels and subjects and preloads the next page', fakeAsync(() => {
    component.loadQuestionsPage(1);
    expect(ids()).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(component.questionListTotalCount).toBe(78);
    expect(component.topicQuestionsTotalPages).toBe(3);
    expect((component as any).questionPageCache.has(2)).toBeTrue();
    component.loadQuestionsPage(2);
    expect(ids()).toEqual(Array.from({ length: 30 }, (_, i) => i + 31));
    expect(component.getDisplayedQuestions().map(item => item.q.subject_tr)).toContain('Bengali');
    expect((component as any).questionPageCache.has(3)).toBeTrue(); tick(80);
  }));
  it('filters the entire liked pool before paging and recounts the results', fakeAsync(() => {
    component.selectedLevel = 'HSC'; component.selectedClass = '11-12'; component.selectedSubjectTr = 'Physics';
    component.loadQuestionsPage(1);
    expect(component.questionListTotalCount).toBe(45);
    expect(ids().length).toBe(30);
    component.loadQuestionsPage(2);
    expect(ids()).toEqual(Array.from({ length: 15 }, (_, i) => i + 31)); tick(80);
  }));
  it('applies chapter, topic, source, year and type selections together', fakeAsync(() => {
    component.selectedChapterIds = new Set(['01']); component.selectedTopicIds = new Set(['1']);
    component.selectedSources = new Set(['BB']); component.selectedYears = new Set(['25']); component.selectedQuestionTypes = new Set(['MCQ']);
    component.loadQuestionsPage(1);
    expect(component.questionListTotalCount).toBe(39);
    expect(ids().every(id => id % 2 === 1)).toBeTrue();
    component.loadQuestionsPage(2); expect(ids().length).toBe(9); tick(80);
  }));
  it('shows no unrelated fallback rows when filters have zero matches', fakeAsync(() => {
    component.selectedSubjectTr = 'Chemistry'; component.loadQuestionsPage(3);
    expect(ids()).toEqual([]); expect(component.totalQuestionsInCurrentSelection).toBe(0);
    expect(component.effectiveTopicQuestionsPage).toBe(1); tick(80);
  }));
  it('rebuilds the page cache when filters change and preserves the regular saved filter state', fakeAsync(() => {
    localStorage.setItem('cheradip_question_filter_state', '{"subject":"original"}');
    component.loadQuestionsPage(2); component.selectedLevel = 'SSC';
    (component as any).saveFilterState();
    expect(component.topicQuestionsPage).toBe(1);
    expect(component.questionListTotalCount).toBe(33);
    expect(ids()[0]).toBe(46);
    component.clearAllFilterSelections();
    expect(component.questionListTotalCount).toBe(78);
    expect(localStorage.getItem('cheradip_question_filter_state')).toBe('{"subject":"original"}');
    localStorage.removeItem('cheradip_question_filter_state'); tick(80);
  }));
  it('does not reset the page when only question selection changes', fakeAsync(() => {
    component.loadQuestionsPage(2); component.selectedQuestionIds = new Set([31]);
    (component as any).saveFilterState();
    expect(component.topicQuestionsPage).toBe(2); tick(80);
  }));
  it('searches saved likes from all subjects without requesting unliked questions', fakeAsync(() => {
    component.loadQuestionsPage(1); component.onSearch('Question 78');
    expect(component.getDisplayedQuestions()[0].q.qid).toBe(78);
    expect(component.serverSearchArrived).toBeTrue(); tick(80);
  }));
  it('recognizes likes regardless of numeric or string ID representation', () => {
    expect(component.isLoved({ qid: '1', table: 'physics' })).toBeTrue();
    expect(component.isLoved({ qid: '1', table: 'bengali' })).toBeFalse();
  });

  it('updates visible likes immediately and clamps paging after removing the final page', fakeAsync(() => {
    (component as any).route = { snapshot: { data: { likedOnly: true }, url: [] }, params: of({}) };
    (component as any).router = { events: new Subject() };
    (component as any).apiService = { isLoggedIn: () => false };
    (component as any).loadingService = { setTotal: () => {}, endPdfDocxExport: () => {} };
    (component as any).disappearedQuestions.load = () => {};
    (component as any).trxUnlock = { fetchCoinBalance: () => of(0) };
    spyOn(component, 'loadQuestionLevels').and.stub();
    spyOn<any>(component, 'loadCheradipSources').and.stub();
    spyOn<any>(component, 'loadUnlockedQidsFromServer').and.stub();
    component.ngOnInit(); component.loadQuestionsPage(3);
    for (let id = 61; id <= 78; id++) service.toggle(id, { table: 'bengali' });
    expect(component.questionListTotalCount).toBe(60);
    expect(component.topicQuestionsPage).toBe(2);
    expect(ids()).toEqual(Array.from({ length: 30 }, (_, i) => i + 31));
    expect(service.count).toBe(60); tick(80);
  }));

  it('keeps duplicate IDs from different subjects distinct in rendered list tracking', () => {
    const physics = { q: { qid: '01_1_0001', table: 'physics' }, fullIndex: 0 };
    const bengali = { q: { qid: '01_1_0001', table: 'bengali' }, fullIndex: 1 };
    expect(component.trackByQuestionQid(0, physics)).not.toBe(component.trackByQuestionQid(1, bengali));
  });
});
