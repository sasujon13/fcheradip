import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * - Strips [IMG] markers (ASCII or fullwidth brackets; not shown as text).
 * - Turns `/media/...`, `http(s)://.../media/...`, or `media/...` into <img> tags.
 * - Path after `/media/` allows any char except `<` `"` (spaces in filenames, Bengali, `_(`…`)`, etc.).
 *   Caption is `_(` … `)` immediately before `.ext`; use greedy matching to the **last** `)` so text like
 *   `(Fig1%20-…%E0…here)` or nested `(` `)` in the label does not break parsing.
 * - Uses src={backendUrl}/manage/media/... (dev: http://localhost:8000 so images load from Django, not :4200).
 *   Production: backendUrl '' → /manage/media/... same origin (see cheradip.urls static on /manage/media/).
 * - Optional image label: filename ends with `_(`caption`).ext` — label under image (1em). Empty `_()` → no label.
 * - If basename has `_(`…`)` and the long filename 404s, `data-q-media-fallback` uses stem.ext (e.g. 2_7_0026_0.png);
 *   caption/label still comes from the full path in the question text.
 * - For raster image extensions only: under `/media/latex/...` try **compiled SVG** first (exact basename `.svg`, then stem
 *   `.svg` if captioned), then fall back to the original image path behavior. SVGs are generated offline by the backend
 *   watcher (`latex` + `dvisvgm`) and give the browser a crisp replacement for the original image.
 * - One image: <br/> before and after. Multiple: <br/> before first only, <br/> after last only; middle imgs
 *   stay inline so they wrap together when the column is narrow.
 * - One media pass only (never matches inside src=".../manage/media/...").
 * - After `.ext`, use an ASCII-only end guard (not `\\b`): matches Python PDF export and allows Bengali like
 *   `ক)` immediately after `.png` (Python `\\b` treats many scripts as word chars and would skip those paths).
 */
const EXT = 'png|jpe?g|gif|webp|svg|ico|bmp|mp4|webm|mov|bin';
/** End of media path: not followed by ASCII alnum or `_` (path may continue with Bengali, punctuation, etc.). */
const EXT_END = '(?![A-Za-z0-9_])';

/** Segment after `/media/` up to final `.ext` — must not exclude spaces (captions like `Fig1 - … here`). */
const PATH_BODY = '[^<>"]+';

/**
 * - Full URL ending in /media/.../file.ext
 * - /media/... (optional whitespace before slash so ` /media/...` matches)
 * - `media/...` without leading slash (prefix becomes leading text)
 */
const MEDIA_ANY_RE = new RegExp(
  `https?://[^<>"]+?/media/${PATH_BODY}\\.(?:${EXT})${EXT_END}|` +
    `\\s*/media/${PATH_BODY}\\.(?:${EXT})${EXT_END}|` +
    `(?:^|[\\s])media/${PATH_BODY}\\.(?:${EXT})${EXT_END}`,
  'gi'
);

/** Shown as alt (and when the image fails to load in many browsers). */
export const QUESTION_MEDIA_IMG_ALT = 'Images are loading...';
const QUESTION_MEDIA_IMG_INLINE_STYLE =
  'max-width:100%;height:auto;max-height:480px;vertical-align:middle;display:inline-block;box-sizing:border-box;margin:2px 8px 6px 0;object-fit:contain;object-position:left center;';
const QUESTION_MEDIA_STACK_INLINE_STYLE =
  'display:inline-block;vertical-align:middle;max-width:100%;box-sizing:border-box;margin:1px 3px;';
const QUESTION_MEDIA_CAPTION_INLINE_STYLE =
  'display:block;font-size:1em;line-height:inherit;margin-top:0.35em;color:inherit;font-weight:normal;text-align:left;';

/**
 * Decode `%3A`-style escapes from the caption fragment so Windows-safe filenames can show `:` (and other chars).
 */
export function decodeCaptionFromFilenameFragment(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s.includes('%')) {
    return s;
  }
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
}

