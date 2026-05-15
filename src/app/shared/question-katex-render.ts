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
  return katex.renderToString(t, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  });
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
      const c = segment.indexOf('$$', open + 2);
      if (c < 0) {
        out += escapeHtmlPlain(segment.slice(open));
        break;
      }
      out += renderTex(segment.slice(open + 2, c), true);
      i = c + 2;
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
