/** Distinct source/year/type options for /question More Filters (from DB, not loaded pages). */
export interface QuestionFilterOptionsData {
  sources: string[];
  years: string[];
  types: string[];
}

const cache = new Map<string, QuestionFilterOptionsData>();
const MAX_ENTRIES = 40;

export function buildQuestionFilterOptionsCacheKey(params: {
  level_tr: string;
  class_level: string;
  subject_tr: string;
  chapters?: string[];
  topics?: string[];
  /** Bust cache when subject table revision changes. */
  revision?: string | null;
}): string {
  return JSON.stringify({
    level_tr: params.level_tr,
    class_level: params.class_level,
    subject_tr: params.subject_tr,
    chapters: [...(params.chapters || [])].sort(),
    topics: [...(params.topics || [])].sort(),
    revision: params.revision ?? null,
  });
}

export function getCachedQuestionFilterOptions(key: string): QuestionFilterOptionsData | undefined {
  return cache.get(key);
}

export function setCachedQuestionFilterOptions(key: string, data: QuestionFilterOptionsData): void {
  cache.set(key, data);
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first == null) break;
    cache.delete(first);
  }
}

export function clearQuestionFilterOptionsCache(): void {
  cache.clear();
}
