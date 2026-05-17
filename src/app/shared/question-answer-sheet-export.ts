import { formatMaybeCProgramQuestionText } from './c-program-question-format';
import {
  buildAnswersExplanationsExportQuestions,
  buildMcqAnswerKeyExportPayload,
  buildMcqAnswerKeySetBlocks,
  McqSetLetter,
} from '../component/question/question-creator/question-creator-answer-export';

export const MCQ_SET_LETTERS = ['ক', 'খ', 'গ', 'ঘ'] as const;
export const MCQ_ANSWER_SHEET_LAYOUT_COLUMNS = 5;

const ANSWER_EXPLANATIONS_LAYOUT_KEY = 'answerExplanationsExportLayout';
const MCQ_ANSWER_KEY_LAYOUT_KEY = 'mcqAnswerKeyExportLayout';

export function toBengaliDigits(ascii: string): string {
  const map: Record<string, string> = {
    '0': '০',
    '1': '১',
    '2': '২',
    '3': '৩',
    '4': '৪',
    '5': '৫',
    '6': '৬',
    '7': '৭',
    '8': '৮',
    '9': '৯',
  };
  return String(ascii ?? '').replace(/[0-9]/g, (d) => map[d] ?? d);
}

export function questionIsMcqType(q: { type?: unknown }): boolean {
  const t = (q?.type ?? '').toString().trim();
  return !!t && (t === 'বহুনির্বাচনি' || t.includes('বহুনির্বাচনি'));
}

export function questionIsCreativeType(q: { type?: unknown }): boolean {
  const t = (q?.type ?? '').toString().trim();
  return !!t && (t === 'সৃজনশীল' || t.includes('সৃজনশীল'));
}

export function selectionHasMcqType(questions: unknown[]): boolean {
  return questions.some((q) => questionIsMcqType(q as { type?: unknown }));
}

export function hasPersistedFourMcqVariants(ls: Record<string, unknown> | undefined): boolean {
  if (!ls) return false;
  const m = parseMcqOrderBySet(ls['mcqOrderBySet']);
  return MCQ_SET_LETTERS.every((L) => Array.isArray(m[L]) && (m[L] as unknown[]).length > 0);
}

export function parseMcqOrderBySet(
  raw: unknown
): Partial<Record<McqSetLetter, (string | number)[]>> {
  const out: Partial<Record<McqSetLetter, (string | number)[]>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const L of MCQ_SET_LETTERS) {
    const arr = (raw as Record<string, unknown>)[L];
    if (Array.isArray(arr) && arr.length) {
      out[L] = arr.map((x) => (typeof x === 'number' || typeof x === 'string' ? x : String(x)));
    }
  }
  return out;
}

export function parseQuestionHeaderByMcqSet(
  raw: unknown
): Partial<Record<McqSetLetter, string>> {
  const out: Partial<Record<McqSetLetter, string>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const L of MCQ_SET_LETTERS) {
    const s = (raw as Record<string, unknown>)[L];
    if (typeof s === 'string' && s.trim()) out[L] = s;
  }
  return out;
}

export function reorderQuestionsByQids(questions: any[], qids: (string | number)[]): any[] {
  if (!qids?.length) return questions.slice();
  const byId = new Map<string | number, any>();
  for (const q of questions) {
    if (q?.qid != null) byId.set(q.qid, q);
  }
  const seen = new Set<string | number>();
  const out: any[] = [];
  for (const id of qids) {
    const q = byId.get(id);
    if (q) {
      out.push(q);
      seen.add(q.qid);
    }
  }
  for (const q of questions) {
    if (q?.qid != null && !seen.has(q.qid)) out.push(q);
  }
  return out;
}

function formatOption(raw: string): string {
  return formatMaybeCProgramQuestionText(raw);
}

