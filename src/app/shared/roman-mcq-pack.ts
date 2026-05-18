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

/** Line after iii. often starts with one of these (API puts it on the next line). */
const POST_III_TAIL_STARTERS = ['নিচের', 'কোনটি', 'সঠিক'] as const;

/** Do not match starters inside a longer Bengali word (e.g. বাণিজ্যেনিচের). */
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

/** After line break, MCQ continuation often starts with one of these. */
const GLUED_NICHER_TAIL_START = '(?:কোনটি|সঠিক)';
/** `<br>`, newline, or both (API/export often use `<br>` only). */
const LINE_BREAK = '(?:\\s*(?:<br\\s*\\/?>|[\\r\\n]+)\\s*)+';
const SPACE_OR_BREAK = '(?:\\s+|' + LINE_BREAK + ')';

/**
 * Turn `বাণিজ্যেনিচের\\nকোনটি…` / `…<br>কোনটি…` into `বাণিজ্যে\\nনিচের কোনটি…`
 * and `ফিঙ্গার প্রিন্টনিচের\\nকোনটি…` into `ফিঙ্গার প্রিন্ট\\nনিচের কোনটি…`.
 */
export function normalizeGluedNicherQuestionLine(text: string): string {
  let s = String(text ?? '');
  let prev = '';
  while (prev !== s) {
    prev = s;
    // …ন + নিচের + break + tail
    s = s.replace(
      new RegExp(
        `([\\u0980-\\u09FF]+)(ন)(নিচের)${LINE_BREAK}(${GLUED_NICHER_TAIL_START}[\\s\\S]*)`,
        'gi'
      ),
      '$1\nনিচের $4'
    );
    // …X + নিচের + break + tail
    s = s.replace(
      new RegExp(
        `([\\u0980-\\u09FF]+)(নিচের)${LINE_BREAK}(${GLUED_NICHER_TAIL_START}[\\s\\S]*)`,
        'gi'
      ),
      '$1\nনিচের $3'
    );
    // Same line: …নিচের কোনটি…
    s = s.replace(
      new RegExp(
        `([\\u0980-\\u09FF]+)(ন)(নিচের)\\s+(${GLUED_NICHER_TAIL_START}[\\s\\S]*)`,
        'gi'
      ),
      '$1\nনিচের $4'
    );
    s = s.replace(
      new RegExp(
        `([\\u0980-\\u09FF]+)(নিচের)\\s+(${GLUED_NICHER_TAIL_START}[\\s\\S]*)`,
        'gi'
      ),
      '$1\nনিচের $3'
    );
  }
  return s;
}

/** Normalize glued নিচের first; only then join false soft-wraps (never before কোনটি/সঠিক tail). */
export function normalizeMcqNicherText(text: string): string {
  return collapseEmbeddedNicherLineWraps(normalizeGluedNicherQuestionLine(String(text ?? '')));
}

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

/** MCQ tail lines usually continue with one of these right after standalone নিচের. */
const NICHER_TAIL_PHRASE_RE =
  /^\s*(?:উদ্দীপক|উদ্দীপকের|কোন|তথ্য|সূচ|দেখ|বর্ণ|তালিক|টেক্সট|চিত্র|ছক|টেবিল|মানচিত্র|সমীকরণ|বাক্য|অংশ|বিষয়|চার্ট|গ্রাফ|ছবি|চিত্রটি|উদাহরণ|বাক্যের|প্রশ্ন)/i;

function hasStandaloneTailKeyword(text: string, word: string): boolean {
  const re = new RegExp(postIiiTailStarterPattern(word), 'i');
  return re.test(text);
}

function startsWithStandaloneTailKeyword(text: string): (typeof POST_III_TAIL_STARTERS)[number] | null {
  const t = trimPostIiiTailLead(text);
  for (const word of POST_III_TAIL_STARTERS) {
    if (hasStandaloneTailKeyword(t, word)) return word;
  }
  return null;
}

/** True when newline is only wrapping “…প্রিন্ট / নিচের” inside one word, not “নিচের কোনটি …”. */
function isNicherLineContinuation(before: string, after: string): boolean {
  const b = before.trimEnd();
  const a = trimPostIiiTailLead(after);
  if (!/[\u0980-\u09FF]$/.test(b)) return false;
  const m = /^নিচের/i.exec(a);
  if (!m) return false;
  const rest = a.slice(m[0].length).trimStart();
  if (!rest) return true;
  if (new RegExp(`^${GLUED_NICHER_TAIL_START}`, 'i').test(rest)) return false;
  if (NICHER_TAIL_PHRASE_RE.test(rest)) return false;
  return true;
}

