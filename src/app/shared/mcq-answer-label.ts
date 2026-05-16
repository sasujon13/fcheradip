/** MCQ option keys (aligned with /question list UI). */
export const MCQ_OPTION_KEYS_BN = ['ক', 'খ', 'গ', 'ঘ'] as const;
export const MCQ_OPTION_KEYS_EN = ['a', 'b', 'c', 'd'] as const;

function stripPlain(v: unknown, formatOption: (raw: string) => string): string {
  if (v == null) return '';
  const raw = typeof v === 'string' ? v.trim() : String(v).trim();
  if (!raw) return '';
  return formatOption(raw)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function useLatinLabel(raw: string, lower: string): boolean {
  return /^[a-d]$/i.test(raw) || /^[a-d]$/i.test(lower);
}

function labelAtIndex(index: number, raw: string, lower: string): string {
  const i = Math.max(0, Math.min(3, index));
  return useLatinLabel(raw, lower) ? MCQ_OPTION_KEYS_EN[i] : MCQ_OPTION_KEYS_BN[i];
}

function optionIndexFromToken(raw: string): number | null {
  const m = raw.match(/^option_?([1-4])$/i);
  if (!m) return null;
  return parseInt(m[1], 10) - 1;
}

/**
 * Resolve stored MCQ answer to a single option label (ক/খ/গ/ঘ or a/b/c/d).
 * Matches direct keys, 1–4, option_N, or full option text against option_1..4.
 */
export function resolveMcqAnswerLabel(
  answer: unknown,
  options: {
    option_1?: unknown;
    option_2?: unknown;
    option_3?: unknown;
    option_4?: unknown;
  },
  formatOption: (raw: string) => string
): string {
  if (answer == null) return '';
  let raw = String(answer).trim();
  if (!raw) return '';

  const paren = raw.match(/^\(([কখগঘa-dA-D])\)$/);
  if (paren) raw = paren[1];

  if ((MCQ_OPTION_KEYS_BN as readonly string[]).includes(raw)) return raw;

  const lower = raw.toLowerCase();
  if ((MCQ_OPTION_KEYS_EN as readonly string[]).includes(lower)) return lower;

  const optIdx = optionIndexFromToken(raw);
  if (optIdx != null) return labelAtIndex(optIdx, raw, lower);

  const n = parseInt(raw, 10);
  if (String(n) === raw && n >= 1 && n <= 4) {
    return labelAtIndex(n - 1, raw, lower);
  }

  const opts = [options.option_1, options.option_2, options.option_3, options.option_4];
  const ansPlain = stripPlain(answer, formatOption);
  for (let i = 0; i < 4; i++) {
    const optPlain = stripPlain(opts[i], formatOption);
    if (ansPlain && optPlain && ansPlain === optPlain) {
      return labelAtIndex(i, raw, lower);
    }
  }

  return raw;
}
