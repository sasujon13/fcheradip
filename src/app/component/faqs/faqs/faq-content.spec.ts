import { FAQ_CHAPTERS, FAQ_TYPE_OPTIONS } from './faq-content';

describe('FAQ manual content', () => {
  const entries = FAQ_CHAPTERS.flatMap(chapter => chapter.entries);

  it('keeps the complete handbook inventory available', () => {
    expect(FAQ_CHAPTERS.length).toBe(16);
    expect(entries.length).toBeGreaterThan(1000);
    expect(FAQ_CHAPTERS.every(chapter => chapter.entries.length > 0)).toBeTrue();
  });

  it('uses unique chapter and answer identifiers', () => {
    const chapterIds = FAQ_CHAPTERS.map(chapter => chapter.id);
    const entryIds = entries.map(entry => entry.id);

    expect(new Set(chapterIds).size).toBe(chapterIds.length);
    expect(new Set(entryIds).size).toBe(entryIds.length);
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
    }
  });
});
