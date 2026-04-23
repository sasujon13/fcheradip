function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function looksLikeCProgramQuestion(input: string): boolean {
  const text = String(input ?? '').trim();
  if (!text) {
    return false;
  }
  const hasClassicAnchor =
    /#\s*include\b/i.test(text) ||
    /\b(main|printf|scanf|clrscr|getch|print\s*f|scan\s*f|print|scan)\s*\(/i.test(text);
  const hasCSignal =
    /\b(main|printf|scanf|clrscr|getch|for|while|if|switch|return|print\s*f|scan\s*f|print|scan)\b/i.test(text) ||
    /<\s*(stdio|conio)\.h\s*>/i.test(text);
  /** MCQ/CQ snippets: glued `;for` / `for(...){` / `for(...)stmt` without #include or I/O. */
  const hasGluedLoopOrBranch =
    /;\s*(?:for|while|if)\s*\(/.test(text) ||
    /\bfor\s*\([^)]*\)\s*\{/.test(text) ||
    /\bfor\s*\([^)]*\)\s*(?!\{)\s*\S/.test(text) ||
    (/\bif\s*\([^)]*\)\s*\{/.test(text) && /;/.test(text) && /\{/.test(text));
  return (hasClassicAnchor && hasCSignal) || hasGluedLoopOrBranch;
}

function hasIncludeAnchor(text: string): boolean {
  return /#\s*include\b/i.test(text);
}

function hasIoAnchor(text: string): boolean {
  return /\b(printf|scanf|print\s*f|scan\s*f|print|scan)\s*\(/i.test(text);
}

/**
 * `#include<stdio.h>` → `#include <stdio.h>`; `#include"foo.h"` → `#include "foo.h"`.
 * Then break `#include <a>#include <b>` / `#include <a>main` onto separate lines.
 */
function breakGluedIncludeAndFollowingWord(line: string): string {
  let s = line.replace(/(#\s*include)\s*(?=[<"])/gi, '#include ');
  s = s.replace(/\)\s*\{\s*,\s*(?=#\s*include)/gi, ') {\n');
  s = s
    .replace(/(#include\s+<[^>]+>)(?=[^\s\n\r])/gi, '$1\n')
    .replace(/(#include\s+"[^"]+")(?=[^\s\n\r])/gi, '$1\n');
  s = s
    .replace(/(#include\s+<[^>]+>)\s+(?=\S)/gi, '$1\n')
    .replace(/(#include\s+"[^"]+")\s+(?=\S)/gi, '$1\n');
  return s;
}

const IO_CALL_HEAD_RE =
  /^(printf\s*\(|scanf\s*\(|print\s+f\s*\(|scan\s+f\s*\(|print\s*\(|scan\s*\()/i;

function prevNonSpaceChar(s: string, beforeIndex: number): string | null {
  let j = beforeIndex - 1;
  while (j >= 0 && (s[j] === ' ' || s[j] === '\t')) {
    j--;
  }
  return j >= 0 ? s[j]! : null;
}

/** `25print f (` / `x)printf` — start I/O call on its own line when glued to expression tail. */
function needsNewlineBeforeGluedIoCall(s: string, start: number): boolean {
  const prev = prevNonSpaceChar(s, start);
  if (prev == null) return false;
  return /[0-9a-zA-Z_)}\]%]/.test(prev);
}

/**
 * Insert `\n` before printf/scanf/print f/scan f/print/scan calls when glued (outside strings/comments).
 */
function insertNewlinesBeforeGluedIoCalls(line: string): string {
  let out = '';
  let i = 0;
  const n = line.length;
  let inStr: '"' | "'" | null = null;
  let lineComment = false;
  let blockComment = false;

  while (i < n) {
    const c = line[i]!;
    const nxt = line[i + 1];
    if (lineComment) {
      if (c === '\n' || c === '\r') lineComment = false;
      out += c;
      i++;
      continue;
    }
    if (blockComment) {
      if (c === '*' && nxt === '/') {
        out += '*/';
        i += 2;
        blockComment = false;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (inStr) {
      if (c === '\\' && i + 1 < line.length) {
        out += c + line[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && nxt === '/') {
      out += '//';
      i += 2;
      lineComment = true;
      continue;
    }
    if (c === '/' && nxt === '*') {
      out += '/*';
      i += 2;
      blockComment = true;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'";
      out += c;
      i++;
      continue;
    }

    const sub = line.slice(i);
    const m = IO_CALL_HEAD_RE.exec(sub);
    if (m) {
      const len = m[0].length;
      if (needsNewlineBeforeGluedIoCall(line, i)) {
        out += '\n';
      }
      out += line.slice(i, i + len);
      i += len;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * When the API returns the whole program on one ASCII line, insert newlines at safe points
 * (outside strings/comments, after `;` only when `()` depth is 0, and after `{` / `}` where useful).
 */
function densifyMinifiedAsciiCLine(line: string): string {
  const glued = insertNewlinesBeforeGluedIoCalls(breakGluedIncludeAndFollowingWord(line));
  let out = '';
  let i = 0;
  let paren = 0;
  let inStr: '"' | "'" | null = null;
  let lineComment = false;
  let blockComment = false;

  while (i < glued.length) {
    const c = glued[i]!;
    const n = glued[i + 1];
    if (lineComment) {
      if (c === '\n' || c === '\r') lineComment = false;
      out += c;
      i++;
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') {
        out += '*/';
        i += 2;
        blockComment = false;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (inStr) {
      if (c === '\\' && i + 1 < glued.length) {
        out += c + glued[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      out += '//';
      i += 2;
      lineComment = true;
      continue;
    }
    if (c === '/' && n === '*') {
      out += '/*';
      i += 2;
      blockComment = true;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'";
      out += c;
      i++;
      continue;
    }
    if (c === '(') {
      paren++;
      out += c;
      i++;
      continue;
    }
    if (c === ')') {
      paren = Math.max(0, paren - 1);
      out += c;
      i++;
      if (paren === 0) {
        let j = i;
        while (j < glued.length && (glued[j] === ' ' || glued[j] === '\t')) {
          j++;
        }
        if (j < glued.length) {
          const next = glued[j]!;
          if (next === '{') {
            while (i < j) {
              out += glued[i]!;
              i++;
            }
            out += '\n';
            continue;
          }
          if (next !== '(' && next !== ';' && next !== ',' && next !== ')' && next !== ']' && next !== '.') {
            const rest = glued.slice(j);
            const stmtHead =
              /^(continue|break|return|if|for|while|switch|do|printf|scanf|sizeof)\b/i.test(rest) ||
              /^(int|char|void|float|double|unsigned|short|long|static|const|struct)\b/.test(rest);
            /** `for (...)S=S+K;` / `for (...)s = s+a;` / `if (a)x++;` — body glued to `)` without `{`. */
            const gluedStmtAfterParen =
              /^[A-Za-z_]\w*\s*=/.test(rest) ||
              /^[A-Za-z_]\w*\s*\+\+/.test(rest) ||
              /^[A-Za-z_]\w*\s*--/.test(rest) ||
              /^[A-Za-z_]\w*\s*;/.test(rest);
            if (stmtHead || gluedStmtAfterParen) {
              while (i < j) {
                out += glued[i]!;
                i++;
              }
              out += '\n';
            }
          }
        }
      }
      continue;
    }
    if (c === ';' && paren === 0) {
      out += ';';
      i++;
      while (i < glued.length && (glued[i] === ' ' || glued[i] === '\t')) {
        out += glued[i]!;
        i++;
      }
      if (i < glued.length && glued[i] === '}') {
        out += '\n';
        continue;
      }
      if (i < glued.length && !/^[)\]}]/.test(glued[i]!)) {
        out += '\n';
      }
      continue;
    }
    if (c === '{') {
      out += '{';
      i++;
      if (i < glued.length && glued[i] !== '}' && glued[i] !== '\n' && glued[i] !== '\r') {
        out += '\n';
      }
      continue;
    }
    if (c === '}') {
      out += '}';
      i++;
      while (i < glued.length && (glued[i] === ' ' || glued[i] === '\t')) {
        out += glued[i]!;
        i++;
      }
      if (i < glued.length && glued[i] !== '}' && glued[i] !== ';' && glued[i] !== '\n' && glued[i] !== '\r') {
        out += '\n';
      }
      continue;
    }
    out += c;
    i++;
  }
  return out.trimEnd();
}

/** Min length for “packed one line” densify (fragments without #include / printf still count if they look like C). */
const DENSE_MIN_LEN = 12;

/** True when this line is clearly glued C (not only full programs with #include / I/O). */
function lineHasReflowableCAnchors(ct: string): boolean {
  if (hasIoAnchor(ct) || /#\s*include\b/i.test(ct)) return true;
  if (/\b(main|printf|scanf|clrscr|getch)\s*\(/i.test(ct)) return true;
  if (/;\s*(?:for|while|if|switch|int|char|void|float|double|return|continue|break|struct|static|unsigned|long)\b/i.test(ct)) {
    return true;
  }
  if (/;\s*\{/.test(ct)) return true;
  if (/\)\s*\{/.test(ct)) return true;
  if (/\{\s*(?:if|for|while|continue|break|return|int|char|void|float|double)\b/i.test(ct)) {
    return true;
  }
  if (/\)\s*[A-Za-z_]\w*\s*=/.test(ct)) {
    return true;
  }
  return false;
}

function lineLooksPackedOneLineC(ct: string, chunk: string): boolean {
  if (/\n/.test(chunk)) return false;
  if (ct.length < DENSE_MIN_LEN || !/[#;{}]/.test(ct)) return false;
  if (!lineHasReflowableCAnchors(ct)) return false;
  return true;
}

/** `#include <stdio.h> main` / one mega-line with BN after `}` — still run layout. */
function shouldReflowCLayout(ct: string, chunk: string): boolean {
  if (/\n/.test(chunk)) return false;
  if (/#\s*include\s*<[^>]+>\s+\S/.test(ct)) return true;
  if (/#\s*include\s*<[^>]+>\s*[^\s#<"']/.test(ct)) return true;
  if (/\bmain\s*\([^)]*\)\s*(?:int|char|void|float|double|unsigned|#)/i.test(ct)) return true;
  return lineLooksPackedOneLineC(ct, chunk);
}

/** Normalize glued `#include`s, then expand lines that look like packed C (including mixed BN+C one-liners). */
function expandDenseCCodeForDisplay(code: string): string {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      out.push(raw);
      continue;
    }
    const hasIncludeOrMain = /#\s*include\b|\b(main|printf|scanf)\s*\(/i.test(raw);
    if (isBengaliText(raw) && !hasIncludeOrMain) {
      out.push(raw);
      continue;
    }
    const prepped = breakGluedIncludeAndFollowingWord(raw);
    for (const chunk of prepped.split('\n')) {
      const ct = chunk.trim();
      if (!ct) {
        if (chunk.length > 0) {
          out.push(chunk);
        }
        continue;
      }
      if (shouldReflowCLayout(ct, chunk)) {
        out.push(densifyMinifiedAsciiCLine(ct));
      } else {
        out.push(chunk);
      }
    }
  }
  return out.join('\n');
}

function isBengaliText(line: string): boolean {
  return /[\u0980-\u09FF]/.test(line);
}

/** Bengali-only narrative (no C tokens) — no leading indent in {@link formatCProgram}. */
function isBengaliNarrativeOnlyLine(trimmed: string): boolean {
  if (!isBengaliText(trimmed)) return false;
  if (
    /#\s*include\b|\bmain\s*\(|\b(int|char|void|float|double|short|long|unsigned|signed|static|const|struct|union|enum|return|for|if|else|while|do|switch|case|default|break|continue|goto|sizeof|typedef|extern|auto|register)\b|\b(printf|scanf|clrscr|getch)\b|print\s*f|scan\s*f|\bprint\s*\(|\bscan\s*\(/i.test(
      trimmed
    )
  ) {
    return false;
  }
  return true;
}

/**
 * সৃজনশীল sub-clause starts — never part of the C snippet.
 * Use `\p{Script=Bengali}` so we still match if the source uses different Unicode spellings than literal কখগঘ.
 */
function isCreativeBnSubpartLine(line: string): boolean {
  const t = line.trim();
  if (/^\s*[কখগঘ]\./.test(t)) return true;
  try {
    return /^\s*\(\p{Script=Bengali}\)/u.test(t);
  } catch {
    return /^\s*\([কখগঘ]\)/.test(t);
  }
}

/** First line index in `lines` that begins a CQ (ক)–(ঘ) / ক.–ঘ. subpart; -1 if none. */
function indexOfFirstCreativeSubpartLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isCreativeBnSubpartLine(lines[i] ?? '')) {
      return i;
    }
  }
  return -1;
}

/**
 * If block extraction still included CQ text (encoding / same-line edge cases), cut it out of `code`
 * and prepend it to `after`.
 */
function detachCreativeTailFromCode(code: string, after: string): { code: string; after: string } {
  const lines = String(code ?? '').replace(/\r\n?/g, '\n').split('\n');
  const idx = indexOfFirstCreativeSubpartLine(lines);
  if (idx < 0) {
    return { code: code.trim(), after };
  }
  const tail = lines.slice(idx).join('\n').trim();
  const kept = lines.slice(0, idx).join('\n').trimEnd();
  const mergedAfter = [tail, after].filter((s) => (s ?? '').trim().length > 0).join('\n');
  return { code: kept, after: mergedAfter };
}

/** First position of real C on a line (prefix may be Bengali marks / narrative). */
const C_LINE_START_RE =
  /(#\s*include\b|\b(?:void|int|char|float|double|long|short|signed|unsigned)\s+main\s*\(|\bmain\s*\(|\b(?:printf|scanf|print\s*f|scan\s*f|print|scan)\s*\()/i;

/**
 * Peel Bengali (and mixed narrative) from the ends of one physical line so `<code>` never holds BN script.
 */
function peelBengaliAroundCOnLine(line: string): { before: string; code: string; after: string } {
  const raw = line;
  if (!raw.trim()) {
    return { before: '', code: raw, after: '' };
  }
  if (!isBengaliText(raw)) {
    return { before: '', code: raw, after: '' };
  }

  let before = '';
  let s = raw;
  const m = C_LINE_START_RE.exec(s);
  if (m && m.index !== undefined && m.index > 0) {
    const head = s.slice(0, m.index);
    if (isBengaliText(head)) {
      before = head.trimEnd();
      s = s.slice(m.index);
    }
  } else if (!m) {
    const lb = s.lastIndexOf('}');
    if (lb >= 0) {
      const tail0 = s.slice(lb + 1);
      if (tail0.trim() && isBengaliText(tail0)) {
        return { before: '', code: s.slice(0, lb + 1).trim(), after: tail0.trim() };
      }
    }
    return { before: s.trim(), code: '', after: '' };
  }

  let after = '';
  const lastBrace = s.lastIndexOf('}');
  if (lastBrace >= 0) {
    const tail = s.slice(lastBrace + 1);
    if (tail.trim() && isBengaliText(tail)) {
      after = tail.trim();
      s = s.slice(0, lastBrace + 1);
    }
  }
  return { before, code: s, after };
}

type CodeOrBnSeg = { t: 'code'; s: string } | { t: 'bn'; s: string };

/**
 * `<code>` must contain only C / Latin; Bengali narrative is emitted as plain lines between blocks when needed.
 */
function splitExtractedCodeIntoCAndBnSegments(code: string): { leadingBn: string[]; segments: CodeOrBnSeg[] } {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const leadingBn: string[] = [];
  const segments: CodeOrBnSeg[] = [];
  let curCode: string[] = [];

  const flushCode = () => {
    if (curCode.length) {
      const joined = curCode.join('\n').trim();
      if (joined) segments.push({ t: 'code', s: joined });
      curCode = [];
    }
  };

  for (const ln of lines) {
    const p = peelBengaliAroundCOnLine(ln);
    if (p.before.trim()) {
      if (curCode.length === 0 && segments.length === 0) {
        leadingBn.push(p.before.trim());
      } else {
        flushCode();
        segments.push({ t: 'bn', s: p.before.trim() });
      }
    }
    if (p.code.trim()) {
      curCode.push(p.code);
    }
    if (p.after.trim()) {
      flushCode();
      segments.push({ t: 'bn', s: p.after.trim() });
    }
  }
  flushCode();
  return { leadingBn, segments };
}

function isCodeAnchorLine(line: string): boolean {
  if (/#\s*include\b/i.test(line)) return true;
  if (/\b(main|printf|scanf|clrscr|getch|print\s*f|scan\s*f|print|scan)\s*\(/i.test(line)) return true;
  if (/;\s*(?:for|while|if)\s*\(/.test(line)) return true;
  if (/^\s*(?:for|while|if)\s*\(/.test(line)) return true;
  return false;
}

function isProgramAdjacentLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (isCreativeBnSubpartLine(line)) return false;
  if (isBengaliText(t)) return false;
  return /[#<>{}();=,+\-*/%&[\]"]/.test(t) || /\b(main|printf|scanf|clrscr|getch|for|while|if|switch|return|int|char|float|double|void)\b/i.test(t);
}

function extractProgramBlock(input: string): { before: string; code: string; after: string } | null {
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  const anchorIndexes = lines
    .map((line, idx) => (isCodeAnchorLine(line) ? idx : -1))
    .filter((idx) => idx >= 0);
  if (!anchorIndexes.length) {
    return null;
  }

  let start = anchorIndexes[0];
  let end = anchorIndexes[anchorIndexes.length - 1];

  while (start > 0 && isProgramAdjacentLine(lines[start - 1])) {
    start -= 1;
  }
  while (end < lines.length - 1 && isProgramAdjacentLine(lines[end + 1])) {
    end += 1;
  }

  const codeLines = lines.slice(start, end + 1);
  if (!codeLines.some((line) => isCodeAnchorLine(line))) {
    return null;
  }

  return {
    before: lines.slice(0, start).join('\n').trim(),
    code: codeLines.join('\n').trim(),
    after: lines.slice(end + 1).join('\n').trim(),
  };
}

function shouldIncreaseIndentForNextLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('#') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
    return false;
  }
  if (t.endsWith('{')) {
    return true;
  }
  if (t.endsWith(';') || t.endsWith('}') || t.endsWith(':')) {
    return false;
  }
  if (isBracelessControlHeader(t)) {
    return false;
  }
  return true;
}

function normalizeBraceAfterParenLines(lines: string[]): string[] {
  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const prev = merged.length > 0 ? merged[merged.length - 1].trim() : '';
    if (prev && /\)\s*$/.test(prev) && /^\{/.test(trimmed)) {
      merged[merged.length - 1] = `${prev.replace(/\s+$/, '')} {`;
      const rest = trimmed.slice(1).trim();
      if (rest) {
        merged.push(rest);
      }
      continue;
    }
    if (/\)\s*\{/.test(trimmed)) {
      const braceIdx = trimmed.indexOf('{');
      const beforeBrace = trimmed.slice(0, braceIdx).replace(/\s+$/, '');
      const afterBrace = trimmed.slice(braceIdx + 1).trim();
      merged.push(`${beforeBrace} {`);
      if (afterBrace) {
        merged.push(afterBrace);
      }
      continue;
    }
    merged.push(trimmed);
  }
  return merged;
}

/** `if (..)` / `for (..)` / `while` / `switch` / `else if` / lone `else` with no `{` on same line — single following stmt, then back out. */
function isBracelessControlHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.includes('{')) return false;
  if (/^\s*else\s*$/i.test(t)) return true;
  if (!/\)\s*$/.test(t)) return false;
  return /^\s*(if|else\s+if|for|while|switch)\b/i.test(t);
}

/** Indent level (0-based) for the single stmt after `if (...)` / `for (...)` / `else` with no `{` — one +4 step vs the header (see Helper.c: `if` then deeper `continue`). */
function bracelessSingleStmtIndentLevel(base: number, _headerLine: string): number {
  return base + 1;
}

function formatCProgram(code: string): string {
  const lines = normalizeBraceAfterParenLines(
    String(code ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\t/g, '    ').replace(/[ \t]+$/g, ''))
  );

  const out: string[] = [];
  let indent = 0;
  /** Base indent + header text for the single stmt after `if (...)` / `for (...)` / `else` with no `{`. */
  let pendingBraceless: { base: number; header: string } | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    if (isBengaliNarrativeOnlyLine(trimmed)) {
      out.push(trimmed);
      indent = 0;
      pendingBraceless = null;
      continue;
    }

    if (pendingBraceless !== null) {
      const { base, header } = pendingBraceless;
      pendingBraceless = null;
      if (isBengaliNarrativeOnlyLine(trimmed)) {
        out.push(trimmed);
        indent = 0;
        continue;
      }
      const bodyIndent = bracelessSingleStmtIndentLevel(base, header);
      out.push(`${'    '.repeat(bodyIndent)}${trimmed}`);
      if (trimmed.startsWith('#')) {
        indent = base;
        continue;
      }
      if (trimmed.endsWith('{')) {
        indent = bodyIndent + 1;
        continue;
      }
      indent = base;
      continue;
    }

    let lineIndent = indent;
    if (trimmed.startsWith('}')) {
      lineIndent = Math.max(0, lineIndent - 1);
      indent = lineIndent;
    }
    if (trimmed.startsWith('#')) {
      lineIndent = 0;
    }

    out.push(`${'    '.repeat(lineIndent)}${trimmed}`);

    if (trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.endsWith('{')) {
      indent = lineIndent + 1;
      continue;
    }
    if (isBracelessControlHeader(trimmed)) {
      pendingBraceless = { base: lineIndent, header: trimmed };
      continue;
    }
    if (shouldIncreaseIndentForNextLine(trimmed)) {
      indent = lineIndent + 1;
      continue;
    }
    indent = lineIndent;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** One `<br />` per logical line; spaces kept as returned (no `&nbsp;` — allows wrap at spaces). */
function encodeCodeHtml(code: string): string {
  return code
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br />');
}

export function formatMaybeCProgramQuestionText(raw: string): string {
  const input = String(raw ?? '').trim();
  if (!input || input.includes('class="q-code-block"') || !looksLikeCProgramQuestion(input)) {
    return input;
  }

  const block = extractProgramBlock(input);
  if (!block || !block.code) {
    return input;
  }

  const detached = detachCreativeTailFromCode(block.code, block.after);
  const after = detached.after;
  const { leadingBn, segments } = splitExtractedCodeIntoCAndBnSegments(detached.code);
  const expandedSegments: CodeOrBnSeg[] = segments.map((seg) =>
    seg.t === 'bn' ? seg : { t: 'code', s: expandDenseCCodeForDisplay(seg.s) }
  );
  const codeOnlyJoined = expandedSegments
    .filter((s): s is { t: 'code'; s: string } => s.t === 'code')
    .map((s) => s.s)
    .join('\n')
    .trim();
  if (!codeOnlyJoined) {
    return input;
  }

  const codeLineCount = codeOnlyJoined
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
  if (!hasIncludeAnchor(codeOnlyJoined) && hasIoAnchor(codeOnlyJoined) && codeLineCount <= 4) {
    return input;
  }

  const parts: string[] = [];
  const mergedBefore = [block.before, ...leadingBn].filter((x) => (x ?? '').trim()).join('\n').trim();
  if (mergedBefore) {
    parts.push(mergedBefore);
  }
  for (const seg of expandedSegments) {
    if (seg.t === 'code') {
      const formatted = formatCProgram(seg.s);
      if (!formatted.trim()) {
        continue;
      }
      parts.push(`<span class="q-code-block"><code>${encodeCodeHtml(formatted)}</code></span>`);
    } else if (seg.s.trim()) {
      parts.push(seg.s.trim());
    }
  }
  if (after) {
    parts.push(after);
  }
  return parts.join('\n');
}
