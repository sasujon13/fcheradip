/** Body font at/above this px uses {@link QUESTION_RICH_IMG_BASE_MAX_PX}; each +1px adds {@link QUESTION_RICH_IMG_STEP_PX} to the image cap. */
export const QUESTION_RICH_IMG_FONT_MIN_PX = 7;

/** Image cap (longest side) at {@link QUESTION_RICH_IMG_FONT_MIN_PX}. */
export const QUESTION_RICH_IMG_BASE_MAX_PX = 240;

/** Each +1px body font adds this many px to the image cap (8→260, 9→280, …). */
export const QUESTION_RICH_IMG_STEP_PX = 20;

/** Hard ceiling for the font-based image cap (reached at 19px font and above). */
export const QUESTION_RICH_IMG_ABSOLUTE_MAX_PX = 480;

/** @deprecated Use {@link QUESTION_RICH_IMG_BASE_MAX_PX}; kept for callers expecting a single “floor” constant. */
export const QUESTION_RICH_IMG_MAX_PX = QUESTION_RICH_IMG_BASE_MAX_PX;

/**
 * Max width/height (px) for inline question images from body/text font size:
 * 7→240, 8→260, … up to {@link QUESTION_RICH_IMG_ABSOLUTE_MAX_PX}.
 */
export function questionRichImgMaxPxForFontSize(fontSizePx: number): number {
  const parsed = Number(fontSizePx);
  if (!Number.isFinite(parsed)) {
    return QUESTION_RICH_IMG_BASE_MAX_PX;
  }
  const fs = Math.max(QUESTION_RICH_IMG_FONT_MIN_PX, Math.round(parsed));
  const raw =
    QUESTION_RICH_IMG_BASE_MAX_PX +
    (fs - QUESTION_RICH_IMG_FONT_MIN_PX) * QUESTION_RICH_IMG_STEP_PX;
  return Math.min(QUESTION_RICH_IMG_ABSOLUTE_MAX_PX, raw);
}

function readRichImgMaxFromElement(img: HTMLImageElement): number {
  const fs = parseFloat(getComputedStyle(img).fontSize);
  if (!Number.isFinite(fs) || fs <= 0) {
    return questionRichImgMaxPxForFontSize(QUESTION_RICH_IMG_FONT_MIN_PX);
  }
  return questionRichImgMaxPxForFontSize(fs);
}

/** Inner-most column roots first (match preview / topic / export wrappers). */
const RICH_IMG_COL_ROOT_SELECTORS = [
  '.preview-q-text',
  '.preview-q-opt-html',
  '.preview-q-subpart',
  '.preview-q-content',
  '.topic-question-text',
  '.topic-question-opt-html',
  '.topic-question-subpart',
  '.topic-question-content',
] as const;

function usableContentWidthPx(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  return Math.max(0, el.clientWidth - pl - pr);
}

/**
 * `min(fontMaxPx, column layout px)` using unscaled layout widths — never use `%` here: under
 * `transform: scale()` (live preview overview), `max-width: … 100%` can resolve like full column.
 */
function readRichImgWidthCapPx(img: HTMLImageElement, fontMaxPx: number): number {
  for (const sel of RICH_IMG_COL_ROOT_SELECTORS) {
    const el = img.closest(sel);
    if (el instanceof HTMLElement) {
      const uw = usableContentWidthPx(el);
      if (uw > 0) {
        return Math.min(fontMaxPx, uw);
      }
    }
  }
  return fontMaxPx;
}

/**
 * Fit image in a max×max box (preserve aspect ratio), max from inherited font size.
 * Width also respects column width in layout px (shrink-to-fit when column &lt; font cap).
 */
export function applyQuestionRichImgSizing(img: HTMLImageElement): void {
  const max = readRichImgMaxFromElement(img);
  const widthCap = readRichImgWidthCapPx(img, max);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) {
    return;
  }

  img.style.removeProperty('width');
  img.style.removeProperty('height');
  img.style.removeProperty('max-width');
  img.style.removeProperty('max-height');

  if (w <= max && h <= max) {
    img.style.setProperty('width', 'auto');
    img.style.setProperty('height', 'auto');
    img.style.setProperty('max-width', `${widthCap}px`);
    img.style.setProperty('max-height', `${max}px`);
    img.style.setProperty('object-fit', 'contain');
    img.style.setProperty('object-position', 'left center');
    return;
  }

  const scale = Math.min(max / w, max / h);
  let nw = Math.round(w * scale);
  let nh = Math.round(h * scale);
  if (nw > widthCap) {
    nh = Math.round((nh * widthCap) / nw);
    nw = widthCap;
  }
  img.style.setProperty('width', `${nw}px`);
  img.style.setProperty('height', `${nh}px`);
  img.style.setProperty('max-width', `${widthCap}px`);
  img.style.setProperty('object-fit', 'contain');
  img.style.setProperty('object-position', 'left center');
}
