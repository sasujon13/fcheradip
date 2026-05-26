/** Width of coin counter display including the `.` separator (e.g. `0.00000`, `500.000`). */
export const COIN_COUNTER_DISPLAY_CHARS = 7;

/**
 * Formats whole-coin balances for compact header UI: pads with fractional zeros so the
 * number spans {@link COIN_COUNTER_DISPLAY_CHARS} characters when the integer fits; otherwise
 * shows the full integer (e.g. `999999`, `25000000`).
 */
export function formatCoinCounter(value: unknown): string {
  const raw = typeof value === 'number' ? value : Number(value);
  const n =
    Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  const intStr = String(n);
  const w = COIN_COUNTER_DISPLAY_CHARS;
  if (intStr.length >= w) {
    return intStr;
  }
  const fracLen = w - intStr.length - 1;
  return fracLen > 0 ? `${intStr}.${'0'.repeat(fracLen)}` : intStr;
}
