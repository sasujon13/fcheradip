import { FAQ_CHAPTERS, FAQ_SEARCH_QUESTION_COUNT, FAQ_TYPE_OPTIONS } from './faq-content';

describe('FAQ manual content', () => {
  const entries = FAQ_CHAPTERS.flatMap(chapter => chapter.entries);

  it('keeps a substantial editorial handbook without synthetic duplicate answers', () => {
    expect(FAQ_CHAPTERS.length).toBe(22);
    expect(entries.length).toBeGreaterThan(230);
    expect(FAQ_SEARCH_QUESTION_COUNT).toBeGreaterThan(2000);
    expect(FAQ_CHAPTERS.every(chapter => chapter.entries.length > 0)).toBeTrue();
  });

  it('uses unique chapter and answer identifiers', () => {
    const chapterIds = FAQ_CHAPTERS.map(chapter => chapter.id);
    const entryIds = entries.map(entry => entry.id);

    expect(new Set(chapterIds).size).toBe(chapterIds.length);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    expect(new Set(entries.map(entry => entry.question.trim().toLocaleLowerCase())).size).toBe(entries.length);
    expect(new Set(entries.map(entry => entry.answer.trim().toLocaleLowerCase())).size).toBe(entries.length);
  });

  it('only uses declared filters and internal absolute routes', () => {
    const typeIds = new Set(FAQ_TYPE_OPTIONS.filter(option => option.id !== 'all').map(option => option.id));

    for (const entry of entries) {
      expect(entry.types.length).toBeGreaterThan(0);
      expect(entry.types.every(type => typeIds.has(type))).toBeTrue();
      expect((entry.links || []).every(link => link.route.startsWith('/'))).toBeTrue();
      expect(entry.topic).toBeTruthy();
      expect(entry.subtopic).toBeTruthy();
      expect(entry.tags?.length || 0).toBeGreaterThan(0);
      expect(entry.answer.trim().length).toBeGreaterThan(55);
      expect(entry.searchQuestions?.length || 0).toBeGreaterThanOrEqual(9);
    }
  });
});
