import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { formatMaybeCProgramQuestionText } from './c-program-question-format';
import { enrichPlainTextWithKatex, normalizeQuestionLatexSource } from './question-katex-render';
import {
  buildRomanMcqPackHtml,
  chooseRomanMcqPackLines,
  normalizeMcqNicherText,
  normalizeRomanMcqSource,
  romanSegmentBodyToDisplayHtml,
  RomanMarker,
  RomanMcqLayoutContext,
  splitHtmlAtRomanMarkers,
} from './roman-mcq-pack';
import {
  detectMcqOptionFont,
  measurePlainTextWidthPx,
  resolveRomanMcqMaxWidthPx,
} from './roman-mcq-measure';

/** Roman numeral line pattern: i., ii., iii. or I., II., III. at start of line */
const ROMAN_LINE = /^\s*(i|ii|iii|I|II|III)\./;

/** সৃজনশীল sub-clauses: (ক) (খ) (গ) (ঘ) at line start (Bengali letters in ASCII parens). */
const BN_PAREN_KHOGH_LINE = /^\s*\([কখগঘ]\)/;

/** Match code block, img stack+caption, bare <img>, or <br> on a single line (stack pattern first). */
const CODE_BLOCK_RE =
  /<span class="q-code-block"[^>]*><code>[\s\S]*?<\/code><\/span>/gi;
const IMG_STACK_CAPTION =
  /<span class="q-rich-img-stack[^"]*"[^>]*>\s*<img\b[^>]*>\s*<span class="q-rich-img-caption">[^<]*<\/span>\s*<\/span>/gi;
const IMG_STACK_BARE =
  /<span class="q-rich-img-stack[^"]*"[^>]*>\s*<img\b[^>]*>\s*<\/span>/gi;
const IMG_STACK_OR_IMG_OR_BR_RE = new RegExp(
  `${CODE_BLOCK_RE.source}|${IMG_STACK_CAPTION.source}|${IMG_STACK_BARE.source}|<img\\b[^>]*>|<br\\s*\\/?>`,
  'gi'
);

/**
 * Decode `&lt;img ...&gt;` etc. from API/DB so tags are recognized (browser-only; pipe runs in browser).
 */
function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

function escapeHtml(text: string): string {
  const el = document.createElement('div');
  el.textContent = text;
  return el.innerHTML;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isSafeImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  const low = s.slice(0, 32).toLowerCase();
  if (low.startsWith('javascript:') || low.startsWith('vbscript:')) return false;

  if (/^data:/i.test(s)) {
    return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(s);
  }
  if (/^https?:\/\//i.test(s)) return true;
  if (s.startsWith('//')) return true;
  if (s.startsWith('/')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false;
  return true;
}

function extractImgSrc(tag: string): string | null {
  const quoted = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag);
  if (quoted) return quoted[1].trim();
  const bare = /\bsrc\s*=\s*([^\s>]+)/i.exec(tag);
  return bare ? bare[1].trim() : null;
}

function extractImgAlt(tag: string): string {
  const quoted = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag);
  if (quoted) return quoted[1];
  return '';
}

function extractImgNumericAttr(tag: string, name: 'width' | 'height'): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)["']?`, 'i');
  const m = re.exec(tag);
  return m ? m[1] : null;
}

function extractImgClass(tag: string): string | null {
  const quoted = /\bclass\s*=\s*["']([^"']*)["']/i.exec(tag);
  if (!quoted) return null;
  const c = quoted[1].trim();
  if (!c) return null;
  return /^[a-zA-Z0-9_\s-]+$/.test(c) ? c : null;
}

function extractDataQMediaFallback(tag: string): string | null {
  const quoted = /\bdata-q-media-fallback\s*=\s*["']([^"']*)["']/i.exec(tag);
  return quoted ? quoted[1].trim() : null;
}