/**
 * Optional caption: `_(` … `).ext` — match to the **last** `)` before the extension (not `[^)]*`, which
 * breaks on any `)` inside the label or on `%29`-style bytes misread as `)` in edge cases).
 */
export function extractCaptionFromMediaPath(pathFromMedia: string): string | null {
  const m = pathFromMedia.match(/_\((.*)\)(\.[a-z0-9]+)$/i);
  if (!m) {
    return null;
  }
  const inner = decodeCaptionFromFilenameFragment(m[1] ?? '');
  return inner.length > 0 ? inner : null;
}

function escapeCaptionText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * If basename is `stem_(caption).ext`, return `/media/.../stem.ext` for the on-disk short name.
 * Used as img fallback when the captioned filename is not present on the server.
 */
export function buildStemOnlyMediaPathIfCaptioned(pathFromMedia: string): string | null {
  const p = pathFromMedia.startsWith('/') ? pathFromMedia : `/${pathFromMedia}`;
  const slash = p.lastIndexOf('/');
  if (slash < 0) {
    return null;
  }
  const dir = p.slice(0, slash + 1);
  let base = p.slice(slash + 1);
  try {
    base = decodeURIComponent(base);
  } catch {
    /* keep raw */
  }
  const m = base.match(/^(.+?)(_\([^)]*\))?(\.[a-z0-9]+)$/i);
  if (!m || !m[2]) {
    return null;
  }
  const stem = m[1];
  const ext = m[3].toLowerCase();
  const stemOnly = stem + ext;
  if (base === stemOnly) {
    return null;
  }
  return dir + stemOnly;
}

/** Image extensions that may have a parallel LaTeX render under `media/latex/...` (not video/bin). */
const IMAGE_EXT_FOR_LATEX_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;

/**
 * `/media/foo/bar.png` → `/media/latex/foo/bar.<ext>` (insert `latex` after `media/`, swap extension).
 */
function buildLatexSiblingPathFromMediaPath(pathFromMedia: string, ext: '.svg'): string {
  const p = pathFromMedia.startsWith('/') ? pathFromMedia : `/${pathFromMedia}`;
  const m = p.match(/^\/media\/(.+)$/i);
  if (!m) {
    return '';
  }
  const rest = m[1].replace(/\.[^.]+$/, ext);
  return `/media/latex/${rest}`;
}

/**
 * `/media/foo/bar.png` → `/media/latex/foo/bar.svg`.
 */
export function buildLatexSvgPathFromMediaPath(pathFromMedia: string): string {
  return buildLatexSiblingPathFromMediaPath(pathFromMedia, '.svg');
}

/**
 * Same stem-only rule as {@link buildStemOnlyMediaPathIfCaptioned}, then `.svg` under `media/latex/...`.
 */
export function buildStemOnlyLatexSvgPathFromMediaPath(pathFromMedia: string): string | null {
  const stem = buildStemOnlyMediaPathIfCaptioned(pathFromMedia);
  if (!stem) {
    return null;
  }
  const t = buildLatexSvgPathFromMediaPath(stem);
  return t || null;
}

