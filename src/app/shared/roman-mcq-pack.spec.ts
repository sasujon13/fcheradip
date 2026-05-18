import {
  collapseEmbeddedNicherLineWraps,
  normalizeGluedNicherQuestionLine,
  splitPostIiiFollowTail,
  splitHtmlAtRomanMarkers,
} from './roman-mcq-pack';

describe('normalizeGluedNicherQuestionLine', () => {
  it('rewrites বাণিজ্যেনিচের + newline + কোনটি into বাণিজ্যে + newline + নিচের কোনটি', () => {
    expect(normalizeGluedNicherQuestionLine('বাণিজ্যেনিচের\nকোনটি সঠিক?')).toBe(
      'বাণিজ্যে\nনিচের কোনটি সঠিক?'
    );
  });

  it('supports <br> between glued word and কোনটি', () => {
    expect(normalizeGluedNicherQuestionLine('বাণিজ্যেনিচের<br>কোনটি সঠিক?')).toBe(
      'বাণিজ্যে\nনিচের কোনটি সঠিক?'
    );
  });
});

describe('collapseEmbeddedNicherLineWraps', () => {
  it('joins প্রিন্ট and নিচের across a line break inside one word', () => {
    expect(collapseEmbeddedNicherLineWraps('ফিঙ্গার প্রিন্ট\nনিচের')).toBe('ফিঙ্গার প্রিন্টনিচের');
  });

  it('keeps a real নিচের উদ্দীপক tail line', () => {
    expect(collapseEmbeddedNicherLineWraps('clause\nনিচের উদ্দীপক')).toBe('clause\nনিচের উদ্দীপক');
  });
});

describe('splitPostIiiFollowTail', () => {
  it('splits when the next line starts with standalone নিচের', () => {
    const r = splitPostIiiFollowTail('clause one\nনিচের উদ্দীপক');
    expect(r.clause).toBe('clause one');
    expect(r.tail).toBe('নিচের উদ্দীপক');
  });

  it('after normalization, splits iii tail for বাণিজ্যেনিচের then কোনটি', () => {
    const r = splitPostIiiFollowTail('বাণিজ্যেনিচের\nকোনটি সঠিক?');
    expect(r.clause).toBe('বাণিজ্যে');
    expect(r.tail).toBe('নিচের কোনটি সঠিক?');
  });

  it('after collapse+normalize, splits প্রিন্ট line-wrap then কোনটি', () => {
    const r = splitPostIiiFollowTail('ফিঙ্গার প্রিন্ট\nনিচের\nকোনটি সঠিক?');
    expect(r.clause).toContain('প্রিন্ট');
    expect(r.tail).toContain('নিচের');
    expect(r.tail).toContain('কোনটি');
  });

  it('does not split নিচের inside বাণিজ্যেনিচের on one line without question tail', () => {
    const r = splitPostIiiFollowTail('বাণিজ্যেনিচের');
    expect(r.tail).toBe('');
  });

  it('uses standalone নিচের on the same line when present', () => {
    const r = splitPostIiiFollowTail('clause text নিচের উদ্দীপক');
    expect(r.clause).toBe('clause text');
    expect(r.tail).toBe('নিচের উদ্দীপক');
  });
});

describe('splitHtmlAtRomanMarkers', () => {
  it('detects post-iii tail from <br> when নিচের is standalone', () => {
    const html = 'i. one ii. two iii. three<br>নিচের উদ্দীপক';
    const parsed = splitHtmlAtRomanMarkers(html);
    expect(parsed?.afterIiiTail).toContain('নিচের');
    expect(parsed?.segments.find((s) => s.marker === 'iii')?.body ?? '').not.toContain('নিচের');
  });
});