function sanitizeWhitelistedImgTag(rawTag: string): string | null {
  const src = extractImgSrc(rawTag);
  if (!src || !isSafeImageSrc(src)) return null;
  const alt = extractImgAlt(rawTag);
  const w = extractImgNumericAttr(rawTag, 'width');
  const h = extractImgNumericAttr(rawTag, 'height');
  const cls = extractImgClass(rawTag);
  const clsCombined = cls ? `q-rich-img ${cls}` : 'q-rich-img';
  const fb = extractDataQMediaFallback(rawTag);
  let out = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="${escapeAttr(clsCombined)}"`;
  if (fb) {
    out += ` data-q-media-fallback="${escapeAttr(fb)}"`;
  }
  if (w) out += ` width="${w}"`;
  if (h) out += ` height="${h}"`;
  out += ' loading="lazy" decoding="async" />';
  return out;
}

function escapeHtmlPreserveImages(line: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  IMG_STACK_OR_IMG_OR_BR_RE.lastIndex = 0;
  while ((m = IMG_STACK_OR_IMG_OR_BR_RE.exec(line)) !== null) {
    parts.push(enrichPlainTextWithKatex(line.slice(lastIndex, m.index)));
    const token = m[0];
    if (/^<br\s*\/?>/i.test(token)) {
      parts.push('<br />');
    } else if (/^<span class="q-code-block"[^>]*><code>[\s\S]*<\/code><\/span>$/i.test(token)) {
      parts.push(token);
    } else if (/^<span class="q-rich-img-stack[^"]*"[^>]*>/i.test(token)) {
      parts.push(token);
    } else {
      const safe = sanitizeWhitelistedImgTag(token);
      parts.push(safe != null ? safe : escapeHtml(token));
    }
    lastIndex = m.index + token.length;
  }
  parts.push(enrichPlainTextWithKatex(line.slice(lastIndex)));
  return parts.join('');
}

function formatHtmlFragment(fragment: string): string {
  return escapeHtmlPreserveImages(decodeHtmlEntities(fragment));
}

function formatRomanSegment(marker: RomanMarker, bodyHtml: string): string {
  const body = bodyHtml.trim();
  const inner = body ? formatHtmlFragment(romanSegmentBodyToDisplayHtml(body)) : '';
  return inner ? `${marker}. ${inner}` : `${marker}.`;
}

function resolveLayoutContext(arg: unknown): RomanMcqLayoutContext {
  if (arg === 'option' || arg === 'stem' || arg === 'export') return arg;
  return 'stem';
}

@Pipe({ name: 'wrapRomanLines' })
export class WrapRomanLinesPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | null | undefined, layoutCtx?: unknown): SafeHtml {
    if (text == null || text === '') return this.sanitizer.bypassSecurityTrustHtml('');
    const ctx = resolveLayoutContext(layoutCtx);
    const prepared = normalizeRomanMcqSource(
      normalizeQuestionLatexSource(formatMaybeCProgramQuestionText(String(text)))
    );
    const nicherReady = normalizeMcqNicherText(prepared);
    const glued = nicherReady.replace(
      /([\u0980-\u09FF])(iii|ii|i)\.(?!\d)/gi,
      (_match, script: string, roman: string) => `${script}<br />${roman}.`
    );

    const parsed = splitHtmlAtRomanMarkers(glued);
    if (parsed && parsed.segments.length >= 2) {
      const maxW = resolveRomanMcqMaxWidthPx(ctx);
      const font = detectMcqOptionFont();
      const packLines = chooseRomanMcqPackLines(parsed.segments, maxW, (plain) =>
        measurePlainTextWidthPx(plain, font)
      );
      const html = buildRomanMcqPackHtml(
        parsed,
        packLines,
        formatHtmlFragment,
        formatRomanSegment
      );
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    const lines = glued
      .split(/(?:\r?\n|<br\s*\/?>)/i)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const parts = lines.map((line) => {
      if (/^\s*<span class="q-code-block"[^>]*><code>[\s\S]*<\/code><\/span>\s*$/i.test(line)) {
        return line.trim();
      }
      const decodedLine = decodeHtmlEntities(line);
      const escaped = escapeHtmlPreserveImages(decodedLine);
      const isRoman = ROMAN_LINE.test(decodedLine);
      const isBnParen = !isRoman && BN_PAREN_KHOGH_LINE.test(decodedLine);
      const cls = isRoman
        ? 'topic-question-line topic-question-roman-line'
        : isBnParen
          ? 'topic-question-line topic-question-bn-paren-line'
          : 'topic-question-line';
      return `<span class="${cls}">${escaped}</span>`;
    });
    return this.sanitizer.bypassSecurityTrustHtml(parts.join(''));
  }
}
