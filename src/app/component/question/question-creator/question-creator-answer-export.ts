import { resolveMcqAnswerLabel } from '../../../shared/mcq-answer-label';

export type McqSetLetter = 'ক' | 'খ' | 'গ' | 'ঘ';

export function hasNonEmptyField(v: unknown): boolean {
  return v != null && String(v).trim() !== '';
}

/** Compact MCQ answer row: serial + option key only (ক/খ/গ/ঘ or a/b/c/d). */
export function buildMcqAnswerCompactQuestion(
  serialBn: string,
  label: string,
  qidSuffix: string
): Record<string, unknown> {
  return {
    qid: `mcq-ans-${qidSuffix}`,
    type: 'বহুনির্বাচনি',
    question: `${serialBn}। ${label}`,
    option_1: '',
    option_2: '',
    option_3: '',
    option_4: '',
  };
}

/** Section divider between MCQ sets on a combined answer sheet. */
export function buildMcqSetBannerQuestion(setLetter: McqSetLetter): Record<string, unknown> {
  return {
    qid: `mcq-set-hdr-${setLetter}`,
    type: 'বহুনির্বাচনি',
    question: `সেট : ${setLetter}`,
    option_1: '',
    option_2: '',
    option_3: '',
    option_4: '',
  };
}

function mcqAnswerLabelForExport(
  q: {
    answer?: unknown;
    option_1?: unknown;
    option_2?: unknown;
    option_3?: unknown;
    option_4?: unknown;
  },
  formatOption: (raw: string) => string
): string {
  if (!hasNonEmptyField(q?.answer)) return '';
  return resolveMcqAnswerLabel(q.answer, q, formatOption);
}

export type McqAnswerKeySetBlock = {
  setLetter: McqSetLetter | null;
  questions: Record<string, unknown>[];
};

/** Pack 0..count-1 into `numCols` columns (row-wise: 1,2,3,4,5 then next row). */
export function packMcqAnswerIndicesIntoColumns(count: number, numCols: number): number[][] {
  const ncols = Math.max(1, Math.floor(numCols));
  const cols: number[][] = Array.from({ length: ncols }, () => []);
  for (let i = 0; i < count; i++) {
    cols[i % ncols]!.push(i);
  }
  return cols.filter((c) => c.length > 0);
}

function buildMcqAnswerRowsForList(
  mcqs: unknown[],
  idPrefix: string,
  serialBn: (oneBased: number) => string,
  formatOption: (raw: string) => string,
  isMcqType: (q: unknown) => boolean
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let n = 0;
  for (const raw of mcqs) {
    const q = raw as {
      answer?: unknown;
      option_1?: unknown;
      option_2?: unknown;
      option_3?: unknown;
      option_4?: unknown;
    };
    if (!isMcqType(q)) continue;
    n++;
    const label = mcqAnswerLabelForExport(q, formatOption);
    out.push(buildMcqAnswerCompactQuestion(serialBn(n), label || '—', `${idPrefix}-${n}`));
  }
  return out;
}

/** One block per set (or single block); serial ১…N restarts in each block. */
export function buildMcqAnswerKeySetBlocks(opts: {
  multiSet: boolean;
  mcqSetLetters: readonly McqSetLetter[];
  orderedMcqBySet: Partial<Record<McqSetLetter, unknown[]>>;
  singleSetMcqs: unknown[];
  serialBn: (oneBased: number) => string;
  formatOption: (raw: string) => string;
  isMcqType: (q: unknown) => boolean;
}): McqAnswerKeySetBlock[] {
  const blocks: McqAnswerKeySetBlock[] = [];
  if (opts.multiSet) {
    for (const L of opts.mcqSetLetters) {
      const list = opts.orderedMcqBySet[L];
      const mcqs = Array.isArray(list) ? list.filter((q) => opts.isMcqType(q)) : [];
      if (!mcqs.length) continue;
      blocks.push({
        setLetter: L,
        questions: buildMcqAnswerRowsForList(mcqs, `set-${L}`, opts.serialBn, opts.formatOption, opts.isMcqType),
      });
    }
    return blocks;
  }
  const mcqs = opts.singleSetMcqs.filter((q) => opts.isMcqType(q));
  if (!mcqs.length) return [];
  blocks.push({
    setLetter: null,
    questions: buildMcqAnswerRowsForList(mcqs, 'set', opts.serialBn, opts.formatOption, opts.isMcqType),
  });
  return blocks;
}

/** Flat list (legacy); multi-set includes inline set banners. */
export function buildMcqAnswersOnlyExportQuestions(opts: {
  multiSet: boolean;
  mcqSetLetters: readonly McqSetLetter[];
  orderedMcqBySet: Partial<Record<McqSetLetter, unknown[]>>;
  singleSetMcqs: unknown[];
  serialBn: (oneBased: number) => string;
  formatOption: (raw: string) => string;
  isMcqType: (q: unknown) => boolean;
}): Record<string, unknown>[] {
  const blocks = buildMcqAnswerKeySetBlocks(opts);
  const out: Record<string, unknown>[] = [];
  for (const block of blocks) {
    if (block.setLetter != null) {
      out.push(buildMcqSetBannerQuestion(block.setLetter));
    }
    out.push(...block.questions);
  }
  return out;
}

