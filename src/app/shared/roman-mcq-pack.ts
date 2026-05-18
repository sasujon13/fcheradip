/**
 * MCQ text with i. / ii. / iii. clauses: pack into lines (all three, i+ii|iii, i|ii+iii, or separate).
 */

export type RomanMarker = 'i' | 'ii' | 'iii';

export interface RomanMcqSegment {
  marker: RomanMarker;
  body: string;
}

export interface RomanMcqParse {
  prefix: string;
  segments: RomanMcqSegment[];
  /** MCQ stem after iii. (নিচের / কোনটি / সঠিক …) — always its own line. */
  afterIiiTail?: string;
}

/** MCQ tail keywords after iii. — tried in this order (embedded in any word, then standalone). */
export const POST_III_TAIL_KEYWORDS = ['নিচের', 'কোনটি', 'সঠিক'] as const;
export type PostIiiTailKeyword = (typeof POST_III_TAIL_KEYWORDS)[number];

/** Do not match tail keywords inside a longer Bengali word (…letters + নিচের/কোনটি/সঠিক). */
const BN_LETTER_LOOKBEHIND = '(?<![' + '\\u0980-\\u09FF' + '])';

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Standalone starter word — not a substring after another Bengali letter. */
function postIiiTailStarterPattern(word: string): string {
  const w = escapeRegexLiteral(word);
  return (
    BN_LETTER_LOOKBEHIND +
    w +
    '(?=[\\.।\\u09F4-\\u09F5-\\u09F6\\s\\n\\r<]|$)'
  );
}

const ROMAN_ORDER: RomanMarker[] = ['i', 'ii', 'iii'];

/** Longest-first so "iii." is not parsed as "i." */
const ROMAN_MARKER_RE = /\b(iii|ii|i)\.(?!\d)/gi;

const PACK_ATTEMPTS: RomanMarker[][][] = [
  [['i', 'ii', 'iii']],
  [['i', 'ii'], ['iii']],
  [['i'], ['ii', 'iii']],
  [['i'], ['ii'], ['iii']],
];

/** First tail keyword (tests / callers). */
export const NICHER_WORD: PostIiiTailKeyword = POST_III_TAIL_KEYWORDS[0];

const LINE_BREAK_START = /^(?:\s*(?:<br\s*\/?>|[\r\n]+)\s*)/i;

/**
 * Keyword is inside a longer Bengali word when a Bengali letter comes immediately before it.
 */
export function isKeywordEmbeddedInWord(text: string, keywordIndex: number): boolean {
  if (keywordIndex <= 0) return false;
  return /[\u0980-\u09FF]$/u.test(text.slice(keywordIndex - 1, keywordIndex));
}

/** @deprecated Use {@link isKeywordEmbeddedInWord}. */
export const isNicherEmbeddedInWord = isKeywordEmbeddedInWord;

function restStartsWithStandaloneTailKeyword(rest: string): boolean {
  const t = trimPostIiiTailLead(rest);
  return POST_III_TAIL_KEYWORDS.some((w) => hasStandaloneTailKeyword(t, w));
}

/** True when text after the keyword is only a soft line-wrap (no tail content yet). */
function isKeywordSoftWrapOnly(afterKeyword: string): boolean {
  const br = LINE_BREAK_START.exec(afterKeyword);
  if (br) return !afterKeyword.slice(br[0].length).trim();
  const sp = /^(\s+)(\S[\s\S]*)/.exec(afterKeyword);
  if (sp) return !sp[2].trim();
  return !trimPostIiiTailLead(afterKeyword);
}

/**
 * Split before `keyword` when it is glued inside any Bengali word and the stem continues
 * on the next line or the same line (any following text).
 */
