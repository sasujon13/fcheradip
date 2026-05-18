import { RomanMcqLayoutContext, defaultMaxWidthForRomanMcqLayout } from './roman-mcq-pack';

let canvasCtx: CanvasRenderingContext2D | null = null;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!canvasCtx) {
    const c = document.createElement('canvas');
    canvasCtx = c.getContext('2d');
  }
  return canvasCtx;
}

/** Measure plain-text width (px) for roman pack lines. */
export function measurePlainTextWidthPx(
  text: string,
  font = '13px "Noto Sans Bengali", "Segoe UI", sans-serif'
): number {
  const ctx = getCanvasContext();
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function resolveRomanMcqMaxWidthPx(
  ctx: RomanMcqLayoutContext,
  explicit?: number
): number {
  if (explicit != null && explicit > 0) return explicit;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const v = getComputedStyle(root).getPropertyValue('--roman-mcq-pack-max-width').trim();
    if (v.endsWith('px')) {
      const n = parseFloat(v);
      if (n > 0) return n;
    }
  }
  return defaultMaxWidthForRomanMcqLayout(ctx);
}

export function detectMcqOptionFont(): string {
  if (typeof document === 'undefined') {
    return '13px "Noto Sans Bengali", "Segoe UI", sans-serif';
  }
  const probe =
    document.querySelector('.topic-question-opt-html') ||
    document.querySelector('.preview-q-opt-html');
  if (probe) {
    const st = getComputedStyle(probe);
    return `${st.fontSize} ${st.fontFamily}`;
  }
  return '13px "Noto Sans Bengali", "Segoe UI", sans-serif';
}
