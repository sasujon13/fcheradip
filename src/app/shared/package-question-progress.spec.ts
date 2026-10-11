import { packageQuestionProgress } from './package-question-progress';

describe('Package question progress', () => {
  it('shows untouched and partially used quotas', () => {
    expect(packageQuestionProgress({ questionLimit: 360, questionsUsed: 0 }))
      .toEqual({ total: 360, completed: 0, remaining: 360, percent: 0 });
    expect(packageQuestionProgress({ questionLimit: 100, questionsUsed: 42 }))
      .toEqual({ total: 100, completed: 42, remaining: 58, percent: 42 });
  });
  it('clamps exhausted or invalid usage safely', () => {
    expect(packageQuestionProgress({ questionLimit: 100, questionsUsed: 120 }).percent).toBe(100);
    expect(packageQuestionProgress({ questionLimit: 100, questionsUsed: -1 }).completed).toBe(0);
    expect(packageQuestionProgress({ questionLimit: 100, questionsUsed: 'invalid' }).completed).toBe(0);
  });
  it('does not invent a quota for packages without one', () => {
    expect(packageQuestionProgress({})).toEqual({ total: 0, completed: 0, remaining: 0, percent: 0 });
    expect(packageQuestionProgress({ questionLimit: Infinity }).total).toBe(0);
  });
});
