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

/** API/MCQ text often has i./ii./iii. on separate lines; treat those breaks as soft spaces for packing. */
export function normalizeRomanMcqSource(text: string): string {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+\s*(?=(?:iii|ii|i)\.(?!\d))/gi, ' ')
    .replace(/[ \t]+\n+[ \t]*/g, ' ')
    .replace(/\n{2,}/g, '\n');
}

/** Collapse line breaks inside a clause when several clauses share one display line. */
export function compactRomanSegmentBody(html: string, inlinePack: boolean): string {
  let s = String(html ?? '').trim();
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
  return { prefix, segments };
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
  return parts.join('');
}

/** Split source HTML at roman markers (markers only matched in plain text, not inside tags). */
export function splitHtmlAtRomanMarkers(html: string): RomanMcqParse | null {
  const normalized = normalizeRomanMcqSource(html);
  const plain = stripHtmlToPlain(normalized);
  const parsed = parseRomanMcqContent(plain);
  if (!parsed) return null;

  const src = normalized;
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
  if (hits.length < 2) return parsed;

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
  return { prefix, segments };
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
