import katex from 'katex';

/** Escape plaintext for HTML. */
export function escapeHtmlPlain(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderTex(tex: string, displayMode: boolean): string {
  let t = tex.trim();
  if (!t) return '';
  if (!displayMode) {
    /** Trailing `\\` is a line break in display mode only — breaks inline KaTeX. */
    t = t.replace(/\\+$/g, '').trim();
  }
  /** `\text { pow }` → `\text{pow}` (common DB spacing). */
  t = t.replace(/\\(text|mathrm|operatorname|mathbf|mathit)\s*\{\s*/g, '\\$1{');
  t = t.replace(/\s+\}/g, '}');
  try {
    return katex.renderToString(t, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    const readable = escapeHtmlPlain(tex.trim());
    return displayMode
      ? `<span class="question-math-fallback question-math-fallback-display">${readable}</span>`
      : `<span class="question-math-fallback">${readable}</span>`;
  }
}

/** Tighten inline `$...$` before KaTeX (trailing `\\`, spaced `\\text { }`). */
function normalizeInlineMathDelimiters(s: string): string {
  return s.replace(/\$([^$\n]+?)\$/g, (_, inner: string) => {
    let t = inner.replace(/\\+$/g, '').trim();
    t = t.replace(/\\(text|mathrm|operatorname|mathbf|mathit)\s*\{\s*/g, '\\$1{');
    t = t.replace(/\s+\}/g, '}');
    return `$${t}$`;
  });
}

const BARE_LATEX_COMMAND_RE = /\\(?:(?:frac|dfrac|tfrac|sqrt|begin|end|mathrm|text|operatorname|mathbf|mathit|mathbb|mathcal|boxed|therefore|because|times|cdot|div|sum|prod|int|iint|lim|log|ln|sin|cos|tan|theta|alpha|beta|gamma|delta|lambda|mu|pi|sigma|omega|infty|le|ge|neq|approx|rightarrow|left|right|overline|underline|vec|hat|bar|unit|cancel)\b|[%*])/g;

const CALCULATION_LABEL_AFTER_BOUNDARY_RE =
  /(?:^|[।.!?\n\r,:])\s*([A-Za-zঀ-৿][A-Za-zঀ-৿\u200C\u200D]*(?:[ \t]+(?:[A-Za-zঀ-৿][A-Za-zঀ-৿\u200C\u200D]*|\([^()\r\n]{1,50}\))){0,5})[ \t]*=/g;
const FORMAT_SHIELD_RE = /\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|<[^>]*>/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Imported explanations often lose every paragraph break. Restore Bengali sentence
 * spacing and turn repeated calculation labels into one labelled equation followed
 * by continuation lines (`প্রকৃত তাপমাত্রা = ...`, then `= ...`).
 */
export function normalizeQuestionCalculationLayout(text: string): string {
  if (!text) return '';
  const shields: string[] = [];
  let source = text.replace(FORMAT_SHIELD_RE, (value) => {
    const token = `\uE000${shields.length}\uE001`;
    shields.push(value);
    return token;
  });

  source = source.replace(/।(?![\s<]|$)/g, '। ');

  const labels: string[] = [];
  let match: RegExpExecArray | null;
  CALCULATION_LABEL_AFTER_BOUNDARY_RE.lastIndex = 0;
  while ((match = CALCULATION_LABEL_AFTER_BOUNDARY_RE.exec(source)) !== null) {
    const label = match[1].replace(/[ \t]+/g, ' ').trim();
    if (label && !labels.some((existing) => existing.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      labels.push(label);
    }
  }
  CALCULATION_LABEL_AFTER_BOUNDARY_RE.lastIndex = 0;

  let changedCalculation = false;
  for (const label of labels) {
    const labelRe = new RegExp(`(${escapeRegExp(label)})[ \\t]*=`, 'gi');
    const occurrences = [...source.matchAll(labelRe)];
    if (occurrences.length < 2) continue;
    const romanPrefixed = occurrences.filter((item) => {
      const at = item.index ?? 0;
      return /(?:^|[^A-Za-z])(?:iii|ii|i)\.?\s*$/i.test(source.slice(Math.max(0, at - 10), at));
    });
    if (romanPrefixed.length >= 2) continue;
    let occurrence = 0;
    source = source.replace(labelRe, (_whole, actualLabel: string, offset: number) => {
      occurrence++;
      changedCalculation = true;
      if (occurrence === 1) {
        const needsBreak = offset > 0 && source[offset - 1] !== '\n' && source.slice(0, offset).trim().length > 0;
        return `${needsBreak ? '\n' : ''}${actualLabel} =`;
      }
      return '\n=';
    });
  }

  if (changedCalculation) {
    source = source.replace(
      /([0-9A-Za-z৹°%)}\]])[ \t]*(সুতরাং|অতএব|Hence\b|Therefore\b)/gi,
      '$1\n$2'
    );
  }
  source = source.replace(/[ \t]+\n/g, '\n');
  return source.replace(/\uE000(\d+)\uE001/g, (_token, index: string) => shields[Number(index)] ?? '');
}

