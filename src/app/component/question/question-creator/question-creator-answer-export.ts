import { resolveMcqAnswerLabel } from '../../../shared/mcq-answer-label';

export type McqSetLetter = 'ক' | 'খ' | 'গ' | 'ঘ';

/** Prefix for answers-sheet layout/export rows split from one logical question. */
export const ANSWER_SHEET_SEG_QID_PREFIX = 'ans-seg-';

/** Prefix for main question-sheet layout/export segment rows. */
export const LAYOUT_SEG_QID_PREFIX = 'layout-seg-';

export type AnswerSheetSegmentKind = 'intro' | 'part' | 'option' | 'tail';

export type AnswerSheetMeasureRow = Record<string, unknown> & {
  answerSheetContinuation?: boolean;
  answerSheetParentIndex?: number;
  answerSheetSegmentKind?: AnswerSheetSegmentKind;
  answerSheetPartIndex?: number;
  answerSheetPartCount?: number;
};

export function hasNonEmptyField(v: unknown): boolean {
  return v != null && String(v).trim() !== '';
}

/** Compact MCQ answer row: serial + option key (ক/খ/গ/ঘ); export must not add a second serial. */
export function buildMcqAnswerCompactQuestion(
  serialBn: string,
  label: string,
  qidSuffix: string
): Record<string, unknown> {
  return {
    qid: `mcq-ans-${qidSuffix}`,
    type: 'বহুনির্বাচনি',
    question: `${serialBn}। ${label || '—'}`,
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

/**
 * Pack 0..count-1 into `numCols` columns, filling **down each column first** (serials ১–৫ in
 * column 1, ৬–১০ in column 2, …) — matches question-sheet column-major packing and PDF export.
 */
export function packMcqAnswerIndicesIntoColumns(count: number, numCols: number): number[][] {
  const ncols = Math.max(1, Math.floor(numCols));
  const cols: number[][] = Array.from({ length: ncols }, () => []);
  if (count <= 0) {
    return [];
  }
  const rowsPerCol = Math.ceil(count / ncols);
  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / rowsPerCol);
    if (col < ncols) {
      cols[col]!.push(i);
    }
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

const MCQ_OPTION_SEGMENTS: { key: 'option_1' | 'option_2' | 'option_3' | 'option_4'; label: string }[] = [
  { key: 'option_1', label: 'ক' },
  { key: 'option_2', label: 'খ' },
  { key: 'option_3', label: 'গ' },
  { key: 'option_4', label: 'ঘ' },
];

export type LayoutSegmentSplitOpts = {
  isCreativeType: (q: unknown) => boolean;
  parseStructure: (q: { question?: unknown; type?: string }) => { intro: string; parts: string[] };
  formatOption: (raw: string) => string;
  qidPrefix: string;
  /** When true, split `\\n\\n` blocks after the stem into tail segments (answers sheet). */
  includeAnswerTails: boolean;
  /** MCQ option rows as separate segments (answers sheet); main sheet keeps options with the stem. */
  splitMcqOptions?: boolean;
  /** Main sheet: stem from display text; answers sheet uses raw `question` when omitted. */
  displayStem?: (q: unknown) => string;
};

function questionTypeLabel(q: Record<string, unknown>): string | undefined {
  const t = q['type'];
  if (t == null) return undefined;
  return String(t);
}

/**
 * Split one question into measure/export blocks (intro, CQ parts, MCQ options, optional answer tails)
 * so pagination can pack columns without large gaps from indivisible whole questions.
 */
export function splitQuestionIntoLayoutSegments(
  q: Record<string, unknown>,
  parentIndex: number,
  opts: LayoutSegmentSplitOpts
): AnswerSheetMeasureRow[] {
  const qidBase = q['qid'] != null ? String(q['qid']) : String(parentIndex);
  if (String(qidBase).startsWith('mcq-set-hdr')) {
    return [{ ...q } as AnswerSheetMeasureRow];
  }

  const rawFull = opts.displayStem
    ? String(opts.displayStem(q) ?? '').trim()
    : String(q['question'] ?? '').trim();

  if (!rawFull) {
    return [
      {
        ...q,
        qid: `${opts.qidPrefix}${qidBase}-0`,
        question: ' ',
        option_1: '',
        option_2: '',
        option_3: '',
        option_4: '',
        answerSheetContinuation: false,
        answerSheetParentIndex: parentIndex,
        answerSheetSegmentKind: 'intro',
      },
    ];
  }

  let stemBlock = rawFull;
  let tailBlocks: string[] = [];
  if (opts.includeAnswerTails) {
    const blocks = rawFull.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
    stemBlock = blocks[0] ?? '';
    tailBlocks = blocks.slice(1);
  }

  const rows: AnswerSheetMeasureRow[] = [];
  let seg = 0;
  const qType = questionTypeLabel(q);

  const pushSeg = (
    content: string,
    kind: AnswerSheetSegmentKind,
    continuation: boolean,
    extra?: Partial<AnswerSheetMeasureRow>
  ) => {
    const t = content.trim();
    if (!t) return;
    rows.push({
      ...q,
      ...extra,
      qid: `${opts.qidPrefix}${qidBase}-${seg}`,
      question: t,
      option_1: '',
      option_2: '',
      option_3: '',
      option_4: '',
      answerSheetContinuation: continuation,
      answerSheetParentIndex: parentIndex,
      answerSheetSegmentKind: kind,
    });
    seg++;
  };

  if (opts.isCreativeType(q)) {
    const struct = opts.parseStructure({ question: stemBlock, type: qType });
    if (struct.intro.trim()) {
      pushSeg(struct.intro, 'intro', false);
    }
    const parts = struct.parts ?? [];
    const pc = parts.length;
    parts.forEach((part, pi) => {
      pushSeg(part, 'part', rows.length > 0, {
        answerSheetPartIndex: pi,
        answerSheetPartCount: pc,
      });
    });
  } else {
    const struct = opts.parseStructure({ question: stemBlock, type: qType });
    const introText = struct.intro.trim() || stemBlock.trim();
    const hasMcqOptions = MCQ_OPTION_SEGMENTS.some(({ key }) => {
      const ov = q[key];
      return ov != null && String(ov).trim() !== '';
    });

    if (opts.splitMcqOptions === false) {
      // Main sheet: one block per question with full stem + (ক)–(ঘ) options intact for preview/export grid.
      // Do not split MCQ stems into `part` rows — those rows omit the question serial in preview/PDF.
      const stem = stemBlock.trim() || introText || ' ';
      if (stem.trim() || hasMcqOptions) {
        rows.push({
          ...q,
          qid: `${opts.qidPrefix}${qidBase}-${seg}`,
          question: stem,
          answerSheetContinuation: false,
          answerSheetParentIndex: parentIndex,
          answerSheetSegmentKind: 'intro',
        });
        seg++;
      }
    } else {
      if (introText) {
        pushSeg(introText, 'intro', false);
      }
      if (!opts.includeAnswerTails) {
        for (const part of struct.parts ?? []) {
          if (part.trim()) {
            pushSeg(part, 'part', rows.length > 0);
          }
        }
      }
      for (const { key, label } of MCQ_OPTION_SEGMENTS) {
        const ov = q[key];
        if (ov == null || String(ov).trim() === '') continue;
        const txt = opts.formatOption(String(ov).trim());
        if (txt.trim()) {
          pushSeg(`(${label}) ${txt}`, 'option', rows.length > 0);
        }
      }
    }
  }

  for (const tail of tailBlocks) {
    pushSeg(tail, 'tail', true);
  }

  if (!rows.length) {
    rows.push({
      ...q,
      qid: `${opts.qidPrefix}${qidBase}-0`,
      question: rawFull,
      option_1: '',
      option_2: '',
      option_3: '',
      option_4: '',
      answerSheetContinuation: false,
      answerSheetParentIndex: parentIndex,
      answerSheetSegmentKind: 'intro',
    });
  }

  return rows;
}

/** Answers/explanations: intro, parts, options, answer tails. */
export function splitAnswerExportQuestionIntoMeasureRows(
  q: Record<string, unknown>,
  parentIndex: number,
  opts: Omit<LayoutSegmentSplitOpts, 'qidPrefix' | 'includeAnswerTails' | 'displayStem'>
): AnswerSheetMeasureRow[] {
  return splitQuestionIntoLayoutSegments(q, parentIndex, {
    ...opts,
    qidPrefix: ANSWER_SHEET_SEG_QID_PREFIX,
    includeAnswerTails: true,
  });
}

/** Expand answers/explanations list into layout/export rows (one block per part/option/tail). */
export function buildAnswerLayoutMeasureRows(
  answerQuestions: unknown[],
  opts: Omit<LayoutSegmentSplitOpts, 'qidPrefix' | 'includeAnswerTails' | 'displayStem'>
): AnswerSheetMeasureRow[] {
  const out: AnswerSheetMeasureRow[] = [];
  for (let i = 0; i < answerQuestions.length; i++) {
    const q = answerQuestions[i] as Record<string, unknown>;
    out.push(...splitAnswerExportQuestionIntoMeasureRows(q, i, opts));
  }
  return out;
}

/** Main question sheet: intro, CQ parts, and MCQ options as separate layout blocks. */
export function buildPreviewLayoutMeasureRows(
  questions: unknown[],
  opts: Omit<LayoutSegmentSplitOpts, 'qidPrefix' | 'includeAnswerTails'>
): AnswerSheetMeasureRow[] {
  const out: AnswerSheetMeasureRow[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Record<string, unknown>;
    out.push(
      ...splitQuestionIntoLayoutSegments(q, i, {
        ...opts,
        qidPrefix: LAYOUT_SEG_QID_PREFIX,
        includeAnswerTails: false,
        splitMcqOptions: false,
      })
    );
  }
  return out;
}