export function findEmbeddedKeywordLineSplit(
  text: string,
  keyword: string
): { clause: string; tail: string; splitAt: number } | null {
  const src = String(text ?? '');
  const kwLen = keyword.length;
  const re = new RegExp(escapeRegexLiteral(keyword), 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const idx = m.index;
    if (!isKeywordEmbeddedInWord(src, idx)) continue;

    const after = src.slice(idx + kwLen);
    const br = LINE_BREAK_START.exec(after);
    if (br) {
      const tailBody = after.slice(br[0].length).trim();
      if (!tailBody) continue;
      if (isKeywordSoftWrapOnly(after)) continue;
      const clause = src.slice(0, idx).trimEnd();
      if (!clause) continue;
      return { clause, tail: `${keyword} ${tailBody}`, splitAt: idx };
    }

    const sp = /^(\s+)(\S[\s\S]*)/.exec(after);
    if (sp) {
      const tailBody = sp[2].trim();
      if (!tailBody || new RegExp(`^${escapeRegexLiteral(keyword)}`, 'iu').test(tailBody)) continue;
      if (isKeywordSoftWrapOnly(after)) continue;
      const clause = src.slice(0, idx).trimEnd();
      if (!clause) continue;
      return { clause, tail: `${keyword} ${tailBody}`, splitAt: idx };
    }
  }
  return null;
}

/** @deprecated Use {@link findEmbeddedKeywordLineSplit} with {@link NICHER_WORD}. */
export function findEmbeddedNicherLineSplit(text: string) {
  return findEmbeddedKeywordLineSplit(text, NICHER_WORD);
}

/** Split glued …[any word] + keyword for each tail keyword (priority order). */
export function normalizeGluedMcqQuestionLine(text: string): string {
  let s = String(text ?? '');
  for (let guard = 0; guard < 32; guard++) {
    let changed = false;
    for (const keyword of POST_III_TAIL_KEYWORDS) {
      const hit = findEmbeddedKeywordLineSplit(s, keyword);
      if (!hit) continue;
      s = s.slice(0, hit.splitAt) + '\n' + hit.tail;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return s;
}

/** @deprecated Use {@link normalizeGluedMcqQuestionLine}. */
export const normalizeGluedNicherQuestionLine = normalizeGluedMcqQuestionLine;

/** Normalize glued tail keywords; then join false soft-wraps inside one Bengali word. */
export function normalizeMcqTailText(text: string): string {
  const unified = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return collapseEmbeddedKeywordLineWraps(normalizeGluedMcqQuestionLine(unified));
}

/** @deprecated Use {@link normalizeMcqTailText}. */
export const normalizeMcqNicherText = normalizeMcqTailText;

function collapseThenNormalizeNicher(text: string): string {
  return normalizeMcqNicherText(text);
}

/** API/MCQ text often has i./ii./iii. on separate lines; treat those breaks as soft spaces for packing. */
export function normalizeRomanMcqSource(text: string): string {
  let s = String(text ?? '').replace(/\r\n/g, '\n');
  s = collapseThenNormalizeNicher(s);
  return s.replace(/\n+\s*(?=(?:iii|ii|i)\.(?!\d))/gi, ' ');
}

function trimPostIiiTailLead(tail: string): string {
  return tail.replace(/^[\n\r]+/, '').replace(/^<br\s*\/?>/i, '').trim();
}

function hasStandaloneTailKeyword(text: string, word: string): boolean {
  const re = new RegExp(postIiiTailStarterPattern(word), 'i');
  return re.test(text);
}

/**
 * Join soft line breaks inside one Bengali word (…প্রিন্ট\\nনিচের → …প্রিন্টনিচের).
 * Keeps real tail lines when any text (or another tail keyword) follows.
 */
export function collapseEmbeddedKeywordLineWraps(text: string): string {
  let s = String(text ?? '');
  for (const keyword of POST_III_TAIL_KEYWORDS) {
    const esc = escapeRegexLiteral(keyword);
    const re = new RegExp(`([\\u0980-\\u09FF])(?:<br\\s*\\/?>|[\\r\\n]+)\\s*${esc}`, 'giu');
    s = s.replace(re, (full, letter: string, offset: number, src: string) => {
      const rest = src.slice(offset + full.length);
      if (trimPostIiiTailLead(rest)) return full;
      if (restStartsWithStandaloneTailKeyword(rest)) return full;
      return letter + keyword;
    });
  }
  return s;
}

/** @deprecated Use {@link collapseEmbeddedKeywordLineWraps}. */
export const collapseEmbeddedNicherLineWraps = collapseEmbeddedKeywordLineWraps;

function collectLineBreaks(src: string): { index: number; len: number }[] {
  const breaks: { index: number; len: number }[] = [];
  const brRe = /<br\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = brRe.exec(src)) !== null) {
    if (m.index > 0) breaks.push({ index: m.index, len: m[0].length });
  }
  const nlRe = /[\r\n]+/g;
  while ((m = nlRe.exec(src)) !== null) {
    if (m.index > 0) breaks.push({ index: m.index, len: m[0].length });
  }
  breaks.sort((a, b) => a.index - b.index);
  return breaks;
}