function isProseBoundaryAt(source: string, index: number): boolean {
  const ch = source[index];
  if (/[ঀ-৿।]/.test(ch) || ch === '<' || ch === '\n' || ch === '\r') return true;
  if (!/\s/.test(ch)) return false;
  return /^\s+(?:where|when|which|given|find|calculate|hence|in which|for which|so that)\b/i.test(
    source.slice(index)
  );
}

/** Repair legacy conversions seen in imported DB text (`_{...}` became `*{...}`, `\mathrm{\~g}`). */
function repairLegacyLatexTokens(source: string): string {
  if (!/\\(?:[A-Za-z]+|[%*])/.test(source)) return source;
  return source
    .replace(/\*\s*\{/g, '_{')
    .replace(/\\+\*/g, '\\times ')
    .replace(/\\+%/g, '\\%')
    .replace(/\\mathrm\s*\{\s*\\~\s*([^{}]+)\}/g, '\\mathrm{$1}');
}

/**
 * Repair `$...$...$$prose` imports where the first `$` opens one formula,
 * internal single dollars are conversion noise, and the final `$$` is the close.
 */
function isInlineCloseProse(source: string, index: number): boolean {
  // True when the char right after a closing `$` at `index` starts prose rather than more math.
  // Distinguishes a well-formed inline `$...$` (which must NOT be merged with a later `$$` block)
  // from an unbalanced single-`$` legacy-import opener that still needs repairing.
  if (index + 1 >= source.length) return true;
  const ch = source[index + 1];
  if (ch === '$' || ch === '\\') return false;
  return /\s|[ঀ-৿।,;:!?<>"()-]/.test(ch);
}

function repairSingleOpenDoubleCloseBlocks(source: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('$', cursor);
    if (open < 0) {
      out += source.slice(cursor);
      break;
    }
    if (source[open - 1] === '\\' || source[open - 1] === '$' || source[open + 1] === '$') {
      out += source.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }
    const quickClose = nextUnescapedInlineDollar(source, open + 1);
    if (quickClose >= 0 && isInlineCloseProse(source, quickClose)) {
      // The first `$` is already closed as normal inline `$...$` (its closing `$` is followed by
      // prose). Do NOT merge it with any later `$$` block — that would swallow the prose and the next
      // formula (e.g. `$F=...$ এবং $$E=...$$`) into a single display expression.
      out += source.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }
    let terminal = source.indexOf('$$', open + 1);
    let repaired = false;
    while (terminal >= 0) {
      const body = source.slice(open + 1, terminal);
      const after = source[terminal + 2] ?? '';
      BARE_LATEX_COMMAND_RE.lastIndex = 0;
      const hasLatex = BARE_LATEX_COMMAND_RE.test(body);
      BARE_LATEX_COMMAND_RE.lastIndex = 0;
      if (
        body.includes('$') &&
        hasLatex &&
        (!after || /[ঀ-৿।<\r\n]/.test(after))
      ) {
        let cleanBody = body.replace(/\$/g, '');
        cleanBody = cleanBody
          .replace(/^\s*(i{1,3}|iv)\.\s*/i, (_, marker: string) => `\\text{${marker}. } `)
          .replace(/\s+(i{2,3}|iv)\.\s*/gi, (_, marker: string) => ` \\quad \\text{${marker}. } `);
        out += source.slice(cursor, open) + `$$${cleanBody.trim()}$$`;
        cursor = terminal + 2;
        repaired = true;
        break;
      }
      terminal = source.indexOf('$$', terminal + 2);
    }
    if (!repaired) {
      out += source.slice(cursor, open + 1);
      cursor = open + 1;
    }
  }
  return out;
}

/** Convert a malformed `$...$$...$$...$` block into one valid display expression. */
function repairMixedDollarBlocks(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const isSingleOpen =
      source[i] === '$' && source[i - 1] !== '$' && source[i + 1] !== '$' && source[i - 1] !== '\\';
    if (!isSingleOpen) {
      out += source[i++];
      continue;
    }
    let close = -1;
    for (let j = i + 1; j < source.length; j++) {
      if (source[j] !== '$' || source[j - 1] === '\\') continue;
      if (source[j + 1] === '$') {
        j++;
        continue;
      }
      if (source[j - 1] === '$') continue;
      close = j;
      break;
    }
    if (close < 0) {
      out += source.slice(i);
      break;
    }
    const inner = source.slice(i + 1, close);
    BARE_LATEX_COMMAND_RE.lastIndex = 0;
    if (inner.includes('$$') && BARE_LATEX_COMMAND_RE.test(inner)) {
      out += `$$${inner.replace(/\$\$/g, '\\\\')}$$`;
    } else {
      out += source.slice(i, close + 1);
    }
    i = close + 1;
  }
  BARE_LATEX_COMMAND_RE.lastIndex = 0;
  return out;
}

