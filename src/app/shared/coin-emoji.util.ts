/** Unicode 13 coin (may show as tofu on older engines). */
export const COIN_EMOJI_PRIMARY = '\u{1FA99}';
/** Widely-supported money bag fallback. */
export const COIN_EMOJI_FALLBACK = '\u{1F4B0}';

let cached: string | null = null;

/**
 * Returns 🪙 when the engine likely paints it; otherwise 💰.
 * Uses canvas pixel sampling once per page load (cached).
 */
export function resolveCoinEmoji(): string {
  if (cached !== null) {
    return cached;
  }
  if (typeof document === 'undefined') {
    cached = COIN_EMOJI_PRIMARY;
    return cached;
  }
  cached = detectCoinEmojiSupported() ? COIN_EMOJI_PRIMARY : COIN_EMOJI_FALLBACK;
  return cached;
}

/** @internal testing */
export function resetCoinEmojiCacheForTests(): void {
  cached = null;
}

function countPaintedPixels(emoji: string): number {
  const canvas = document.createElement('canvas');
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return -1;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#101010';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font =
    '24px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  ctx.fillText(emoji, size / 2, size / 2);
  const data = ctx.getImageData(0, 0, size, size).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) {
      continue;
    }
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 248 && g > 248 && b > 248) {
      continue;
    }
    n++;
  }
  return n;
}

function detectCoinEmojiSupported(): boolean {
  try {
    const nCoin = countPaintedPixels(COIN_EMOJI_PRIMARY);
    const nBag = countPaintedPixels(COIN_EMOJI_FALLBACK);
    if (nCoin < 0 || nBag < 0) {
      return false;
    }
    if (nBag < 30) {
      return true;
    }
    if (nCoin < 18 && nBag > 45) {
      return false;
    }
    if (nCoin < nBag * 0.22 && nBag > 40) {
      return false;
    }
    return true;
  } catch {
    // Canvas / getImageData missing or blocked — prefer visible fallback.
    return false;
  }
}