/** Line break before a standalone tail keyword on the next line. */
function splitAtValidLineBreakAfterKeyword(
  body: string,
  keyword: string
): { clause: string; tail: string } | null {
  const src = String(body ?? '');
  for (const br of collectLineBreaks(src)) {
    const before = src.slice(0, br.index);
    const after = src.slice(br.index + br.len);
    const lead = trimPostIiiTailLead(after);
    if (!hasStandaloneTailKeyword(lead, keyword)) continue;
    if (isKeywordSoftWrapOnly(after)) continue;
    const clause = before.trim();
    const tail = lead;
    if (!clause || !tail) continue;
    return { clause, tail };
  }
  return null;
}

/** Standalone starter (not inside a Bengali word); may follow whitespace on the same line. */
function splitAtPostIiiKeyword(
  body: string,
  word: string
): { clause: string; tail: string } | null {
  const src = String(body ?? '');
  const starter = postIiiTailStarterPattern(word);
  const re = new RegExp(`(?:^|[\\s\\n\\r]+|<br\\s*/?>)\\s*(${starter}[\\s\\S]*)`, 'i');
  const m = re.exec(src);
  if (!m || m.index <= 0) return null;
  const clause = src.slice(0, m.index).trim();
  const tail = trimPostIiiTailLead(m[1] ?? '');
  if (!tail) return null;
  return { clause, tail };
}

/**
 * After iii. (or i./ii.) body: for each tail keyword in order (নিচের → কোনটি → সঠিক),
 * try embedded-in-word split, then line-break + standalone, then same-line standalone.
 */
export function splitPostIiiFollowTail(body: string): { clause: string; tail: string } {
  const src = collapseThenNormalizeNicher(String(body ?? ''));
  if (!src.trim()) return { clause: '', tail: '' };

  for (const keyword of POST_III_TAIL_KEYWORDS) {
    const embedded = findEmbeddedKeywordLineSplit(src, keyword);
    if (embedded) return { clause: embedded.clause, tail: embedded.tail };

    const byLine = splitAtValidLineBreakAfterKeyword(src, keyword);
    if (byLine) return byLine;

    const standalone = splitAtPostIiiKeyword(src, keyword);
    if (standalone) return standalone;
  }

  return { clause: src, tail: '' };
}

/** Which tail keyword matched first ({@link POST_III_TAIL_KEYWORDS} order), or null. */
export function findPostIiiTailKeyword(text: string): PostIiiTailKeyword | null {
  const { tail } = splitPostIiiFollowTail(text);
  if (!tail) return null;
  for (const keyword of POST_III_TAIL_KEYWORDS) {
    if (hasStandaloneTailKeyword(tail, keyword) || tail.startsWith(keyword)) {
      return keyword;
    }
  }
  return null;
}