function findUnterminatedDisplayEnd(source: string, from: number): number {
  const env = /\\begin\s*\{([^{}]+)\}/.exec(source.slice(from));
  if (env) {
    const beginAt = from + (env.index ?? 0);
    const endToken = `\\end{${env[1]}}`;
    const envEnd = source.indexOf(endToken, beginAt + env[0].length);
    if (envEnd >= 0) return envEnd + endToken.length;
  }
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && isProseBoundaryAt(source, i)) return i;
  }
  return source.length;
}

function commandStartOutsideCodeHtml(segment: string, from: number): RegExpExecArray | null {
  BARE_LATEX_COMMAND_RE.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = BARE_LATEX_COMMAND_RE.exec(segment)) !== null) {
    const before = segment.slice(0, match.index).toLowerCase();
    if (before.lastIndexOf('<code') <= before.lastIndexOf('</code>')) return match;
  }
  return null;
}

function bareLatexEnd(segment: string, from: number): number {
  const env = /\\begin\s*\{([^{}]+)\}/.exec(segment.slice(from));
  if (env && (env.index ?? 0) === 0) {
    const token = `\\end{${env[1]}}`;
    const end = segment.indexOf(token, from + env[0].length);
    if (end >= 0) return end + token.length;
  }
  let depth = 0;
  for (let i = from; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && isProseBoundaryAt(segment, i)) {
      return i;
    }
  }
  return segment.length;
}