function getQuestionDisplayText(q: { question?: unknown; type?: string }): string {
  const raw = q?.question != null ? String(q.question).trim() : '';
  if (!raw) return '';
  const prepared = formatMaybeCProgramQuestionText(raw);
  const type = (q?.type ?? '').toString().trim();
  if (type !== 'সৃজনশীল প্রশ্ন') return prepared;
  const withNewlines = prepared
    .replace(/([^\n])\s*(ক\.|খ\.|গ\.|ঘ\.)/g, '$1\n$2')
    .replace(/\n{2,}/g, '\n');
  return withNewlines
    .replace(/ক\./g, '(ক)')
    .replace(/খ\./g, '(খ)')
    .replace(/গ\./g, '(গ)')
    .replace(/ঘ\./g, '(ঘ)')
    .replace(/\s*(\(ক\)|\(খ\)|\(গ\)|\(ঘ\))/g, '\n$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function previewListForAnswersExport(
  questions: any[],
  ls: Record<string, unknown>,
  multiMcq: boolean
): any[] {
  const qids = ls['exportPreviewQuestionQids'];
  if (Array.isArray(qids) && qids.length > 0) {
    return reorderQuestionsByQids(questions, qids as (string | number)[]);
  }
  if (!multiMcq) {
    return questions.slice();
  }
  const creative = questions.filter((q) => questionIsCreativeType(q));
  const others = questions.filter((q) => !questionIsCreativeType(q) && !questionIsMcqType(q));
  const orderMap = parseMcqOrderBySet(ls['mcqOrderBySet']);
  const out = [...creative];
  for (const L of MCQ_SET_LETTERS) {
    const ordered = orderMap[L]?.length
      ? reorderQuestionsByQids(questions, orderMap[L]!)
      : questions.filter((q) => questionIsMcqType(q));
    out.push(...ordered.filter((q) => questionIsMcqType(q)));
  }
  return [...out, ...others];
}

function orderedMcqBySetFromSaved(
  questions: any[],
  ls: Record<string, unknown>
): Partial<Record<McqSetLetter, any[]>> {
  const orderMap = parseMcqOrderBySet(ls['mcqOrderBySet']);
  const out: Partial<Record<McqSetLetter, any[]>> = {};
  for (const L of MCQ_SET_LETTERS) {
    const qids = orderMap[L];
    out[L] =
      qids?.length && qids.length > 0
        ? reorderQuestionsByQids(questions, qids)
        : questions.filter((q) => questionIsMcqType(q));
  }
  return out;
}

function headerWithTitle(base: string, title: string): string {
  const trimmed = (base ?? '').trim();
  return trimmed ? `${title}\n${trimmed}` : title;
}

function splitHeadersFromLayout(ls: Record<string, unknown>): {
  questionHeaderCreative?: string;
  questionHeaderMcq?: string;
  headerLineFontSizesPdfCreative?: number[];
  headerLineFontSizesPdfMcq?: number[];
} {
  const out: {
    questionHeaderCreative?: string;
    questionHeaderMcq?: string;
    headerLineFontSizesPdfCreative?: number[];
    headerLineFontSizesPdfMcq?: number[];
  } = {};
  const c = ls['exportQuestionHeaderCreative'];
  const m = ls['exportQuestionHeaderMcq'];
  if (typeof c === 'string' && c.trim()) out.questionHeaderCreative = c;
  if (typeof m === 'string' && m.trim()) out.questionHeaderMcq = m;
  const fc = ls['headerLineFontSizesPdfCreative'];
  const fm = ls['headerLineFontSizesPdfMcq'];
  if (Array.isArray(fc) && fc.length) {
    out.headerLineFontSizesPdfCreative = fc.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  if (Array.isArray(fm) && fm.length) {
    out.headerLineFontSizesPdfMcq = fm.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  return out;
}

function previewIndexToAnswerExportIndex(
  answerQuestions: any[],
  previewList: any[]
): Map<number, number> {
  const map = new Map<number, number>();
  for (let ai = 0; ai < answerQuestions.length; ai++) {
    const qid = answerQuestions[ai]?.qid;
    if (qid == null || String(qid).startsWith('mcq-set-hdr') || String(qid).startsWith('mcq-ans-')) {
      continue;
    }
    const pi = previewList.findIndex((q) => q.qid === qid);
    if (pi >= 0) map.set(pi, ai);
  }
  return map;
}

function remapExportPreviewPagePlanForAnswerSheet(
  rawPlan: unknown,
  previewToAnswer: Map<number, number>,
  kinds: readonly ('creative' | 'mcq')[]
): Record<string, unknown>[] {
  if (!Array.isArray(rawPlan)) return [];
  const out: Record<string, unknown>[] = [];
  for (const pg of rawPlan) {
    if (!pg || typeof pg !== 'object') continue;
    const row = pg as Record<string, unknown>;
    const kind = String(row['kind'] || '').toLowerCase();
    if (!kinds.includes(kind as 'creative' | 'mcq')) continue;
    const remap = (pi: number): number | undefined => previewToAnswer.get(pi);
    const colsRaw = row['questionColumnIndexes'];
    const questionColumnIndexes: number[][] = [];
    if (Array.isArray(colsRaw)) {
      for (const col of colsRaw) {
        if (!Array.isArray(col)) continue;
        const mapped: number[] = [];
        for (const x of col) {
          const ai = remap(Number(x));
          if (ai !== undefined) mapped.push(ai);
        }
        if (mapped.length) questionColumnIndexes.push(mapped);
      }
    }
    if (!questionColumnIndexes.length) continue;
    const leadRaw = row['leadBindingIndexes'];
    const leadBindingIndexes: number[] = [];
    if (Array.isArray(leadRaw)) {
      for (const x of leadRaw) {
        const ai = remap(Number(x));
        if (ai !== undefined) leadBindingIndexes.push(ai);
      }
    }
    out.push({
      ...row,
      questionColumnIndexes,
      ...(leadBindingIndexes.length ? { leadBindingIndexes } : {}),
    });
  }
  return out;
}

function fallbackAnswersExplanationsLayout(
  base: Record<string, unknown>,
  answerQuestions: any[],
  previewList: any[],
  multiMcq: boolean
): Record<string, unknown> {
  const serialByIndex: Record<string, number> = {};
  for (let i = 0; i < answerQuestions.length; i++) {
    serialByIndex[String(i)] = i + 1;
  }
  const previewToAnswer = previewIndexToAnswerExportIndex(answerQuestions, previewList);
  const planKinds: ('creative' | 'mcq')[] = multiMcq ? ['creative'] : ['creative', 'mcq'];
  return {
    ...base,
    exportPreviewPagePlan: remapExportPreviewPagePlanForAnswerSheet(
      base['exportPreviewPagePlan'],
      previewToAnswer,
      planKinds
    ),
    exportPreviewQuestionQids: answerQuestions.map((q) => q.qid),
    previewSerialByIndex: serialByIndex,
  };
}

function fallbackMcqAnswerKeyLayout(
  base: Record<string, unknown>,
  blocks: ReturnType<typeof buildMcqAnswerKeySetBlocks>
): { layout: Record<string, unknown>; questions: Record<string, unknown>[] } {
  const payload = buildMcqAnswerKeyExportPayload(blocks, MCQ_ANSWER_SHEET_LAYOUT_COLUMNS);
  return {
    layout: {
      ...base,
      layoutColumns: MCQ_ANSWER_SHEET_LAYOUT_COLUMNS,
      exportPreviewPagePlan: payload.exportPreviewPagePlan,
      exportPreviewQuestionQids: payload.questions.map((q) => q['qid']),
      previewSerialByIndex: payload.previewSerialByIndex,
    },
    questions: payload.questions,
  };
}

/** Playwright reads root fields before `layout_settings`; keep auto-fitted values on the request root. */
export function mergeExportPayloadWithLayoutSettings(
  basePayload: Record<string, unknown>,
  layout: Record<string, unknown>,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const layoutRootKeys = [
    'pageSize',
    'pageOrientation',
    'cqPageOrientation',
    'mcqPageOrientation',
    'customPageWidthIn',
    'customPageHeightIn',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'questionsPadding',
    'questionsGap',
    'questionsGapCreative',
    'previewQuestionsFontPx',
    'previewQuestionsFontPxCreative',
    'previewQuestionsFontPxMcq',
    'previewHeaderLineHeight',
    'previewQuestionsLineHeight',
    'previewQuestionsLineHeightCreative',
    'previewQuestionsLineHeightMcq',
    'layoutColumns',
    'layoutColumnsCreative',
    'layoutColumnGapPx',
    'showColumnDivider',
    'optionsColumns',
    'pageSections',
    'sectionGapPx',
  ] as const;
  const out: Record<string, unknown> = { ...basePayload, ...extra, layout_settings: layout };
  for (const k of layoutRootKeys) {
    if (layout[k] !== undefined) out[k] = layout[k];
  }
  return out;
}

export type AnswerSheetExportItem = {
  filename: string;
  format: 'pdf' | 'docx';
  payload: Record<string, unknown>;
};

/**
 * Build `-answers` and `-mcq-answers` export payloads for a saved created-question set (re-download).
 * Uses layouts persisted at Save when present; otherwise falls back to question-sheet plan remap / 5-col grid.
 */
export function buildAnswerSheetExportItems(args: {
  questions: any[];
  questionHeader: string;
  layoutSettings: Record<string, unknown>;
  filenameStem: string;
  format: 'pdf' | 'docx';
  baseExportPayload: Record<string, unknown>;
}): AnswerSheetExportItem[] {
  const { questions, questionHeader, layoutSettings: ls, filenameStem, format, baseExportPayload } =
    args;
  const items: AnswerSheetExportItem[] = [];
  if (!questions.length) return items;

  const multiMcq = hasPersistedFourMcqVariants(ls);
  const headerBySet = parseQuestionHeaderByMcqSet(ls['questionHeaderByMcqSet']);
  const split = splitHeadersFromLayout(ls);
  const previewList = previewListForAnswersExport(questions, ls, multiMcq);

  const withAnswers = buildAnswersExplanationsExportQuestions({
    multiSet: multiMcq,
    mcqSetLetters: MCQ_SET_LETTERS,
    orderedMcqBySet: orderedMcqBySetFromSaved(questions, ls),
    singlePreviewList: previewList,
    formatOption,
    isCreativeType: (q) => questionIsCreativeType(q as { type?: unknown }),
    isMcqType: (q) => questionIsMcqType(q as { type?: unknown }),
    displayStem: (q) => getQuestionDisplayText(q as { question?: unknown; type?: string }),
  });

  if (withAnswers.length > 0) {
    const persisted = ls[ANSWER_EXPLANATIONS_LAYOUT_KEY];
    const layout =
      persisted && typeof persisted === 'object' && !Array.isArray(persisted)
        ? { ...(persisted as Record<string, unknown>) }
        : fallbackAnswersExplanationsLayout(ls, withAnswers, previewList, multiMcq);

    const answersHeader = headerWithTitle(
      multiMcq && headerBySet['ক'] ? headerBySet['ক']! : questionHeader,
      'উত্তর ও ব্যাখ্যা'
    );

    items.push({
      filename: `${filenameStem}-answers`,
      format,
      payload: mergeExportPayloadWithLayoutSettings(baseExportPayload, layout, {
        questions: withAnswers,
        questionHeader: answersHeader,
        ...(split.questionHeaderCreative ? { questionHeaderCreative: split.questionHeaderCreative } : {}),
        ...(split.questionHeaderMcq ? { questionHeaderMcq: split.questionHeaderMcq } : {}),
        ...(split.headerLineFontSizesPdfCreative?.length
          ? { headerLineFontSizesPdfCreative: split.headerLineFontSizesPdfCreative }
          : {}),
        ...(split.headerLineFontSizesPdfMcq?.length
          ? { headerLineFontSizesPdfMcq: split.headerLineFontSizesPdfMcq }
          : {}),
      }),
    });
  }

  if (selectionHasMcqType(questions)) {
    const blocks = buildMcqAnswerKeySetBlocks({
      multiSet: multiMcq,
      mcqSetLetters: MCQ_SET_LETTERS,
      orderedMcqBySet: orderedMcqBySetFromSaved(questions, ls),
      singleSetMcqs: previewList.filter((q) => questionIsMcqType(q)),
      serialBn: (n) => toBengaliDigits(String(n)),
      formatOption,
      isMcqType: (q) => questionIsMcqType(q as { type?: unknown }),
    });

    const persistedMcq = ls[MCQ_ANSWER_KEY_LAYOUT_KEY];
    let layout: Record<string, unknown>;
    let mcqQuestions: Record<string, unknown>[];

    if (persistedMcq && typeof persistedMcq === 'object' && !Array.isArray(persistedMcq)) {
      const p = persistedMcq as Record<string, unknown>;
      layout = { ...p };
      const qids = p['exportPreviewQuestionQids'];
      if (Array.isArray(qids) && qids.length) {
        mcqQuestions = reorderQuestionsByQids(
          blocks.flatMap((b) => b.questions),
          qids as (string | number)[]
        ) as Record<string, unknown>[];
      } else {
        mcqQuestions = blocks.flatMap((b) => b.questions);
      }
    } else {
      const fb = fallbackMcqAnswerKeyLayout(ls, blocks);
      layout = fb.layout;
      mcqQuestions = fb.questions;
    }

    if (mcqQuestions.length > 0) {
      const mcqHeader = headerWithTitle(
        multiMcq && headerBySet['ক'] ? headerBySet['ক']! : questionHeader,
        'উত্তরমালা (বহুনির্বাচনি)'
      );
      items.push({
        filename: `${filenameStem}-mcq-answers`,
        format,
        payload: mergeExportPayloadWithLayoutSettings(baseExportPayload, layout, {
          questions: mcqQuestions,
          questionHeader: mcqHeader,
        }),
      });
    }
  }

  return items;
}

export const ANSWER_LAYOUT_PERSIST_KEYS = {
  explanations: ANSWER_EXPLANATIONS_LAYOUT_KEY,
  mcqKey: MCQ_ANSWER_KEY_LAYOUT_KEY,
} as const;