/** Split at tail keyword; iii uses separate after-iii block, i/ii keep \\n in body. */
function applyNicherSplitsToSegments(parsed: RomanMcqParse): RomanMcqParse {
  let afterIiiTail: string | undefined;
  const segments = parsed.segments.map((seg) => {
    const src = collapseThenNormalizeNicher(seg.body);
    const { clause, tail } = splitPostIiiFollowTail(src);
    if (!tail) return { ...seg, body: src };
    if (seg.marker === 'iii') {
      afterIiiTail = tail;
      return { ...seg, body: clause };
    }
    const merged = clause ? `${clause}\n${tail}` : tail;
    return { ...seg, body: merged };
  });
  return afterIiiTail ? { ...parsed, segments, afterIiiTail } : { ...parsed, segments };
}

function applyPostIiiTailSplit(parsed: RomanMcqParse): RomanMcqParse {
  return applyNicherSplitsToSegments(parsed);
}

/** Collapse line breaks inside a clause when several clauses share one display line. */
export function compactRomanSegmentBody(html: string, inlinePack: boolean): string {
  let s = collapseThenNormalizeNicher(String(html ?? '').trim());
  if (!inlinePack) return s;
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHtmlToPlain(html: string): string {
  if (!html || !/[<>&]/.test(html)) return html;
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ');
  }
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

export function parseRomanMcqContent(text: string): RomanMcqParse | null {
  const src = normalizeRomanMcqSource(text);
  if (!ROMAN_MARKER_RE.test(src)) return null;
  ROMAN_MARKER_RE.lastIndex = 0;

  const hits: { marker: RomanMarker; index: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = ROMAN_MARKER_RE.exec(src)) !== null) {
    hits.push({
      marker: m[1].toLowerCase() as RomanMarker,
      index: m.index,
      len: m[0].length,
    });
  }
  if (hits.length < 2) return null;

  let expect = 0;
  for (const h of hits) {
    const idx = ROMAN_ORDER.indexOf(h.marker);
    if (idx < expect) return null;
    expect = idx + 1;
  }

  const prefix = src.slice(0, hits[0]!.index).trimEnd();
  const segments: RomanMcqSegment[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.index + hits[i]!.len;
    const end = i + 1 < hits.length ? hits[i + 1]!.index : src.length;
    segments.push({
      marker: hits[i]!.marker,
      body: compactRomanSegmentBody(src.slice(start, end), false),
    });
  }
  return applyPostIiiTailSplit({ prefix, segments });
}

function partitionAttempts(present: Set<RomanMarker>): RomanMarker[][][] {
  const out: RomanMarker[][][] = [];
  for (const attempt of PACK_ATTEMPTS) {
    const lines: RomanMarker[][] = [];
    let ok = true;
    const seen = new Set<RomanMarker>();
    for (const group of attempt) {
      const g = group.filter((mk) => present.has(mk));
      if (!g.length) continue;
      if (g.length !== group.length) {
        ok = false;
        break;
      }
      for (const mk of g) {
        if (seen.has(mk)) {
          ok = false;
          break;
        }
        seen.add(mk);
      }
      if (!ok) break;
      lines.push(g);
    }
    if (ok && seen.size === present.size && lines.length) out.push(lines);
  }
  return out;
}

export function plainLineForRomanGroup(
  group: RomanMarker[],
  byMarker: Map<RomanMarker, string>
): string {
  return group
    .map((mk) => {
      const body = byMarker.get(mk) ?? '';
      return body ? `${mk}. ${body}` : `${mk}.`;
    })
    .join('  ')
    .trim();
}