@Pipe({ name: 'formatQuestionMedia' })
export class FormatQuestionMediaPipe implements PipeTransform {
  transform(text: string | null | undefined): string {
    if (text == null || text === '') {
      return '';
    }
    let s = String(text);
    s = s.replace(/[\[［]\s*[Ii][Mm][Gg]\s*[\]］]\s*/g, '');

    const origin = (environment as { backendUrl?: string }).backendUrl?.replace(/\/+$/, '') ?? '';

    const countRe = new RegExp(MEDIA_ANY_RE.source, MEDIA_ANY_RE.flags);
    const mediaCount = Array.from(s.matchAll(countRe)).length;
    MEDIA_ANY_RE.lastIndex = 0;
    if (mediaCount === 0) {
      return s;
    }

    let mediaIndex = 0;
    s = s.replace(MEDIA_ANY_RE, (m) => {
      let leading = '';
      let pathFromMedia: string;
      const slash = m.indexOf('/media/');
      if (slash >= 0) {
        leading = m.slice(0, slash);
        pathFromMedia = m.slice(slash);
      } else {
        const bare = m.search(/\bmedia\//i);
        if (bare < 0) {
          return m;
        }
        leading = m.slice(0, bare);
        pathFromMedia = '/' + m.slice(bare);
      }
      const src = `${origin}/manage${pathFromMedia}`;
      const caption = extractCaptionFromMediaPath(pathFromMedia);
      const stemPath = buildStemOnlyMediaPathIfCaptioned(pathFromMedia);
      const fallbackSrc = stemPath != null ? `${origin}/manage${stemPath}` : null;
      const fallbackAttr =
        fallbackSrc != null ? ` data-q-media-fallback="${escapeHtmlAttr(fallbackSrc)}"` : '';
      const tryLatex = IMAGE_EXT_FOR_LATEX_RE.test(pathFromMedia);
      let coreInner: string;
      if (tryLatex) {
        const latexSvgPath = buildLatexSvgPathFromMediaPath(pathFromMedia);
        const latexStemSvgPath = buildStemOnlyLatexSvgPathFromMediaPath(pathFromMedia);
        const svgFetchPrimary = latexSvgPath ? `/manage${latexSvgPath}` : '';
        const svgFetchFallback =
          latexStemSvgPath != null && latexStemSvgPath !== latexSvgPath ? `/manage${latexStemSvgPath}` : null;
        const svgFbAttr =
          svgFetchFallback != null ? ` data-q-svg-fallback="${escapeHtmlAttr(svgFetchFallback)}"` : '';
        const spanDataAttrs =
          ` data-q-svg-primary="${escapeHtmlAttr(svgFetchPrimary)}"${svgFbAttr}` +
          ` data-q-img-src="${escapeHtmlAttr(src)}"` +
          (fallbackSrc != null ? ` data-q-media-fallback="${escapeHtmlAttr(fallbackSrc)}"` : '');
        const imgPending =
          `<img data-q-img-src="${escapeHtmlAttr(src)}"${fallbackAttr} alt="${QUESTION_MEDIA_IMG_ALT}" class="q-rich-img question-inline-img" style="${QUESTION_MEDIA_IMG_INLINE_STYLE}" loading="lazy" decoding="async" />`;
        coreInner =
          caption != null
            ? `<span class="q-rich-img-stack q-rich-media-try-latex" style="${QUESTION_MEDIA_STACK_INLINE_STYLE}"${spanDataAttrs}>${imgPending}<span class="q-rich-img-caption" style="${QUESTION_MEDIA_CAPTION_INLINE_STYLE}">${escapeCaptionText(caption)}</span></span>`
            : `<span class="q-rich-img-stack q-rich-media-try-latex" style="${QUESTION_MEDIA_STACK_INLINE_STYLE}"${spanDataAttrs}>${imgPending}</span>`;
      } else {
        const img =
          `<img src="${escapeHtmlAttr(src)}"${fallbackAttr} alt="${QUESTION_MEDIA_IMG_ALT}" class="q-rich-img question-inline-img" style="${QUESTION_MEDIA_IMG_INLINE_STYLE}" loading="lazy" decoding="async" />`;
        coreInner =
          caption != null
            ? `<span class="q-rich-img-stack" style="${QUESTION_MEDIA_STACK_INLINE_STYLE}">${img}<span class="q-rich-img-caption" style="${QUESTION_MEDIA_CAPTION_INLINE_STYLE}">${escapeCaptionText(caption)}</span></span>`
            : img;
      }

      const idx = mediaIndex++;
      const n = mediaCount;
      const core = `${leading}${coreInner}`;
      if (n === 1) {
        return `<br />${core}<br />`;
      }
      if (idx === 0) {
        return `<br />${core}`;
      }
      if (idx === n - 1) {
        return `${core}<br />`;
      }
      return core;
    });
    return s;
  }
}
