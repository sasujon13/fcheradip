import { normalizeQuestionLatexSource } from './question-katex-render';

/** String fields on question API rows that may contain LaTeX (including locked answer/explanation). */
export const QUESTION_API_KATEX_TEXT_FIELDS = [
  'question',
  'option_1',
  'option_2',
  'option_3',
  'option_4',
  'answer',
  'explanation',
  'explanation2',
  'explanation3',
] as const;

function normalizeTextField(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/[\\$]|\\boxed\b/.test(trimmed)) return value;
  return normalizeQuestionLatexSource(value);
}

/** Normalize LaTeX delimiters on one question object (does not render HTML). */
export function normalizeQuestionRecordFromApi<T extends Record<string, unknown>>(q: T): T {
  if (!q || typeof q !== 'object') return q;
  const out = { ...q };
  for (const key of QUESTION_API_KATEX_TEXT_FIELDS) {
    if (key in out) {
      (out as Record<string, unknown>)[key] = normalizeTextField(out[key]);
    }
  }
  return out;
}

export function normalizeQuestionListFromApi<T extends Record<string, unknown>>(list: T[] | null | undefined): T[] {
  if (!Array.isArray(list)) return [];
  return list.map((q) => normalizeQuestionRecordFromApi(q));
}

/** Normalize `questions` / `results` arrays on typical API payloads. */
export function normalizeQuestionApiResponse<T>(data: T): T {
  if (data == null) return data;
  if (Array.isArray(data)) {
    return normalizeQuestionListFromApi(data as Record<string, unknown>[]) as T;
  }
  if (typeof data !== 'object') return data;
  const obj = { ...(data as Record<string, unknown>) };
  if (Array.isArray(obj['questions'])) {
    obj['questions'] = normalizeQuestionListFromApi(obj['questions'] as Record<string, unknown>[]);
  }
  if (Array.isArray(obj['results'])) {
    obj['results'] = normalizeQuestionListFromApi(obj['results'] as Record<string, unknown>[]);
  }
  if (Array.isArray(obj['data'])) {
    obj['data'] = normalizeQuestionListFromApi(obj['data'] as Record<string, unknown>[]);
  }
  if (obj['qid'] != null || obj['question'] != null) {
    return normalizeQuestionRecordFromApi(obj) as T;
  }
  return obj as T;
}