export function chooseRomanMcqPackLines(
  segments: RomanMcqSegment[],
  maxWidthPx: number,
  measureWidth: (plainLine: string) => number,
  widthSlack = 1.2
): RomanMarker[][] {
  const present = new Set(segments.map((s) => s.marker));
  const byMarker = new Map(
    segments.map((s) => [s.marker, stripHtmlToPlain(compactRomanSegmentBody(s.body, true))])
  );
  const attempts = partitionAttempts(present);
  const limit = Math.max(80, maxWidthPx * widthSlack);

  for (const lines of attempts) {
    let fits = true;
    for (const group of lines) {
      if (group.length <= 1) continue;
      const plain = plainLineForRomanGroup(group, byMarker);
      if (measureWidth(plain) > limit) {
        fits = false;
        break;
      }
    }
    if (fits) return lines;
  }
  return segments.map((s) => [s.marker]);
}

/** Emit packed roman MCQ HTML (`roman-mcq-pack-line` groups). */
export function buildRomanMcqPackHtml(
  parsed: RomanMcqParse,
  packLines: RomanMarker[][],
  formatHtml: (htmlFragment: string) => string,
  formatRoman: (marker: RomanMarker, bodyHtml: string) => string
): string {
  const byMarker = new Map(parsed.segments.map((s) => [s.marker, s.body]));
  const parts: string[] = [];
  const prefix = parsed.prefix.trim();
  if (prefix) {
    parts.push(`<span class="topic-question-line">${formatHtml(prefix)}</span>`);
  }
  for (const group of packLines) {
    const inlinePack = group.length > 1;
    const inner = group
      .map((mk) => {
        const raw = byMarker.get(mk) ?? '';
        const body = inlinePack ? compactRomanSegmentBody(raw, true) : raw;
        return `<span class="topic-question-line topic-question-roman-line">${formatRoman(mk, body)}</span>`;
      })
      .join(' ');
    parts.push(`<span class="roman-mcq-pack-line">${inner}</span>`);
  }
  const tail = (parsed.afterIiiTail ?? '').trim();
  if (tail) {
    parts.push(`<span class="topic-question-line roman-mcq-after-iii">${formatHtml(tail)}</span>`);
  }
  return parts.join('');
}

/** Visible line breaks inside a roman clause body. */
export function romanSegmentBodyToDisplayHtml(body: string): string {
  return String(body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br />');
}

function _collectRomanHitsOutsideTags(src: string): { marker: RomanMarker; index: number; len: number }[] {
  const hits: { marker: RomanMarker; index: number; len: number }[] = [];
  ROMAN_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROMAN_MARKER_RE.exec(src)) !== null) {
    if (_insideHtmlTag(src, m.index)) continue;
    hits.push({
      marker: m[1].toLowerCase() as RomanMarker,
      index: m.index,
      len: m[0].length,
    });
  }
  return hits;
}

/** Split source HTML at roman markers (markers only matched in plain text, not inside tags). */
export function splitHtmlAtRomanMarkers(html: string): RomanMcqParse | null {
  const src = normalizeMcqNicherText(normalizeRomanMcqSource(html));
  const hits = _collectRomanHitsOutsideTags(src);

  if (hits.length >= 1) {
    const prefix = src.slice(0, hits[0]!.index).trimEnd();
    const segments: RomanMcqSegment[] = [];
    for (let i = 0; i < hits.length; i++) {
      const start = hits[i]!.index + hits[i]!.len;
      const end = i + 1 < hits.length ? hits[i + 1]!.index : src.length;
      segments.push({
        marker: hits[i]!.marker,
        body: src.slice(start, end).trim(),
      });
    }
    return applyNicherSplitsToSegments({ prefix, segments });
  }

  const plain = stripHtmlToPlain(src);
  return parseRomanMcqContent(plain);
}

function _insideHtmlTag(html: string, index: number): boolean {
  const before = html.lastIndexOf('<', index);
  const after = html.lastIndexOf('>', index);
  return before >= 0 && before > after;
}

export type RomanMcqLayoutContext = 'stem' | 'option' | 'export';

export function defaultMaxWidthForRomanMcqLayout(ctx: RomanMcqLayoutContext): number {
  if (ctx === 'option') return 340;
  if (ctx === 'export') return 320;
  return 480;
}
