import {
  findEmbeddedKeywordLineSplit,
  findPostIiiTailKeyword,
  isKeywordEmbeddedInWord,
  normalizeMcqTailText,
  POST_III_TAIL_KEYWORDS,
  splitPostIiiFollowTail,
} from './roman-mcq-pack';

/** Arbitrary Bengali syllables (not a vocabulary list) — only for building test strings. */
function bengaliStem(length: number): string {
  const consonants = ['\u0995', '\u09A4', '\u09B8', '\u09AA', '\u09A6'];
  const vowels = ['\u09BE', '\u09BF', '\u09C7', '\u09C1'];
  let s = '';
  for (let i = 0; i < length; i++) {
    s += consonants[i % consonants.length] + vowels[i % vowels.length];
  }
  return s;
}

/** Any stem + keyword glued inside one word (optional extra ন before keyword). */
function wordWithEmbeddedKeyword(stem: string, keyword: string, extraN = false): string {
  return extraN ? `${stem}\u09A8${keyword}` : `${stem}${keyword}`;
}

describe('isKeywordEmbeddedInWord', () => {
  it('detects each tail keyword inside any Bengali word', () => {
    const stem = bengaliStem(3);
    for (const keyword of POST_III_TAIL_KEYWORDS) {
      const w = wordWithEmbeddedKeyword(stem, keyword);
      const i = w.indexOf(keyword);
      expect(isKeywordEmbeddedInWord(w, i)).toBe(true);
    }
  });

  it('is false when keyword is standalone at line start', () => {
    for (const keyword of POST_III_TAIL_KEYWORDS) {
      expect(isKeywordEmbeddedInWord(`${keyword} ${bengaliStem(2)}`, 0)).toBe(false);
    }
  });
});

describe('findEmbeddedKeywordLineSplit', () => {
  it('splits embedded keyword + line break + any following text', () => {
    const stem = bengaliStem(4);
    const keyword = POST_III_TAIL_KEYWORDS[0];
    const follow = bengaliStem(2);
    const hit = findEmbeddedKeywordLineSplit(
      `${wordWithEmbeddedKeyword(stem, keyword)}\n${follow}`,
      keyword
    );
    expect(hit?.clause).toBe(stem);
    expect(hit?.tail).toBe(`${keyword} ${follow}`);
  });

  it('uses কোনটি when নিচের is absent', () => {
    const stem = bengaliStem(3);
    const keyword = POST_III_TAIL_KEYWORDS[1];
    const follow = bengaliStem(2);
    const hit = findEmbeddedKeywordLineSplit(
      `${wordWithEmbeddedKeyword(stem, keyword)}\n${follow}`,
      keyword
    );
    expect(hit?.clause).toBe(stem);
    expect(hit?.tail).toBe(`${keyword} ${follow}`);
  });

  it('uses সঠিক when নিচের and কোনটি are absent', () => {
    const stem = bengaliStem(3);
    const keyword = POST_III_TAIL_KEYWORDS[2];
    const follow = bengaliStem(1);
    const hit = findEmbeddedKeywordLineSplit(
      `${wordWithEmbeddedKeyword(stem, keyword)}\n${follow}`,
      keyword
    );
    expect(hit?.clause).toBe(stem);
    expect(hit?.tail).toBe(`${keyword} ${follow}`);
  });
});

describe('normalizeMcqTailText', () => {
  it('splits any embedded নিচের before generic following line', () => {
    const stem = bengaliStem(4);
    const keyword = POST_III_TAIL_KEYWORDS[0];
    const follow = bengaliStem(3);
    const glued = wordWithEmbeddedKeyword(stem, keyword, /\u09A8$/.test(stem));
    const out = normalizeMcqTailText(`${glued}\n${follow}`);
    expect(out).toBe(`${stem}\n${keyword} ${follow}`);
  });

  it('splits embedded কোনটি when নিচের is not in the string', () => {
    const stem = bengaliStem(3);
    const keyword = POST_III_TAIL_KEYWORDS[1];
    const follow = bengaliStem(2);
    const out = normalizeMcqTailText(`${wordWithEmbeddedKeyword(stem, keyword)}\n${follow}`);
    expect(out).toBe(`${stem}\n${keyword} ${follow}`);
  });
});

describe('splitPostIiiFollowTail', () => {
  it('tries নিচের first (embedded), then কোনটি, then সঠিক', () => {
    const stem = bengaliStem(4);
    const nicher = POST_III_TAIL_KEYWORDS[0];
    const r = splitPostIiiFollowTail(
      `${wordWithEmbeddedKeyword(stem, nicher)}\n${POST_III_TAIL_KEYWORDS[1]} ${bengaliStem(1)}`
    );
    expect(r.clause).toBe(stem);
    expect(r.tail.startsWith(nicher)).toBe(true);
  });

  it('uses কোনটি when নিচের is not found', () => {
    const stem = bengaliStem(4);
    const keyword = POST_III_TAIL_KEYWORDS[1];
    const follow = bengaliStem(1);
    const r = splitPostIiiFollowTail(`${wordWithEmbeddedKeyword(stem, keyword)}\n${follow}`);
    expect(r.clause).toBe(stem);
    expect(r.tail).toBe(`${keyword} ${follow}`);
  });

  it('uses সঠিক when নিচের and কোনটি are not found', () => {
    const stem = bengaliStem(3);
    const keyword = POST_III_TAIL_KEYWORDS[2];
    const follow = bengaliStem(1);
    const r = splitPostIiiFollowTail(`${wordWithEmbeddedKeyword(stem, keyword)}\n${follow}`);
    expect(r.clause).toBe(stem);
    expect(r.tail).toBe(`${keyword} ${follow}`);
  });
});

describe('findPostIiiTailKeyword', () => {
  it('returns first matching tail keyword in priority order', () => {
    expect(findPostIiiTailKeyword(`${POST_III_TAIL_KEYWORDS[0]} ${bengaliStem(1)}`)).toBe(
      POST_III_TAIL_KEYWORDS[0]
    );
    const stem = bengaliStem(2);
    const keyword = POST_III_TAIL_KEYWORDS[1];
    expect(
      findPostIiiTailKeyword(`${wordWithEmbeddedKeyword(stem, keyword)}\n${bengaliStem(1)}`)
    ).toBe(keyword);
  });
});
