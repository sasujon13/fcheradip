import katex from 'katex';

/** Escape plaintext for HTML. */
export function escapeHtmlPlain(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderTex(tex: string, displayMode: boolean): string {
  const t = tex.trim();
  if (!t) return '';
  try {
    return katex.renderToString(t, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return escapeHtmlPlain(tex);
  }
}

/**
 * DB / PDF export quirks: `\\ $$`, `$$\boxed{...}$`, missing closing `$$`, zero-width chars.
 * Applied before KaTeX so answer/explanation/stem all behave the same on /question.
 */
export function normalizeQuestionLatexSource(text: string): string {
  if (!text) return '';
  let s = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Line-break markers before display math (common in CQ explanations).
  s = s.replace(/\\+\s*\$\$/g, '\n$$');
  // Single trailing `$` after boxed block: `$$\boxed{...}$` → `$$...$$`
  s = s.replace(
    /\$\$(\s*\\boxed\{(?:[^{}]|\{[^{}]*\})*\})\s*\$(?!\$)/g,
    '$$$1$$'
  );
  return closeUnterminatedDisplayMath(s);
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

/** Insert closing `$$` after orphan `$$\boxed{...}` before following Bengali/Latin text. */
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
    out.push(s.slice(open));
    break;
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