/**
 * Join soft line breaks inside one Bengali word (…প্রিন্ট\\nনিচের → …প্রিন্টনিচের).
 * Keeps real “নিচের উদ্দীপক …” tail lines intact.
 */
export function collapseEmbeddedNicherLineWraps(text: string): string {
  const re = /([\u0980-\u09FF])(?:<br\s*\/?>|[\r\n]+)\s*নিচের/gi;
  return String(text ?? '').replace(re, (full, letter: string, offset: number, src: string) => {
    const rest = src.slice(offset + full.length);
    if (NICHER_TAIL_PHRASE_RE.test(rest)) return full;
    return letter + 'নিচের';
  });
}

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

/** Line break is a valid tail boundary only when the next line starts with a standalone keyword. */
function splitAtValidLineBreakAfterIii(body: string): { clause: string; tail: string } | null {
  const src = String(body ?? '');
  for (const br of collectLineBreaks(src)) {
    const before = src.slice(0, br.index);
    const after = src.slice(br.index + br.len);
    if (isNicherLineContinuation(before, after)) continue;
    if (!startsWithStandaloneTailKeyword(after)) continue;
    const clause = before.trim();
    const tail = trimPostIiiTailLead(after);
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
 * Split content after iii. onto its own line.
 * 1) Collapse soft প্রিন্ট\\nনিচের wraps, then normalize বাণিজ্যেনিচের\\nকোনটি → বাণিজ্যে\\nনিচের কোনটি
 * 2) Line break if the next line starts with standalone নিচের/কোনটি/সঠিক
 * 3) Else standalone keyword search: নিচের → কোনটি → সঠিক
 */
export function splitPostIiiFollowTail(body: string): { clause: string; tail: string } {
  const src = collapseThenNormalizeNicher(String(body ?? ''));
  if (!src.trim()) return { clause: '', tail: '' };

  const byLine = splitAtValidLineBreakAfterIii(src);
  if (byLine) return byLine;

  for (const word of POST_III_TAIL_STARTERS) {
    const byKeyword = splitAtPostIiiKeyword(src, word);
    if (byKeyword) return byKeyword;
  }

  return { clause: src, tail: '' };
}

/** Split embedded …নিচের + tail; iii uses separate after-iii block, i/ii keep \\n in body. */
function applyNicherSplitsToSegments(parsed: RomanMcqParse): RomanMcqParse {
  let afterIiiTail: string | undefined;
  const segments = parsed.segments.map((seg) => {
    const src = collapseThenNormalizeNicher(seg.body);
    const { clause, tail } = splitPostIiiFollowTail(src);
    if (!tail) return { ...seg, body: src };
    if (seg.marker === 'iii') {
      afterIiiTail = tail;
      return { ...seg, body: compactRomanSegmentBody(clause, false) };
    }
    const merged = clause ? `${clause}\n${tail}` : tail;
    return { ...seg, body: compactRomanSegmentBody(merged, false) };
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
        const body = compactRomanSegmentBody(raw, inlinePack);
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

/** Re-apply নিচের splits using HTML slices (plain text drops `<br>`). */
function refreshAfterIiiTailFromHtml(parsed: RomanMcqParse, normalizedHtml: string): RomanMcqParse {
  const hits = _collectRomanHitsOutsideTags(normalizedHtml);
  if (!hits.length) return parsed;

  const prefix = normalizedHtml.slice(0, hits[0]!.index).trimEnd();
  const segments: RomanMcqSegment[] = hits.map((h, i) => {
    const start = h.index + h.len;
    const end = i + 1 < hits.length ? hits[i + 1]!.index : normalizedHtml.length;
    return { marker: h.marker, body: normalizedHtml.slice(start, end).trim() };
  });
  return applyNicherSplitsToSegments({ prefix, segments });
}

/** Split source HTML at roman markers (markers only matched in plain text, not inside tags). */
export function splitHtmlAtRomanMarkers(html: string): RomanMcqParse | null {
  const normalized = normalizeRomanMcqSource(html);
  const src = normalizeMcqNicherText(normalized);
  const hits = _collectRomanHitsOutsideTags(src);
  if (hits.length < 2) {
    const plain = stripHtmlToPlain(src);
    const parsed = parseRomanMcqContent(plain);
    if (!parsed) return null;
    if (!hits.length) return parsed;
    return refreshAfterIiiTailFromHtml(parsed, src);
  }

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
