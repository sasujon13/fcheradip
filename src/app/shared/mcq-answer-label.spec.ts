import { resolveMcqAnswerIndex, resolveMcqAnswerLabel } from './mcq-answer-label';

describe('MCQ answer resolution', () => {
  const options = {
    option_1: 'প্রথম',
    option_2: 'দ্বিতীয়',
    option_3: 'তৃতীয়',
    option_4: 'চতুর্থ',
  };
  const format = (value: string) => value;

  it('resolves Bengali, Latin, numeric, option-key, and option-text answers', () => {
    expect(resolveMcqAnswerIndex('খ', options, format)).toBe(1);
    expect(resolveMcqAnswerIndex('c', options, format)).toBe(2);
    expect(resolveMcqAnswerIndex('4', options, format)).toBe(3);
    expect(resolveMcqAnswerIndex('option_1', options, format)).toBe(0);
    expect(resolveMcqAnswerIndex('তৃতীয়', options, format)).toBe(2);
  });

  it('keeps the existing display-label behavior', () => {
    expect(resolveMcqAnswerLabel('(ঘ)', options, format)).toBe('ঘ');
    expect(resolveMcqAnswerIndex('not-an-option', options, format)).toBeNull();
  });
});