/** Wrap bare TeX commands in otherwise plain prose so KaTeX can see them. */
function wrapBareLatexInPlainSegment(segment: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < segment.length) {
    const match = commandStartOutsideCodeHtml(segment, cursor);
    if (!match) {
      out += segment.slice(cursor);
      break;
    }
    let start = match.index;
    const variablePrefix = /([A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z0-9_.()+\-*/ ]*)$/.exec(
      segment.slice(0, start)
    );
    if (variablePrefix) start -= variablePrefix[1].length;
    let end = bareLatexEnd(segment, match.index);
    while (end > start && /\s/.test(segment[end - 1])) end--;
    if (end <= match.index) {
      out += segment.slice(cursor, BARE_LATEX_COMMAND_RE.lastIndex);
      cursor = BARE_LATEX_COMMAND_RE.lastIndex;
      continue;
    }
    out += segment.slice(cursor, start);
    const formula = segment.slice(start, end);
    const standaloneCalculation =
      start === 0 && /^[A-Za-z][A-Za-z0-9_]*\s*=/.test(formula) && end < segment.length;
    out += /\\begin\s*\{/.test(formula) || standaloneCalculation
      ? `$$${formula}$$`
      : `$${formula}$`;
    cursor = end;
  }
  BARE_LATEX_COMMAND_RE.lastIndex = 0;
  return out;
}

function wrapBareLatexOutsideDelimiters(source: string): string {
  let out = '';
  let plainStart = 0;
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('$$', i)) {
      const close = source.indexOf('$$', i + 2);
      if (close < 0) break;
      const wrappedPlain = wrapBareLatexInPlainSegment(source.slice(plainStart, i));
      out += wrappedPlain;
      if (wrappedPlain.endsWith('$')) out += '\n';
      out += source.slice(i, close + 2);
      i = close + 2;
      plainStart = i;
      continue;
    }
    if (source[i] === '$' && source[i - 1] !== '\\') {
      const close = nextUnescapedInlineDollar(source, i + 1);
      if (close < 0) break;
      out += wrapBareLatexInPlainSegment(source.slice(plainStart, i));
      out += source.slice(i, close + 1);
      i = close + 1;
      plainStart = i;
      continue;
    }
    i++;
  }
  const wrappedTail = wrapBareLatexInPlainSegment(source.slice(plainStart));
  if (out.endsWith('$$') && wrappedTail.startsWith('$')) out += '\n';
  out += wrappedTail;
  return out;
}

/**
 * DB / PDF export quirks: `\\ $$`, `$$\boxed{...}$`, missing closing `$$`, zero-width chars.
 * Applied before KaTeX so answer/explanation/stem all behave the same on /question.
 */
export function normalizeQuestionLatexSource(text: string): string {
  if (!text) return '';
  let s = normalizeQuestionCalculationLayout(text).replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = repairLegacyLatexTokens(s);
  s = repairSingleOpenDoubleCloseBlocks(s);
  s = repairMixedDollarBlocks(s);
  s = s.replace(/\\+\s*\$\$/g, '\n$$');
  s = s.replace(
    /\$\$(\s*\\boxed\{(?:[^{}]|\{[^{}]*\})*\})\s*\$(?!\$)/g,
    '$$$1$$'
  );
  s = normalizeInlineMathDelimiters(s);
  s = closeUnterminatedDisplayMath(s);
  return wrapBareLatexOutsideDelimiters(s);
}

/** Index after `\\boxed{...}` when `$$` has no closing pair. */
function findBoxedGroupEnd(s: string, from: number): number {
  if (!s.slice(from).trimStart().startsWith('\\boxed{')) {
    return -1;
  }
  const trimmed = from + s.slice(from).length - s.slice(from).trimStart().length;
  let i = trimmed + 7;
  let depth = 1;
  while (i < s.length && depth > 0) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return depth === 0 ? i : -1;
}

