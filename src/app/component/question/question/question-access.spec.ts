import { ElementRef } from '@angular/core';
import { of } from 'rxjs';
import { QuestionComponent } from './question.component';
import { LovedQuestionsService } from '../../../service/loved-questions.service';

describe('Subject-qualified question unlocks', () => {
  let component: QuestionComponent;
  let loved: LovedQuestionsService;
  const physics = JSON.stringify(['hsc', 'physics', '1']);
  const bengali = JSON.stringify(['hsc', 'bengali', '1']);
  beforeEach(() => {
    loved = new LovedQuestionsService();
    component = new QuestionComponent(null as any, null as any, null as any,
      {} as any, { isDisappeared: () => false } as any, loved,
      { unlockQuestions: () => of({ success: true, updateBalance: false, remaining: 100,
        unlockedKeys: [physics], questions: [{ qid: '1', access_key: physics, answer: 'Physics answer' }] }) } as any,
      { persistFullList: () => of([physics]) } as any, { getCachedRemaining: () => 100 } as any,
      new ElementRef(document.createElement('div')), { markForCheck: () => {}, detectChanges: () => {} } as any);
    (component as any).pagedTopicQuestions = [
      { qid: '1', access_key: physics, table: 'physics', subject_tr: 'Physics', level_tr: 'HSC', class_level: '11-12' },
      { qid: '1', access_key: bengali, table: 'bengali', subject_tr: 'Bengali', level_tr: 'HSC', class_level: '11-12' },
    ];
  });
  afterEach(() => { component.ngOnDestroy(); loved.ngOnDestroy(); });

  it('unlocking one reused ID does not reveal or replace the other subject', () => {
    const questions = (component as any).pagedTopicQuestions;
    component.toggleQuestionUnlock(questions[0], new Event('click'));
    expect(questions[0].answer).toBe('Physics answer');
    expect(questions[1].answer).toBeUndefined();
    expect(component.isQuestionRevealed(questions[0])).toBeTrue();
    expect(component.isQuestionRevealed(questions[1])).toBeFalse();
  });
});