export type McqAnswerKeyExportPayload = {
  questions: Record<string, unknown>[];
  exportPreviewPagePlan: Record<string, unknown>[];
  previewSerialByIndex: Record<string, number>;
};

/**
 * MCQ answer-key: one PDF page per set (when multi-set), 5 columns, set code in page header.
 */
export function buildMcqAnswerKeyExportPayload(
  blocks: McqAnswerKeySetBlock[],
  layoutColumns: number
): McqAnswerKeyExportPayload {
  const questions: Record<string, unknown>[] = [];
  const exportPreviewPagePlan: Record<string, unknown>[] = [];
  const previewSerialByIndex: Record<string, number> = {};
  let offset = 0;

  for (const block of blocks) {
    const n = block.questions.length;
    if (n === 0) continue;

    for (let i = 0; i < n; i++) {
      previewSerialByIndex[String(offset + i)] = i + 1;
    }

    const localCols = packMcqAnswerIndicesIntoColumns(n, layoutColumns);
    const questionColumnIndexes = localCols.map((col) => col.map((i) => offset + i));

    exportPreviewPagePlan.push({
      kind: 'mcq',
      headerVisible: true,
      headerKind: 'mcq',
      leadEmpty: false,
      headerInFirstColumn: false,
      ...(block.setLetter != null ? { mcqSetLetter: block.setLetter } : {}),
      questionColumnIndexes,
    });

    questions.push(...block.questions);
    offset += n;
  }

  return { questions, exportPreviewPagePlan, previewSerialByIndex };
}

/** Full stem + Answer line + explanations (options cleared for export). */
export function buildAnswerExplanationExportQuestion(
  q: Record<string, unknown>,
  opts: {
    formatOption: (raw: string) => string;
    isMcqType: (q: unknown) => boolean;
    displayStem: string;
  }
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...q };
  const tail: string[] = [];
  if (hasNonEmptyField(q['answer'])) {
    if (opts.isMcqType(q)) {
      const label = mcqAnswerLabelForExport(
        q as {
          answer?: unknown;
          option_1?: unknown;
          option_2?: unknown;
          option_3?: unknown;
          option_4?: unknown;
        },
        opts.formatOption
      );
      const raw = String(q['answer']).trim();
      const show = label && (label !== raw || /[\\$]|\\boxed\b|<\s*(span|img|br|code)\b/i.test(raw));
      tail.push(show ? `Answer: ${raw}` : `Answer: ${label || raw}`);
    } else {
      tail.push(`Answer: ${String(q['answer']).trim()}`);
    }
  }
  for (const key of ['explanation', 'explanation2', 'explanation3'] as const) {
    if (hasNonEmptyField(q[key])) {
      tail.push(String(q[key]).trim());
    }
  }
  const stem = (opts.displayStem || String(q['question'] ?? '')).trim();
  clone['question'] = tail.length ? [stem, ...tail].filter(Boolean).join('\n\n') : stem;
  clone['option_1'] = '';
  clone['option_2'] = '';
  clone['option_3'] = '';
  clone['option_4'] = '';
  return clone;
}

/** CQ block + MCQ blocks (per set when multiSet); mirrors mixed preview order. */
export function buildAnswersExplanationsExportQuestions(opts: {
  multiSet: boolean;
  mcqSetLetters: readonly McqSetLetter[];
  orderedMcqBySet: Partial<Record<McqSetLetter, unknown[]>>;
  singlePreviewList: unknown[];
  formatOption: (raw: string) => string;
  isCreativeType: (q: unknown) => boolean;
  isMcqType: (q: unknown) => boolean;
  displayStem: (q: unknown) => string;
}): Record<string, unknown>[] {
  const mapOne = (q: unknown) =>
    buildAnswerExplanationExportQuestion(q as Record<string, unknown>, {
      formatOption: opts.formatOption,
      isMcqType: opts.isMcqType,
      displayStem: opts.displayStem(q),
    });

  const creative = opts.singlePreviewList.filter((q) => opts.isCreativeType(q)).map(mapOne);
  const others = opts.singlePreviewList.filter(
    (q) => !opts.isCreativeType(q) && !opts.isMcqType(q)
  ).map(mapOne);

  const out: Record<string, unknown>[] = [...creative];

  if (opts.multiSet) {
    for (const L of opts.mcqSetLetters) {
      const list = opts.orderedMcqBySet[L];
      const mcqs = Array.isArray(list) ? list.filter((q) => opts.isMcqType(q)) : [];
      if (!mcqs.length) continue;
      out.push(buildMcqSetBannerQuestion(L));
      out.push(...mcqs.map(mapOne));
    }
  } else {
    const mcqs = opts.singlePreviewList.filter((q) => opts.isMcqType(q)).map(mapOne);
    out.push(...mcqs);
  }

  out.push(...others);
  return out;
}