/** Insert closing `$$` after orphan display math before following prose. */
function closeUnterminatedDisplayMath(s: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('$$', i);
    if (open < 0) {
      out.push(s.slice(i));
      break;
    }
    out.push(s.slice(i, open));
    const close = s.indexOf('$$', open + 2);
    if (close >= 0) {
      out.push(s.slice(open, close + 2));
      i = close + 2;
      continue;
    }
    const contentStart = open + 2;
    const boxedEnd = findBoxedGroupEnd(s, contentStart);
    if (boxedEnd > contentStart) {
      out.push('$$');
      out.push(s.slice(contentStart, boxedEnd));
      out.push('$$');
      i = boxedEnd;
      continue;
    }
    const inferredEnd = findUnterminatedDisplayEnd(s, contentStart);
    out.push('$$');
    out.push(s.slice(contentStart, inferredEnd));
    out.push('$$');
    i = inferredEnd;
  }
  return out.join('');
}

/**
 * Inline `$ ... $`: `$` not escaped by `\`, not part of `$$`.
 * Search from `from` inclusive.
 */
function nextUnescapedInlineDollar(s: string, from: number): number {
  for (let p = from; p < s.length; p++) {
    if (s[p] !== '$') continue;
    if (p > 0 && s[p - 1] === '\\') continue;
    if (s[p + 1] === '$') {
      p++;
      continue;
    }
    return p;
  }
  return -1;
}

/**
 * Replace LaTeX in a **plain-text** slice (never run on strings that contain raw `<...>` HTML).
 * Handles `\[...\]`, `\(...\)`, `$$...$$`, and `$...$` (single-dollar inline).
 */
export function enrichPlainTextWithKatex(segment: string): string {
  if (segment == null || segment === '') return '';
  segment = normalizeQuestionLatexSource(segment);
  if (!/[\\$]/.test(segment)) {
    return escapeHtmlPlain(segment);
  }

  let out = '';
  let i = 0;

  while (i < segment.length) {
    const b1 = segment.indexOf('\\[', i);
    const b2 = segment.indexOf('\\(', i);
    const d2 = segment.indexOf('$$', i);
    const d1 = nextUnescapedInlineDollar(segment, i);

    let open = Infinity;
    let kind: '\\[' | '\\(' | '$$' | '$' | null = null;

    if (b1 >= 0 && b1 < open) {
      open = b1;
      kind = '\\[';
    }
    if (b2 >= 0 && b2 < open) {
      open = b2;
      kind = '\\(';
    }
    if (d2 >= 0 && d2 < open) {
      open = d2;
      kind = '$$';
    }
    if (d1 >= 0 && d1 < open) {
      open = d1;
      kind = '$';
    }

    if (kind == null || open === Infinity) {
      out += escapeHtmlPlain(segment.slice(i));
      break;
    }

    out += escapeHtmlPlain(segment.slice(i, open));

    if (kind === '\\[') {
      const c = segment.indexOf('\\]', open + 2);
      if (c < 0) {
        out += escapeHtmlPlain(segment.slice(open, open + 2));
        i = open + 2;
        continue;
      }
      out += renderTex(segment.slice(open + 2, c), true);
      i = c + 2;
    } else if (kind === '\\(') {
      const c = segment.indexOf('\\)', open + 2);
      if (c < 0) {
        out += escapeHtmlPlain(segment.slice(open, open + 2));
        i = open + 2;
        continue;
      }
      out += renderTex(segment.slice(open + 2, c), false);
      i = c + 2;
    } else if (kind === '$$') {
      let c = segment.indexOf('$$', open + 2);
      let contentEnd = c >= 0 ? c : -1;
      if (contentEnd < 0) {
        const boxedEnd = findBoxedGroupEnd(segment, open + 2);
        if (boxedEnd > open + 2) {
          contentEnd = boxedEnd;
        }
      }
      if (contentEnd < 0) {
        out += escapeHtmlPlain(segment.slice(open));
        break;
      }
      out += renderTex(segment.slice(open + 2, contentEnd), true);
      i = c >= 0 ? c + 2 : contentEnd;
    } else {
      const c = nextUnescapedInlineDollar(segment, open + 1);
      if (c < 0) {
        out += escapeHtmlPlain(segment.slice(open));
        break;
      }
      out += renderTex(segment.slice(open + 1, c), false);
      i = c + 1;
    }
  }

  return out;
}
