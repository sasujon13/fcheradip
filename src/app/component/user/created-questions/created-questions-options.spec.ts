import { CreatedQuestionsComponent } from './created-questions.component';

describe('saved-question filter option stability', () => {
  it('keeps option objects stable between checks but refreshes after renaming/filtering', () => {
    const page = new CreatedQuestionsComponent({} as any, {} as any, {} as any);
    page.sets = [{id: 1, name: 'Physics_Chapter_1', questions: []},
      {id: 2, name: 'Chemistry_Chapter_2', questions: []}] as any;
    expect(page.subjectOptions).toBe(page.subjectOptions);
    expect(page.chapterOptions).toBe(page.chapterOptions);
    page.selectedSubject = 'Physics';
    expect(page.chapterOptions.map(option => option.value)).toEqual(['', '1']);
    const previous = page.subjectOptions;
    page.sets[0].name = 'Biology_Chapter_3';
    expect(page.subjectOptions).not.toBe(previous);
    expect(page.subjectOptions.some(option => option.value === 'Biology')).toBeTrue();
    expect(page.subjectOptions).toBe(page.subjectOptions);
  });
});
