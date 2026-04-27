import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ViewChildren,
  QueryList,
  ElementRef,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, forkJoin, of, Subject, Subscription } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  switchMap,
  take,
} from 'rxjs/operators';
import {
  ApiService,
  CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY,
} from '../../../service/api.service';
import { LoadingService } from 'src/app/service/loading.service';
import { formatMaybeCProgramQuestionText } from '../../../shared/c-program-question-format';

export const QUESTION_CREATOR_STATE_KEY = 'questionCreatorReturnState';

/** Full creator draft + page layout; survives tab reload (localStorage). */
export const QUESTION_CREATOR_LOCAL_STORAGE_KEY = 'questionCreatorLocalState';

/** Once set, auto “Reset Setting” on first visit to `/question/create` does not run again (local + synced in remote settings blob). */
export const QUESTION_CREATOR_FIRST_VISIT_RESET_KEY = 'questionCreatorFirstVisitResetDone';

/** Last saved set id for highlighting on `/created-questions`. */
export const CREATED_QUESTIONS_LAST_SAVED_SET_ID_KEY = 'cheradipLastCreatedQuestionSetId';

/**
 * Persisted JSON `v` — v2 stores only {@link buildPersistPayload}'s `questionQids`; full rows are loaded via API on open.
 * v1 legacy: inline `questions` objects.
 */
export const QUESTION_CREATOR_PAYLOAD_VERSION = 2;

/** Per subject + exam-type serial for বিশেষ / মডেল / ক্লাস (and EN equivalents). */
export const QUESTION_CREATOR_EXAM_SERIAL_KEY = 'questionCreatorExamSerial';

export type InstituteHeaderSummary = {
  eiinNo?: string;
  instituteNameBn?: string;
  districtNameBn?: string;
  instituteName?: string;
  districtName?: string;
};

export type ExamTypeOption = { key: string; label: string; counter: boolean };

export type MarginPreset = 'narrow' | 'standard' | 'wide' | 'custom';
export type ExportFormat = 'both' | 'pdf' | 'docx';
export type PageOrientation = 'portrait' | 'landscape';

export type QuestionCreatorContext = {
  level_tr?: string;
  class_level?: string;
  /** Same as question_subjects `group` filter (e.g. Business Studies). */
  group?: string;
  subject_tr?: string;
  /** API list field `name` (display label; often same as subject_name). */
  name?: string;
  /** From question_subjects (cheradip_subject.subject_name). */
  subject_name?: string;
  /** From question_subjects (cheradip_subject.subject_code). */
  subject_code?: string;
  /**
   * Exam variant from question_subjects (`sq`): 25 vs 30 drives per-question timing for header সময়/পূর্ণমান
   * (MCQ 1 min + 1 mark each; CQ 31 min + 10 marks each for sq=25; CQ floor(n×21.43) min + 10 marks each for sq=30).
   */
  sq?: number;
  chapter?: string;
  topic?: string;
};

/** One item on a preview page (question + original index). */
export interface PreviewPageItem {
  q: any;
  index: number;
  /** 1-based column for sheet grid (column-major fill); used for vertical rules between columns. */
  previewGridCol?: number;
}

/** Paginated preview page with fit hints. */
export interface PreviewPage {
  items: PreviewPageItem[];
  /**
   * When pageSections > 1: one array per horizontal band, top to bottom.
   * Within each band, questions fill columns top-to-bottom then the next column (same as single-section).
   */
  sections?: PreviewPageItem[][];
  /** Horizontal divider Y positions (px from top of body) for this page when pageSections > 1. */
  sectionLineTopsPx?: number[];
  /**
   * When pageSections <= 1 and columns > 1: independent flex stacks (no cross-column row height alignment).
   */
  questionColumns?: PreviewPageItem[][];
  /**
   * When pageSections > 1: per band, same as `questionColumns` (parallel to `sections`).
   */
  sectionQuestionColumns?: PreviewPageItem[][][];
  /**
   * Optional content for the “lead-empty” binding column on the first sheet page (landscape + multi-page same kind).
   * Used only for rendering; pagination packing still uses `questionColumns`.
   */
  leadBindingItems?: PreviewPageItem[];
  /** Approximate share of usable page height used (0–100+ if overflow). */
  fillPercent: number;
  /** True if at least one question is taller than the usable page height. */
  hasOversizedQuestion: boolean;
}

@Component({
  selector: 'app-question-creator',
  templateUrl: './question-creator.component.html',
  styleUrls: ['./question-creator.component.css'],
})
export class QuestionCreatorComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Default EIIN in the field until the user enters a real number (skipped for institute lookup). */
  private static readonly HEADER_EIIN_DEFAULT = '000000';
  private static readonly HEADER_INSTITUTE_DEFAULT_NAME = 'Cheradip Cheradip Cheradip';
  private static readonly HEADER_INSTITUTE_DEFAULT_DISTRICT = 'Dinajpur';

  questions: any[] = [];
  context: QuestionCreatorContext = {};
  questionHeader = '';

  /** EIIN lookup → institute line (BN name + district) in composed header. */
  headerEiin = QuestionCreatorComponent.HEADER_EIIN_DEFAULT;
  headerInstitute: InstituteHeaderSummary | null = null;
  headerExamTypeKey = 'term2';
  /** Old saves: single text header only — skip auto compose until user edits header fields. */
  headerUseLegacyQuestionHeader = false;
  instituteLookupError = '';
  instituteLookupLoading = false;

  /**
   * If the user manually edits header lines, stop auto-seeding default template rows (সময়/পূর্ণমান, দ্রষ্টব্য, etc.)
   * so clearing a line doesn't bring it back automatically.
   */
  private headerManualEditSinceRebuild = false;

  /**
   * Per-line header font sizes (px), length matches newline-separated lines in `questionHeader`.
   * One stepper row per line in the sidebar.
   */
  headerLineFontSizes: number[] = [];
  readonly headerLineFontMin = QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX;
  readonly headerLineFontMax = QuestionCreatorComponent.HEADER_LINE_FONT_MAX_PX;

  /** Sidebar “header preview”: fixed sample copy (sizes only affect the sheet preview). */
  readonly headerSidebarSampleLine1 =
    'Your Institute Name';

  private static readonly HEADER_LINE_FONT_MIN_PX = 7;
  private static readonly HEADER_LINE_FONT_MAX_PX = 96;
  private static readonly HEADER_LINE1_FONT_DEFAULT_PX = 21;
  private static readonly HEADER_LINE2_FONT_DEFAULT_PX = 15;
  private static readonly HEADER_LINE3_FONT_DEFAULT_PX = 18;
  /** Lines 4+ (0-based index ≥ 3): default body band / tail. */
  private static readonly HEADER_LINE_REST_FONT_DEFAULT_PX = 12;
  /** Subject label row for ICT — same default size as institute line (24px). */
  private static readonly HEADER_ICT_SUBJECT_LINE_BN = 'তথ্য ও যোগাযোগ প্রযুক্তি';
  /** MCQ band title row — always default 21px (same as HEADER_LINE3_FONT_DEFAULT_PX). */
  private static readonly HEADER_MCQ_TITLE_LINE_BN = 'বহুনির্বাচনি অভীক্ষা';
  /** Mixed sq দ্রষ্টব্য rows (textarea indices 7–8): default sidebar/preview font. */
  private static readonly HEADER_MIXED_SQ_NOTICE_FONT_DEFAULT_PX = 10;
  /** Creative-only: combined সময়+পূর্ণমান row (canonical `examSqMetaCombinedLineCreative`) — 14px, not 3rd-line 21px. */
  private static readonly HEADER_CREATIVE_SQ_META_COMBINED_FONT_DEFAULT_PX = 12;

  private readonly eiinSearchSubject = new Subject<string>();
  private eiinSearchSub?: Subscription;

  private static readonly EXAM_TYPES_BN: ExamTypeOption[] = [
    { key: 'election', label: 'নির্বাচনী পরীক্ষা', counter: false },
    { key: 'pre_election', label: 'প্রাক-নির্বাচনী পরীক্ষা', counter: false },
    { key: 'yearly', label: 'বার্ষিক পরীক্ষা', counter: false },
    { key: 'half_yearly', label: 'অর্ধবার্ষিক পরীক্ষা', counter: false },
    { key: 'term1', label: '১ম সাময়িক পরীক্ষা', counter: false },
    { key: 'term2', label: '২য় সাময়িক পরীক্ষা', counter: false },
    { key: 'special', label: 'বিশেষ পরীক্ষা', counter: true },
    { key: 'model', label: 'মডেল টেস্ট', counter: true },
    { key: 'class_test', label: 'ক্লাস টেস্ট', counter: true },
  ];

  /** Exam name options that trigger auto-fit on change (first three in BN/EN lists: election, pre_election, yearly). */
  private static readonly EXAM_TYPE_KEYS_FIRST_THREE = ['election', 'pre_election', 'yearly'] as const;

  private static readonly EXAM_TYPES_EN: ExamTypeOption[] = [
    { key: 'election', label: 'Test Exam', counter: false },
    { key: 'pre_election', label: 'Pre-test Exam', counter: false },
    { key: 'yearly', label: 'Yearly Exam', counter: false },
    { key: 'half_yearly', label: 'Half-yearly Exam', counter: false },
    { key: 'term1', label: '1st Term Exam', counter: false },
    { key: 'term2', label: '2nd Term Exam', counter: false },
    { key: 'special', label: 'Special Exam', counter: true },
    { key: 'model', label: 'Model Test', counter: true },
    { key: 'class_test', label: 'Class Test', counter: true },
  ];

  private static readonly BN_DIGITS = '০১২৩৪৫৬৭৮৯';

  /** MCQ question-set suffix for filenames and header line 4 (সেট). */
  static readonly MCQ_SET_LETTERS = ['ক', 'খ', 'গ', 'ঘ'] as const;

  /**
   * Structured header textarea: default horizontal rule.
   * বহুনির্বাচনি-only → 6th line (index 5); সৃজনশীল-only → 5th line (index 4).
   */
  private static readonly DEFAULT_STRUCTURED_HEADER_HR = '<hr>';

  private static toBengaliDigits(ascii: string): string {
    return ascii.replace(/\d/g, (d) => QuestionCreatorComponent.BN_DIGITS[parseInt(d, 10)] ?? d);
  }

  /** Convert Bengali digit chars to ASCII digits; other chars unchanged (for parsing header numbers). */
  private static bnToAsciiDigits(s: string): string {
    let out = '';
    for (const ch of s) {
      const i = QuestionCreatorComponent.BN_DIGITS.indexOf(ch);
      out += i >= 0 ? String(i) : ch;
    }
    return out;
  }

  private static readonly SQ_CQ_MINUTES_PER_25 = 31;
  private static readonly SQ_CQ_MINUTES_PER_30 = 21.43;

  private static escapeHtmlText(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Pasted “Copy outerHTML” from DevTools often includes Angular attrs; recover the real line value. */
  private static looksLikePastedDevToolsHeaderChunk(s: string): boolean {
    const t = s.trimStart();
    if (!t.startsWith('<')) return false;
    return (
      t.includes('header-line-editor') ||
      t.includes('_ngcontent') ||
      t.includes('bis_skin_checked') ||
      t.includes('ng-reflect-model')
    );
  }

  private static decodeHtmlAttributeEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * Header line text for preview/editor: keeps intentional tags like `<b>…</b>`.
   * If the user pasted an entire DOM snippet from the inspector, extract `ng-reflect-model` or strip tags.
   */
  private static normalizeHeaderLineRawForPreview(raw: string): string {
    if (!raw || !QuestionCreatorComponent.looksLikePastedDevToolsHeaderChunk(raw)) return raw;
    const m =
      raw.match(/ng-reflect-model\s*=\s*"([^"]*)"/i) ||
      raw.match(/ng-reflect-model\s*=\s*'([^']*)'/i);
    if (m?.[1] != null) {
      return QuestionCreatorComponent.decodeHtmlAttributeEntities(m[1]);
    }
    return raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  pageSize = 'A4';
  pageOrientation: PageOrientation = 'portrait';
  /** Board only: CQ sheet orientation (per-page based on kind). */
  cqPageOrientation: PageOrientation = 'landscape';
  /** MCQ sheet orientation (per-page based on kind). */
  mcqPageOrientation: PageOrientation = 'portrait';
  /** Custom paper size in inches (portrait width × height before orientation swap). Defaults match A4. */
  customPageWidthIn = QuestionCreatorComponent.a4WidthInDefault();
  customPageHeightIn = QuestionCreatorComponent.a4HeightInDefault();
  marginPreset: MarginPreset = 'narrow';
  marginTop = 12.7;
  marginRight = 12.7;
  marginBottom = 12.7;
  marginLeft = 12.7;
  questionsPadding = QuestionCreatorComponent.QUESTIONS_PADDING_DEFAULT_PX;
  /** Vertical gap below MCQ / non-creative preview blocks (margin-bottom). */
  questionsGap = QuestionCreatorComponent.QUESTIONS_GAP_MCQ_DEFAULT_PX;
  /** Vertical gap below CQ (সৃজনশীল) preview blocks. */
  questionsGapCreative = QuestionCreatorComponent.QUESTIONS_GAP_CQ_DEFAULT_PX;
  /**
   * MCQ preview set (ক–ঘ); `null` = "Select" (canonical order, hide সেট row in code table).
   */
  selectedMcqSetLetter: (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number] | null = null;
  readonly mcqSetLetterOptions: readonly (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number][] =
    QuestionCreatorComponent.MCQ_SET_LETTERS;
  /** Bumps on each set change while not frozen → new MCQ shuffle in preview. */
  private mcqPreviewShuffleNonce = 0;
  /** After a successful save, preview/export order comes from `persistedMcqOrderBySet`. */
  private mcqOrdersFrozen = false;
  /** Full question `qid` order per set letter (saved in layout_settings). */
  persistedMcqOrderBySet: Partial<Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], (string | number)[]>> =
    {};
  /** Header text per MCQ set (saved for redownload). */
  questionHeaderByMcqSet: Partial<Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], string>> = {};
  /** Root font size (px) for question body and options in the sheet preview; header line `em` sizes are relative to this. */
  previewQuestionsFontPx = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_DEFAULT_PX;
  /** Per-kind question font sizes for independent fitting (creative and MCQ do not affect each other). */
  previewQuestionsFontPxCreative = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_DEFAULT_PX;
  previewQuestionsFontPxMcq = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_DEFAULT_PX;

  /** Monotonic counter for "any setting changed" events affecting preview layout. */
  private previewLayoutChangeSeq = 0;

  /**
   * One-shot latch read inside {@link runLayout}: when `true`, the **next** layout pass that would otherwise run
   * auto-fit (first-three exam only) instead runs **without** font/gap/padding mutations, then this flag is cleared
   * in the same `runLayout` invocation. {@link onPreviewLayoutChange} sets it to `true` on **every** call that uses the
   * default `suppressAutoFit: true`, so normal steppers/sliders keep the user’s chosen sizes for one measure pass.
   * Early exits in `runLayout` (zero inner size, no questions) force it back to `false` so a later visit is not stuck suppressed.
   */
  private previewAutoFitSuppressNextLayoutRun = false;

  /**
   * When `true`, {@link runLayout} sets `suppressAutoFit = false` for that pass even if the exam is **not** one of the
   * first three — i.e. the full auto-fit pipeline runs like a first-three exam. Set by {@link resetCreatorSettings}
   * (`forceAutoFit`) and {@link runAutoFitThenSave}; cleared after `paginatedPages` is assigned for that chain, or on
   * layout timeout / error paths so non–first-three exams do not keep mutating forever.
   */
  private previewAutoFitForceOneLayoutChain = false;

  /**
   * Per-kind auto-fit grow/revert (MCQ and CQ are independent when both appear in the selection).
   * Blocked seq matches {@link previewLayoutChangeSeq} while grow is disallowed for that user "change".
   */
  private autoFitMcqGrowBlockedSeq = -1;
  private autoFitMcqLastGrowSeq = -1;
  private autoFitMcqLastGrowPrevFontPx = 0;
  private autoFitCqGrowBlockedSeq = -1;
  private autoFitCqLastGrowSeq = -1;
  private autoFitCqLastGrowPrevFontPx = 0;

  /**
   * After min font: step through shared padding then header line fonts (gaps are manual). Reset on preview layout change.
   */
  private autoFitRegularLayoutTightenStep = 0;

  /** Gap/LH auto-expand (after fonts settle); validated per layout pass for MCQ≤1 / CQ≤2 sheets. */
  private autoFitExpandPhase = 0;
  private autoFitExpandPending:
    | { kind: 'cqGap'; prev: number; stepIndex: number }
    | { kind: 'cqLh'; prev: number; stepIndex: number }
    | { kind: 'mcqGap'; prev: number; stepIndex: number }
    | { kind: 'mcqLh'; prev: number; stepIndex: number }
    | null = null;
  private autoFitExpandStepBlocked = new Set<string>();

  /**
   * After gap/LH expand: try +0.1 header line height while MCQ≤1 sheet and CQ≤2 sheets.
   * Revert and block further tries this session if overflow (cleared on {@link onPreviewLayoutChange}).
   */
  private autoFitHeaderLineHeightPending: { prev: number } | null = null;
  private autoFitHeaderLineHeightGrowBlocked = false;

  /** Multi-column layout for MCQ / non-creative sheet pages: 1–10. */
  layoutColumns = 2;
  /** Multi-column layout for sheets that use the সৃজনশীল (creative) header block: 1–10. */
  layoutColumnsCreative = 2;

  /** Gap between columns in px (stepper or number input). */
  layoutColumnGapPx = 12;

  /** Show vertical rule between columns in preview. */
  showColumnDivider = true;

  /** MCQ option rows: grid columns (1–5), stepper in sidebar. */
  optionsColumns = 2;

  /** Unitless line-height for sheet header preview lines (PDF header uses separate pipeline). */
  previewHeaderLineHeight = QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT;

  /** Unitless line-height for question stem, subparts, and MCQ options in preview. */
  previewQuestionsLineHeight = QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT;
  /** Per-kind question line-height in preview (creative and MCQ controlled independently). */
  previewQuestionsLineHeightCreative = QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT;
  previewQuestionsLineHeightMcq = QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT;

  /** Horizontal page bands (1 = none; 2+ splits height like multiple rows). */
  pageSections = 1;

  /** Gap between page sections in px (like column gap); used when pageSections > 1. */
  sectionGapPx = 24;

  private static readonly LAYOUT_COLUMNS_MIN = 1;
  private static readonly LAYOUT_COLUMNS_MAX = 10;
  /** MCQ options grid column count in sheet preview. */
  private static readonly OPTIONS_COLUMNS_MIN = 1;
  private static readonly OPTIONS_COLUMNS_MAX = 5;
  private static readonly LAYOUT_GAP_MIN_PX = 1;
  private static readonly LAYOUT_GAP_MAX_PX = 100;

  private static readonly QUESTIONS_PADDING_MIN_PX = 0;
  private static readonly QUESTIONS_PADDING_MAX_PX = 100;
  private static readonly QUESTIONS_PADDING_DEFAULT_PX = 2;
  private static readonly PREVIEW_QUESTIONS_FONT_DEFAULT_PX = 10;
  private static readonly PREVIEW_QUESTIONS_FONT_MIN_PX = 7;
  /** Regular auto-fit: stop shrinking here (7px remains manual / stepper only). */
  private static readonly PREVIEW_QUESTIONS_FONT_AUTO_FIT_MIN_REGULAR_PX = 8;
  private static readonly PREVIEW_QUESTIONS_FONT_MAX_PX = 48;

  /** Preview line-height steppers: unitless, one decimal (e.g. 1.4). */
  /**
   * Mixed MCQ + CQ (two sheet pages): one textarea block drives **both** sheet headers.
   * 0–1 institute/exam, 2 subject (plain), 3 MCQ সময়+পূর্ণমান, 4 সৃজনশীল সময়+পূর্ণমান, 5 &lt;hr&gt;, 6 বিষয় কোড;
   * sq 25/30: 7 = CQ দ্রষ্টব্য, 8 = MCQ দ্রষ্টব্য (see {@link QuestionCreatorComponent.MIXED_HEADER_UNIFIED_SQ_NOTICE_LINES}).
   */
  private static readonly MIXED_HEADER_UNIFIED_MIN_LINES = 7;
  /**
   * Mixed CQ+MCQ + sq 25/30: nine textarea rows (indices 0–8).
   * After the বিষয় কোড row (index 6): **8th line** = index 7 ({@link MIXED_SQ_NOTICE_CREATIVE_SQ25} / SQ30),
   * **9th line** = index 8 ({@link MIXED_SQ_NOTICE_MCQ}). When switching to CQ-only, copy index 7 → index 6 (7th line);
   * when switching to MCQ-only, copy index 8 → index 7 (8th line).
   */
  private static readonly MIXED_HEADER_UNIFIED_SQ_NOTICE_LINES = 9;

  /** sq=25: পাঁচটি in creative দ্রষ্টব্য (8th textarea line / index 7). */
  private static readonly MIXED_SQ_NOTICE_CREATIVE_SQ25 =
    '[দ্রষ্টব্য : ডানপাশের সংখ্যা প্রশ্নের পুর্ন্মান জ্ঞাপক। প্রদত্ত উদ্দীপকগুলো মনোযোগসহকারে পড় এবং সংশ্লিষ্ট প্রশ্নগুলোর যথাযথ উত্তর দাও। যেকোন <b>পাঁচটি</b> প্রশ্নের উত্তর দিতে হবে।]';
  /** sq=30: সাতটি in creative দ্রষ্টব্য (8th textarea line / index 7). */
  private static readonly MIXED_SQ_NOTICE_CREATIVE_SQ30 =
    '[দ্রষ্টব্য : ডানপাশের সংখ্যা প্রশ্নের পুর্ন্মান জ্ঞাপক। প্রদত্ত উদ্দীপকগুলো মনোযোগসহকারে পড় এবং সংশ্লিষ্ট প্রশ্নগুলোর যথাযথ উত্তর দাও। যেকোন <b>সাতটি</b> প্রশ্নের উত্তর দিতে হবে।]';
  /** MCQ দ্রষ্টব্য (9th textarea line / index 8) — same for sq 25 and 30. */
  private static readonly MIXED_SQ_NOTICE_MCQ =
    '[দ্রষ্টব্য : সরবরাহকৃত বহুনির্বাচনি অভীক্ষার উত্তরপত্রে প্রশ্নের ক্রমিক নম্বরের বিপরীতে প্রদত্ত বর্ণসম্বলিত বৃত্তসমূহ হতে সঠিক/সর্বোৎকৃষ্ট উত্তরের বৃত্তটি বল পয়েন্ট কলম দ্বারা সম্পূর্ণ ভরাট কর। প্রতিটি প্রশ্নের মান <b>১</b>।]';

  private static readonly PREVIEW_LINE_HEIGHT_MIN = 1.0;
  private static readonly PREVIEW_LINE_HEIGHT_MAX = 2.2;
  private static readonly PREVIEW_HEADER_LINE_HEIGHT_DEFAULT = 1.3;
  private static readonly PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT = 1.4;

  private static clampPreviewLineHeight(v: number, fallback: number): number {
    if (!Number.isFinite(v)) return fallback;
    const stepped = Math.round(v * 10) / 10;
    return Math.max(
      QuestionCreatorComponent.PREVIEW_LINE_HEIGHT_MIN,
      Math.min(QuestionCreatorComponent.PREVIEW_LINE_HEIGHT_MAX, stepped)
    );
  }

  /**
   * Rounding parity with `views.jround` in PDF export (Math.floor(x + 0.5), not banker's `Math.round`).
   */
  private static exportJround(x: number): number {
    const v = Number(x);
    if (!Number.isFinite(v)) {
      return 0;
    }
    return Math.floor(v + 0.5);
  }

  /**
   * Same `--preview-q-*` px values as `ExportQuestionsView._build_pdf_playwright` / `render_items_html`.
   * `--preview-q-subpart-pl` is fixed `em` (see {@link PREVIEW_Q_SUBPART_PL_EM}) to match floated `.qn` column.
   */
  private static readonly PREVIEW_Q_SUBPART_PL_EM = '2.95em';

  private static exportPlaywrightPreviewSpacingFromFontPx(fzInput: number): {
    bnParenInsetPx: number;
    optHangPx: number;
    romanIndentPx: number;
    optRowGapPx: number;
    optColGapPx: number;
    contentPrPx: number;
    stemMbPx: number;
    subpartMtPx: number;
    optMyPx: number;
  } {
    const fz = Math.max(1, Number(fzInput));
    return {
      bnParenInsetPx: 2 * fz - 2,
      optHangPx: Math.max(8, QuestionCreatorComponent.exportJround((16 * fz) / 14)),
      romanIndentPx: Math.max(6, QuestionCreatorComponent.exportJround((10 * fz) / 14)),
      optRowGapPx: Math.max(2, QuestionCreatorComponent.exportJround((4 * fz) / 14)),
      optColGapPx: Math.max(10, QuestionCreatorComponent.exportJround((21 * fz) / 14)),
      contentPrPx: Math.max(1, QuestionCreatorComponent.exportJround((2 * fz) / 14)),
      stemMbPx: Math.max(1, QuestionCreatorComponent.exportJround((4 * fz) / 14)),
      subpartMtPx: Math.max(0, QuestionCreatorComponent.exportJround((2 * fz) / 14)),
      optMyPx: Math.max(1, QuestionCreatorComponent.exportJround((3 * fz) / 14)),
    };
  }

  private static readonly QUESTIONS_GAP_MIN_PX = 0;
  private static readonly QUESTIONS_GAP_MAX_PX = 100;
  private static readonly QUESTIONS_GAP_MCQ_DEFAULT_PX = 2;
  private static readonly QUESTIONS_GAP_CQ_DEFAULT_PX = 4;

  private static readonly PAGE_SECTIONS_MIN = 1;
  private static readonly PAGE_SECTIONS_MAX = 10;
  private static readonly CUSTOM_PAGE_MIN_IN = 2;
  private static readonly CUSTOM_PAGE_MAX_IN = 48;
  /** Step for − / + buttons (inches), same UX as px steppers. */
  private static readonly CUSTOM_PAGE_STEPPER_IN = 0.1;
  private static readonly INCH_TO_MM = 25.4;

  /** Paper width × height in mm (portrait). */
  private static readonly PAPER_MM: Record<string, { w: number; h: number }> = {
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
    A5: { w: 148, h: 210 },
    B4: { w: 250, h: 353 },
    B5: { w: 176, h: 250 },
    Letter: { w: 216, h: 279 },
    Legal: { w: 216, h: 356 },
    Tabloid: { w: 279, h: 432 },
  };

  private static roundInches2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  private static a4WidthInDefault(): number {
    return QuestionCreatorComponent.roundInches2(
      QuestionCreatorComponent.PAPER_MM['A4'].w / QuestionCreatorComponent.INCH_TO_MM
    );
  }

  private static a4HeightInDefault(): number {
    return QuestionCreatorComponent.roundInches2(
      QuestionCreatorComponent.PAPER_MM['A4'].h / QuestionCreatorComponent.INCH_TO_MM
    );
  }

  /** Exposed for template `min` / `max` on inputs. */
  readonly layoutColumnsMin = QuestionCreatorComponent.LAYOUT_COLUMNS_MIN;
  readonly layoutColumnsMax = QuestionCreatorComponent.LAYOUT_COLUMNS_MAX;
  readonly optionsColumnsMin = QuestionCreatorComponent.OPTIONS_COLUMNS_MIN;
  readonly optionsColumnsMax = QuestionCreatorComponent.OPTIONS_COLUMNS_MAX;
  readonly previewLineHeightMin = QuestionCreatorComponent.PREVIEW_LINE_HEIGHT_MIN;
  readonly previewLineHeightMax = QuestionCreatorComponent.PREVIEW_LINE_HEIGHT_MAX;
  readonly layoutColumnGapMin = QuestionCreatorComponent.LAYOUT_GAP_MIN_PX;
  readonly layoutColumnGapMax = QuestionCreatorComponent.LAYOUT_GAP_MAX_PX;
  readonly questionsPaddingMin = QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX;
  readonly questionsPaddingMax = QuestionCreatorComponent.QUESTIONS_PADDING_MAX_PX;
  readonly questionsGapMin = QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX;
  readonly questionsGapMax = QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX;
  readonly previewQuestionsFontMin = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MIN_PX;
  readonly previewQuestionsFontMax = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX;
  readonly pageSectionsMin = QuestionCreatorComponent.PAGE_SECTIONS_MIN;
  readonly pageSectionsMax = QuestionCreatorComponent.PAGE_SECTIONS_MAX;
  readonly sectionGapMin = QuestionCreatorComponent.LAYOUT_GAP_MIN_PX;
  readonly sectionGapMax = QuestionCreatorComponent.LAYOUT_GAP_MAX_PX;
  readonly customPageInMin = QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN;
  readonly customPageInMax = QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN;

  pageSizes: { value: string; label: string }[] = [
    { value: 'A4', label: 'A4' },
    { value: 'A3', label: 'A3' },
    { value: 'A5', label: 'A5' },
    { value: 'B4', label: 'B4' },
    { value: 'B5', label: 'B5' },
    { value: 'Letter', label: 'Letter' },
    { value: 'Legal', label: 'Legal' },
    { value: 'Tabloid', label: 'Tabloid' },
    { value: 'Custom', label: 'Custom' },
  ];

  showExportFormatDialog = false;
  exportFormat: ExportFormat = 'both';
  saving = false;
  saveSuccessMessage = '';

  /** Aside overlay during Reset / Auto Fit (same stepped ring as global page load). */
  resetAutoFitOverlayVisible = false;
  resetAutoFitOverlayPercent = 0;
  readonly resetAutoFitOverlayMessage = 'Questions are fitting automatically.....';
  private resetAutoFitProgressTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Full-screen blocking overlay: {@link resetAutoFitOverlayVisible} during Reset, **or** (first-three exam and
   * layout queued/in flight). Uses exam whitelist + `layoutTimer` / `layoutPassInFlight`, not {@link previewAutoFitSuppressNextLayoutRun}
   * directly — any multi-pass `scheduleLayout` chain shows the same “busy” chrome for first-three users.
   */
  get autoFitBlockingOverlayVisible(): boolean {
    return (
      this.resetAutoFitOverlayVisible ||
      (this.examTypeKeyIsFirstThreeExamOptions(this.headerExamTypeKey) &&
        (this.layoutPassInFlight || this.layoutTimer != null))
    );
  }

  /** CSS px per mm at 96dpi. */
  static readonly MM_TO_PX = 96 / 25.4;

  /**
   * Bypass: extra blank space at the bottom of MCQ sheets in live preview only (visual margin + taller
   * paper box). Does not change pagination, measure rail, or export — see {@link previewOnlyMcqExtraHeightPx}.
   */
  private static readonly PREVIEW_ONLY_MCQ_EXTRA_HEIGHT_IN = 0.5;

  /**
   * Maximum “zoom out” (overview) vs true print width: 50% when the column is wide enough.
   * When the stage is narrower than paperWidthPx × this value, scale shrinks further to fit.
   */
  readonly previewMaxZoomOutScale = 0.5;

  /** Hover lens uses 4× the current overview scale (relative to 1:1 print-sized DOM). */
  readonly magnifierScaleMultiplier = 4;

  readonly lensSizePx = 200;

  /** Live overview scale (≤ previewMaxZoomOutScale) so the page fits inside the preview stage. */
  previewFitScale = 0.5;

  private previewStageResizeObserver?: ResizeObserver;

  /** Paginated live preview (recomputed from measured heights). */
  paginatedPages: PreviewPage[] = [];
  /** Mixed types + one-page fit: render one merged header block. */
  mixedTypesSinglePageMergedHeader = false;
  /** First page should reserve an empty leading column (content starts at column 2). */
  leadEmptyFirstPageActive = false;
  /** Last measured header height used for page-fit calculations. */
  measuredHeaderHeightPx = 0;

  magnifierActive = false;
  /** Fixed viewport position (magnifier is `position: fixed`). */
  lensFixedLeft = 0;
  lensFixedTop = 0;
  /** Lens size in px (wider on narrow viewports). */
  lensW = 200;
  lensH = 200;
  magnifierTransform = 'scale(2)';

  @ViewChild('measureRail') measureRail?: ElementRef<HTMLElement>;
  @ViewChild('measureHeader') measureHeader?: ElementRef<HTMLElement>;
  @ViewChildren('measureBlock') measureBlocks!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('previewStage') previewStage?: ElementRef<HTMLElement>;
  @ViewChild('previewCol') previewCol?: ElementRef<HTMLElement>;
  @ViewChild('scaleWrap') scaleWrap?: ElementRef<HTMLElement>;
  @ViewChildren('headerLineEditorInput')
  headerLineEditorInputs!: QueryList<ElementRef<HTMLInputElement>>;

  private layoutTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * True while {@link runLayout} is in its synchronous preamble or inside its nested RAF callback
   * (pagination + auto-fit). {@link layoutTimer} is cleared at the start of runLayout, so this is
   * required for {@link waitForLayoutIdle} to wait until auto-fit chains finish.
   */
  private layoutPassInFlight = false;
  /**
   * Prevent duplicate load/error listeners on the same `<img>` inside measure blocks.
   * Used to re-run pagination once async media dimensions are known.
   */
  private pendingMeasureImageListeners = new WeakSet<HTMLImageElement>();
  private magnifierRaf = 0;
  private remotePersistTimer: ReturnType<typeof setTimeout> | number | null = null;
  /** Next macrotick coalesce; avoids spamming while still syncing soon after edits. */
  private static readonly REMOTE_CREATOR_PERSIST_DEBOUNCE_MS = 0;
  private headerLineFontToastTimer: ReturnType<typeof setTimeout> | number | null = null;
  /**
   * After a full restore from storage/API with {@link applyFullCreatorPayloadFromParsed} trustSavedHeader,
   * skip {@link rebuildQuestionHeader} in ngAfterViewInit so saved header + layout are not replaced by defaults.
   */
  private creatorTrustedHeaderRestored = false;
  /** After persist restore, first subject-meta API refresh should not replace the saved header block. */
  private suppressHydrateHeaderRebuildOnce = false;
  private questionQidsHydrationSub?: Subscription;
  /**
   * True until first restore path finishes (sync or async API). Prevents ngAfterViewInit from writing
   * factory defaults to localStorage / scheduling remote save before `getCustomerSettings` applies.
   */
  private creatorBootstrapPending = true;
  /** True while v2 `questionQids` are being fetched — blocks persist so we don't save empty qids. */
  private questionQidsHydrationInFlight = false;
  /** Set when navigating from /question with `smartCreator`; cleared after optional post-init {@link save}. */
  private smartCreatorSavePending = false;
  /**
   * Header fields chosen in /question Smart Question Creator modal (EIIN, exam, set).
   * Kept through first-visit {@link resetCreatorSettings} so MCQ set is not cleared before auto-save.
   */
  private smartCreatorNavHeader: {
    eiin?: string;
    examTypeKey?: string;
    mcqSetLetter?: (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number] | null;
  } | null = null;

  /** True when this init restored an existing draft (session/history/local). */
  private creatorRestoredDraftOnce = false;

  /** Shown over the header line row after ± font-size click (fixed viewport position). */
  headerLineFontToastVisible = false;
  headerLineFontToastText = '';
  headerLineFontToastLeft = 0;
  headerLineFontToastTop = 0;

  constructor(
    private router: Router,
    private apiService: ApiService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.creatorBootstrapPending = true;
    this.questionQidsHydrationInFlight = false;
    this.loadingService.setTotal(1);
    const state = history.state as {
      questions?: unknown[];
      context?: Record<string, unknown>;
      /** From /question Type filter — merged into filter localStorage so Back restores checkboxes. */
      questionTypes?: string[];
      /** From `/question` smart creator navigation: force Regular + run Save after init. */
      smartCreator?: boolean;
      /** From `/question` Smart Question Creator modal: EIIN, exam name key, MCQ set letter. */
      smartCreatorHeader?: {
        eiin?: string;
        examTypeKey?: string;
        mcqSetLetter?: string | null;
      };
    } | null;
    let restored = false;

    const sessionRaw = sessionStorage.getItem(QUESTION_CREATOR_STATE_KEY);
    if (sessionRaw) {
      try {
        const parsed = JSON.parse(sessionRaw) as Record<string, unknown>;
        if (this.isRestorableCreatorPayload(parsed) && this.sessionReturnPayloadHasDraft(parsed)) {
          this.applyFullCreatorPayloadFromParsed(parsed, { trustSavedHeader: true });
          sessionStorage.removeItem(QUESTION_CREATOR_STATE_KEY);
          restored = true;
          this.creatorRestoredDraftOnce = true;
        }
      } catch (_) {}
    }

    if (
      !restored &&
      state?.questions &&
      Array.isArray(state.questions) &&
      state.questions.length > 0
    ) {
      this.questions = state.questions as any[];
      this.context = (state.context || {}) as QuestionCreatorContext;
      this.syncQuestionListFilterTypesFromNavigation(state.questionTypes);
      this.mergeLayoutFromLocalStorage();
      restored = true;
      this.creatorRestoredDraftOnce = true;
    }

    if (!restored) {
      const locRaw = localStorage.getItem(QUESTION_CREATOR_LOCAL_STORAGE_KEY);
      if (locRaw) {
        try {
          const parsed = JSON.parse(locRaw) as Record<string, unknown>;
          if (this.isRestorableCreatorPayload(parsed)) {
            this.applyFullCreatorPayloadFromParsed(parsed, { trustSavedHeader: true });
            restored = true;
            this.creatorRestoredDraftOnce = true;
          }
        } catch (_) {}
      }
    }

    if (!restored) {
      const token = this.apiService.getToken();
      if (token) {
        this.apiService
          .getCustomerSettings()
          .pipe(take(1))
          .subscribe({
            next: (res) => {
              let ok = false;
              const blob = res.settings?.[CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY];
              if (typeof blob === 'string' && blob.trim()) {
                try {
                  const parsed = JSON.parse(blob) as Record<string, unknown>;
                  if (this.isRestorableCreatorPayload(parsed)) {
                    if (this.remotePersistTimer != null) {
                      clearTimeout(this.remotePersistTimer);
                      this.remotePersistTimer = null;
                    }
                    this.creatorBootstrapPending = false;
                    this.applyFullCreatorPayloadFromParsed(parsed, { trustSavedHeader: true });
                    ok = true;
                    /** Do not mirror remote blob into localStorage: remote is settings-only (no qids); full draft stays local-only. */
                  }
                } catch (_) {
                  /* bad json */
                }
              }
              if (ok) {
                this.finishCreatorInitAfterRestore();
              } else {
                this.router.navigate(['/question']);
              }
            },
            error: () => this.router.navigate(['/question']),
          });
        return;
      }
      this.router.navigate(['/question']);
      return;
    }
    this.creatorBootstrapPending = false;
    this.finishCreatorInitAfterRestore();
  }

  private finishCreatorInitAfterRestore(): void {
    this.syncPreviewAutoFitSuppressWithExamType();
    this.applySmartCreatorFromNavigationIfNeeded();
    this.hydrateSubjectMetaFromApiIfNeeded();
    this.initEiinLiveSearch();
    this.flushInitialEiinLookup();
    queueMicrotask(() => {
      this.maybeRunFirstVisitAutoReset();
      queueMicrotask(() => this.maybeCompleteSmartCreatorSaveAfterInit());
    });
  }

  /**
   * From `/question` “Smart Question Creator”: merge navigation context, keep Board mode,
   * then (after first-visit reset) run preview auto-fit, then the same Save flow when the draft has questions.
   */
  private applySmartCreatorFromNavigationIfNeeded(): void {
    const st = history.state as {
      smartCreator?: boolean;
      context?: Record<string, unknown>;
      smartCreatorHeader?: {
        eiin?: string;
        examTypeKey?: string;
        mcqSetLetter?: string | null;
      };
    } | null;
    if (!st?.smartCreator) {
      return;
    }
    const rawHdr = st.smartCreatorHeader;
    if (rawHdr && typeof rawHdr === 'object') {
      const nav: {
        eiin?: string;
        examTypeKey?: string;
        mcqSetLetter?: (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number] | null;
      } = {};
      if (typeof rawHdr.eiin === 'string') {
        nav.eiin = rawHdr.eiin;
      }
      if (typeof rawHdr.examTypeKey === 'string') {
        nav.examTypeKey = rawHdr.examTypeKey;
      }
      if ('mcqSetLetter' in rawHdr) {
        const L = rawHdr.mcqSetLetter;
        if (L === null) {
          nav.mcqSetLetter = null;
        } else if (
          typeof L === 'string' &&
          (QuestionCreatorComponent.MCQ_SET_LETTERS as readonly string[]).includes(L)
        ) {
          nav.mcqSetLetter = L as (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number];
        } else {
          nav.mcqSetLetter = null;
        }
      }
      this.smartCreatorNavHeader = Object.keys(nav).length > 0 ? nav : null;
    } else {
      this.smartCreatorNavHeader = null;
    }
    if (st.context && typeof st.context === 'object') {
      this.context = { ...this.context, ...(st.context as QuestionCreatorContext) };
    }
    this.applySmartCreatorNavHeaderFields();
    this.mcqPageOrientation = 'portrait';
    this.syncPageOrientationForQTypeFilter();
    this.smartCreatorSavePending = true;
    try {
      const prev = history.state;
      const next =
        typeof prev === 'object' && prev !== null && !Array.isArray(prev)
          ? { ...(prev as object), smartCreator: false }
          : { smartCreator: false };
      history.replaceState(next, '', window.location.href);
    } catch (_) {
      /* history API */
    }
    this.schedulePersistCreatorStateToLocalStorage();
    this.cdr.markForCheck();
  }

  /** Apply {@link smartCreatorNavHeader} to EIIN / exam / MCQ set and rebuild header lines. */
  private applySmartCreatorNavHeaderFields(): void {
    const hdr = this.smartCreatorNavHeader;
    if (!hdr) {
      return;
    }
    const ei = typeof hdr.eiin === 'string' ? hdr.eiin.trim() : '';
    if (ei) {
      this.headerEiin = ei;
    }
    const ek = typeof hdr.examTypeKey === 'string' ? hdr.examTypeKey.trim() : '';
    if (ek && this.examTypeOptions.some((o) => o.key === ek)) {
      this.headerExamTypeKey = ek;
    }
    if ('mcqSetLetter' in hdr) {
      const L = hdr.mcqSetLetter;
      if (L === null || L === undefined) {
        this.selectedMcqSetLetter = null;
      } else if ((QuestionCreatorComponent.MCQ_SET_LETTERS as readonly string[]).includes(String(L))) {
        this.selectedMcqSetLetter = L as (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number];
      }
    }
    this.onHeaderMetaChange();
    if (this.selectionHasMcqType()) {
      this.onMcqSetLetterChange();
    }
  }

  private maybeCompleteSmartCreatorSaveAfterInit(): void {
    if (!this.smartCreatorSavePending) {
      return;
    }
    this.smartCreatorSavePending = false;
    if (this.questions.length === 0) {
      return;
    }
    this.applySmartCreatorNavHeaderFields();
    void this.runAutoFitThenSave();
  }

  /** Smart Question Creator: full auto-fit (same as first-three exams, any exam name), then {@link save}. */
  private async runAutoFitThenSave(): Promise<void> {
    try {
      // Bypass exam whitelist for the upcoming layout chain only (paired with clear after pagination in runLayout).
      this.previewAutoFitForceOneLayoutChain = true;
      // Run layout with auto-fit enabled and without one-shot suppress — Smart path should mutate then settle.
      this.onPreviewLayoutChange({ suppressAutoFit: false });
      await this.waitForLayoutIdle();
    } catch {
      /* layout did not settle in time — still attempt save; clear gate for later layouts */
      this.previewAutoFitForceOneLayoutChain = false;
    }
    this.save();
  }

  /**
   * First browser visit to `/question/create`: same as “Reset Setting” once, then remember locally + in remote
   * settings blob. Reloads and later visits skip this.
   */
  private maybeRunFirstVisitAutoReset(): void {
    try {
      if (localStorage.getItem(QUESTION_CREATOR_FIRST_VISIT_RESET_KEY)) {
        return;
      }
      // If we just restored a draft (e.g. post-login return), do NOT auto-reset and wipe it.
      if (this.creatorRestoredDraftOnce || (this.questions?.length ?? 0) > 0) {
        localStorage.setItem(QUESTION_CREATOR_FIRST_VISIT_RESET_KEY, '1');
        return;
      }
      this.resetCreatorSettings({ skipReload: true, skipRemotePersist: true });
      localStorage.setItem(QUESTION_CREATOR_FIRST_VISIT_RESET_KEY, '1');
      if (this.apiService.getToken()) {
        this.apiService
          .updateCustomerSettings({
            [CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY]: JSON.stringify(
              this.buildRemoteCustomerSettingsPayload()
            ),
          })
          .subscribe({ next: () => {}, error: () => {} });
      }
      this.cdr.markForCheck();
    } catch (_) {
      /* private mode */
    }
  }

  /** After the debounced EIIN subscription exists, run one lookup for the current field (e.g. default / post-reset). */
  private flushInitialEiinLookup(): void {
    const q = (this.headerEiin ?? '').trim();
    if (q) {
      this.eiinSearchSubject.next(q);
    }
  }

  ngAfterViewInit(): void {
    const hadTrustedRestore = this.creatorTrustedHeaderRestored;
    setTimeout(() => this.loadingService.completeOne(), 0);
    this.measureBlocks.changes.subscribe(() => this.scheduleLayout());
    const stage = this.previewStage?.nativeElement;
    if (typeof ResizeObserver !== 'undefined' && stage) {
      this.previewStageResizeObserver = new ResizeObserver(() => this.updatePreviewFitScale());
      this.previewStageResizeObserver.observe(stage);
    }
    if (!this.headerUseLegacyQuestionHeader) {
      if (this.creatorTrustedHeaderRestored) {
        this.creatorTrustedHeaderRestored = false;
        this.ensureMcqTextareaSixUpperLines();
        this.runHeaderTextareaSyncs();
        this.syncHeaderFontSizesToLineCount();
      } else if (
        this.questions.length > 0 &&
        !this.selectionHasBothHeaderTypes() &&
        this.paperSubjectMetaLinesEligible()
      ) {
        /** Stale mixed header from localStorage: same header path as Reset (clear + rebuild + syncs). */
        this.normalizeStructuredHeaderForSingleQuestionTypeSelection();
      } else {
        this.rebuildQuestionHeader();
      }
    } else {
      this.syncHeaderFontSizesToLineCount();
    }
    this.syncPreviewAutoFitSuppressWithExamType();
    this.scheduleLayout();
    queueMicrotask(() => this.updatePreviewFitScale());
    this.schedulePersistCreatorStateToLocalStorage();
  }

  ngOnDestroy(): void {
    this.clearResetAutoFitProgressTimer();
    this.resetAutoFitOverlayVisible = false;
    this.eiinSearchSub?.unsubscribe();
    this.eiinSearchSub = undefined;
    this.previewStageResizeObserver?.disconnect();
    this.previewStageResizeObserver = undefined;
    if (this.remotePersistTimer != null) {
      clearTimeout(this.remotePersistTimer);
      this.remotePersistTimer = null;
    }
    if (this.headerLineFontToastTimer != null) {
      clearTimeout(this.headerLineFontToastTimer);
      this.headerLineFontToastTimer = null;
    }
    this.questionQidsHydrationSub?.unsubscribe();
    this.questionQidsHydrationSub = undefined;
    const skipFinalPersist =
      this.creatorBootstrapPending || this.questionQidsHydrationInFlight;
    this.questionQidsHydrationInFlight = false;
    if (!skipFinalPersist) {
      try {
        const payload = this.buildPersistPayload();
        localStorage.setItem(QUESTION_CREATOR_LOCAL_STORAGE_KEY, JSON.stringify(payload));
      } catch (_) {
        /* quota */
      }
      if (this.apiService.getToken()) {
        this.apiService
          .updateCustomerSettings({
            [CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY]: JSON.stringify(
              this.buildRemoteCustomerSettingsPayload()
            ),
          })
          .subscribe({ next: () => {}, error: () => {} });
      }
    }
  }

  /** Page layout + header from a stored object (session, localStorage, or merge). */
  private applyLayoutAndHeaderFromParsed(
    parsed: Record<string, unknown>,
    opts?: { trustSavedHeader?: boolean }
  ): void {
    const qhParsed = parsed['questionHeader'];
    const ps = parsed['pageSize'];
    if (ps != null && typeof ps === 'string') {
      this.pageSize = ps;
    }
    const po = parsed['pageOrientation'];
    if (po === 'landscape' || po === 'portrait') {
      this.pageOrientation = po;
    }
    const cqo = parsed['cqPageOrientation'];
    if (cqo === 'landscape' || cqo === 'portrait') {
      this.cqPageOrientation = cqo;
    }
    const mqo = parsed['mcqPageOrientation'];
    if (mqo === 'landscape' || mqo === 'portrait') {
      this.mcqPageOrientation = mqo;
    }
    const cw = parsed['customPageWidthIn'];
    if (cw != null && typeof cw === 'number') {
      this.customPageWidthIn = cw;
    }
    const ch = parsed['customPageHeightIn'];
    if (ch != null && typeof ch === 'number') {
      this.customPageHeightIn = ch;
    }
    const mp = parsed['marginPreset'];
    if (mp === 'narrow' || mp === 'standard' || mp === 'wide' || mp === 'custom') {
      this.marginPreset = mp;
    }
    const mt = parsed['marginTop'];
    if (mt != null && typeof mt === 'number') this.marginTop = mt;
    const mr = parsed['marginRight'];
    if (mr != null && typeof mr === 'number') {
      this.marginRight = mr;
    }
    const mb = parsed['marginBottom'];
    if (mb != null && typeof mb === 'number') {
      this.marginBottom = mb;
    }
    const ml = parsed['marginLeft'];
    if (ml != null && typeof ml === 'number') {
      this.marginLeft = ml;
    }
    const qpad = parsed['questionsPadding'];
    if (qpad != null) {
      const p = Math.round(Number(qpad));
      if (Number.isFinite(p)) {
        this.questionsPadding = Math.max(
          QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX,
          Math.min(QuestionCreatorComponent.QUESTIONS_PADDING_MAX_PX, p)
        );
      }
    }
    const qgap = parsed['questionsGap'];
    if (qgap != null) {
      const g = Math.round(Number(qgap));
      if (Number.isFinite(g)) {
        this.questionsGap = Math.max(
          QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX,
          Math.min(QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX, g)
        );
      }
    }
    const qgapC = parsed['questionsGapCreative'];
    if (qgapC != null) {
      const g = Math.round(Number(qgapC));
      if (Number.isFinite(g)) {
        this.questionsGapCreative = Math.max(
          QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX,
          Math.min(QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX, g)
        );
      }
    } else {
      this.questionsGapCreative = this.questionsGap;
    }
    const qfp = parsed['previewQuestionsFontPx'];
    if (qfp != null) {
      const f = Math.round(Number(qfp));
      if (Number.isFinite(f)) {
        this.previewQuestionsFontPx = Math.max(
          QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MIN_PX,
          Math.min(QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX, f)
        );
      }
    }
    const qfpC = parsed['previewQuestionsFontPxCreative'];
    if (qfpC != null) {
      this.previewQuestionsFontPxCreative = this.clampPreviewQuestionFontPx(Number(qfpC));
    } else {
      this.previewQuestionsFontPxCreative = this.previewQuestionsFontPx;
    }
    const qfpM = parsed['previewQuestionsFontPxMcq'];
    if (qfpM != null) {
      this.previewQuestionsFontPxMcq = this.clampPreviewQuestionFontPx(Number(qfpM));
    } else {
      this.previewQuestionsFontPxMcq = this.previewQuestionsFontPx;
    }
    const lc = parsed['layoutColumns'];
    if (lc != null && typeof lc === 'number') {
      this.layoutColumns = Math.max(
        QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
        Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, Math.floor(lc))
      );
    } else {
      const lcs = parsed['layoutColumnsStr'];
      if (lcs != null) {
        const n = parseInt(String(lcs), 10);
        if (Number.isFinite(n)) {
          this.layoutColumns = Math.max(
            QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
            Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, n)
          );
        }
      }
    }
    const lcc = parsed['layoutColumnsCreative'];
    if (lcc != null && typeof lcc === 'number') {
      this.layoutColumnsCreative = Math.max(
        QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
        Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, Math.floor(lcc))
      );
    } else {
      this.layoutColumnsCreative = this.layoutColumns;
    }
    const lcg = parsed['layoutColumnGapPx'];
    if (lcg != null && typeof lcg === 'number') {
      this.layoutColumnGapPx = Math.max(
        QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
        Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, Math.round(lcg))
      );
    }
    const scd = parsed['showColumnDivider'];
    if (scd != null) this.showColumnDivider = !!scd;
    const oc = parsed['optionsColumns'];
    if (oc != null && typeof oc === 'number') {
      this.optionsColumns = Math.max(
        QuestionCreatorComponent.OPTIONS_COLUMNS_MIN,
        Math.min(QuestionCreatorComponent.OPTIONS_COLUMNS_MAX, Math.floor(oc))
      );
    }
    const phlh = parsed['previewHeaderLineHeight'];
    if (phlh != null) {
      const n = typeof phlh === 'number' ? phlh : Number(phlh);
      if (Number.isFinite(n)) {
        this.previewHeaderLineHeight = QuestionCreatorComponent.clampPreviewLineHeight(
          n,
          QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT
        );
      }
    }
    const pqlh = parsed['previewQuestionsLineHeight'];
    if (pqlh != null) {
      const n = typeof pqlh === 'number' ? pqlh : Number(pqlh);
      if (Number.isFinite(n)) {
        this.previewQuestionsLineHeight = QuestionCreatorComponent.clampPreviewLineHeight(
          n,
          QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
        );
      }
    }
    const pqlhC = parsed['previewQuestionsLineHeightCreative'];
    if (pqlhC != null) {
      const n = typeof pqlhC === 'number' ? pqlhC : Number(pqlhC);
      if (Number.isFinite(n)) {
        this.previewQuestionsLineHeightCreative = QuestionCreatorComponent.clampPreviewLineHeight(
          n,
          QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
        );
      }
    } else {
      this.previewQuestionsLineHeightCreative = this.previewQuestionsLineHeight;
    }
    const pqlhM = parsed['previewQuestionsLineHeightMcq'];
    if (pqlhM != null) {
      const n = typeof pqlhM === 'number' ? pqlhM : Number(pqlhM);
      if (Number.isFinite(n)) {
        this.previewQuestionsLineHeightMcq = QuestionCreatorComponent.clampPreviewLineHeight(
          n,
          QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
        );
      }
    } else {
      this.previewQuestionsLineHeightMcq = this.previewQuestionsLineHeight;
    }
    const psec = parsed['pageSections'];
    if (psec != null && typeof psec === 'number') {
      this.pageSections = Math.max(
        QuestionCreatorComponent.PAGE_SECTIONS_MIN,
        Math.min(QuestionCreatorComponent.PAGE_SECTIONS_MAX, Math.floor(psec))
      );
    }
    const sg = parsed['sectionGapPx'];
    if (sg != null && typeof sg === 'number') {
      this.sectionGapPx = Math.max(
        QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
        Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, Math.round(sg))
      );
    }

    const mix = parsed['mixedTypesSinglePageMergedHeader'];
    if (mix === true || mix === false) {
      this.mixedTypesSinglePageMergedHeader = mix;
    }

    this.showColumnDivider = false;
    this.mcqPageOrientation = 'portrait';
    this.syncPageOrientationForQTypeFilter();

    const msl = parsed['mcqSetLetter'];
    if (msl === 'ক' || msl === 'খ' || msl === 'গ' || msl === 'ঘ') {
      this.selectedMcqSetLetter = msl;
    } else if (msl === null || msl === '') {
      this.selectedMcqSetLetter = null;
    }

    const mos = parsed['mcqOrderBySet'];
    if (mos != null && typeof mos === 'object' && !Array.isArray(mos)) {
      this.persistedMcqOrderBySet = this.parsePersistedMcqOrderMap(mos);
      this.mcqOrdersFrozen = Object.keys(this.persistedMcqOrderBySet).length > 0;
    } else {
      this.persistedMcqOrderBySet = {};
      this.mcqOrdersFrozen = false;
    }
    const qhm = parsed['questionHeaderByMcqSet'];
    if (qhm != null && typeof qhm === 'object' && !Array.isArray(qhm)) {
      this.questionHeaderByMcqSet = this.parsePersistedHeaderMap(qhm);
    } else {
      this.questionHeaderByMcqSet = {};
    }

    const hfs = parsed['headerLineFontSizes'];
    if (Array.isArray(hfs)) {
      this.headerLineFontSizes = hfs
        .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
        .map((x) =>
          Math.max(
            QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX,
            Math.min(QuestionCreatorComponent.HEADER_LINE_FONT_MAX_PX, Math.round(x))
          )
        );
    } else {
      this.headerLineFontSizes = [];
      const h1f = parsed['headerLine1FontPx'];
      if (h1f != null && typeof h1f === 'number' && Number.isFinite(h1f)) {
        this.headerLineFontSizes.push(
          Math.max(
            QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX,
            Math.min(QuestionCreatorComponent.HEADER_LINE_FONT_MAX_PX, Math.round(h1f))
          )
        );
      }
      const h2f = parsed['headerLine2FontPx'];
      if (h2f != null && typeof h2f === 'number' && Number.isFinite(h2f)) {
        this.headerLineFontSizes.push(
          Math.max(
            QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX,
            Math.min(QuestionCreatorComponent.HEADER_LINE_FONT_MAX_PX, Math.round(h2f))
          )
        );
      }
    }

    const hei = parsed['headerEiin'];
    if (hei != null && typeof hei === 'string') {
      this.headerEiin = hei;
    }
    const hinst = parsed['headerInstitute'];
    if (hinst != null && typeof hinst === 'object' && !Array.isArray(hinst)) {
      this.headerInstitute = hinst as InstituteHeaderSummary;
    }
    const hk = parsed['headerExamTypeKey'];
    if (hk != null && typeof hk === 'string') {
      this.headerExamTypeKey = hk;
    }
    const hLegacyFlag = parsed['headerUseLegacyQuestionHeader'];
    if (hLegacyFlag === true) {
      this.headerUseLegacyQuestionHeader = true;
    } else if (hLegacyFlag === false) {
      this.headerUseLegacyQuestionHeader = false;
    } else if (
      qhParsed != null &&
      typeof qhParsed === 'string' &&
      qhParsed.length > 0 &&
      hk == null
    ) {
      this.headerUseLegacyQuestionHeader = true;
    } else if (hk != null) {
      this.headerUseLegacyQuestionHeader = false;
    }

    if (this.headerUseLegacyQuestionHeader) {
      if (qhParsed != null && typeof qhParsed === 'string') {
        this.questionHeader = qhParsed;
      }
    } else {
      if (qhParsed != null && typeof qhParsed === 'string') {
        this.questionHeader = qhParsed;
      }
      if (!opts?.trustSavedHeader) {
        this.rebuildQuestionHeader();
      }
    }

    // Persisted flag so reload doesn't re-seed default template rows unexpectedly.
    const hmed = parsed['headerManualEditSinceRebuild'];
    if (typeof hmed === 'boolean') {
      this.headerManualEditSinceRebuild = hmed;
    } else {
      this.headerManualEditSinceRebuild = false;
    }
    this.syncHeaderFontSizesToLineCount();
  }

  /** Payload `v` may be stored as string from some backends. */
  private getPersistPayloadVersion(parsed: Record<string, unknown>): number {
    const raw = parsed['v'];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return 1;
  }

  private applyFullCreatorPayloadFromParsed(
    parsed: Record<string, unknown>,
    opts?: { trustSavedHeader?: boolean }
  ): void {
    const ctx = parsed['context'];
    this.context = (ctx as QuestionCreatorContext) || {};
    this.applyLayoutAndHeaderFromParsed(parsed, opts);
    const trust = !!opts?.trustSavedHeader;
    this.creatorTrustedHeaderRestored = trust;
    this.suppressHydrateHeaderRebuildOnce = trust;

    const v = this.getPersistPayloadVersion(parsed);
    if (parsed['creatorFirstVisitResetDone'] === true) {
      try {
        localStorage.setItem(QUESTION_CREATOR_FIRST_VISIT_RESET_KEY, '1');
      } catch (_) {
        /* quota */
      }
    }
    if (v >= QUESTION_CREATOR_PAYLOAD_VERSION) {
      const qidsRaw = parsed['questionQids'];
      const qids = Array.isArray(qidsRaw)
        ? (qidsRaw as unknown[]).filter(
            (x): x is string | number => x != null && (typeof x === 'string' || typeof x === 'number')
          )
        : [];

      // If session/local payload includes full rows, prefer them (so reload renders immediately).
      // But if those rows are just placeholders, re-hydrate from API when logged in.
      const qsRaw = parsed['questions'];
      if (Array.isArray(qsRaw) && qsRaw.length > 0) {
        this.questions = qsRaw as any[];
        const token = this.apiService.getToken();
        if (token && qids.length > 0 && this.questionsLookLikeQidPlaceholders(this.questions)) {
          this.hydrateQuestionsFromQids(qids);
        }
        return;
      }
      this.questions = [];
      this.hydrateQuestionsFromQids(qids);
      return;
    }

    const q = parsed['questions'];
    this.questions = Array.isArray(q) ? (q as any[]) : [];
  }

  /** True when restored rows look like qid-only placeholders (e.g. question: "— (qid)"). */
  private questionsLookLikeQidPlaceholders(rows: any[]): boolean {
    if (!Array.isArray(rows) || rows.length === 0) return true;
    let checked = 0;
    for (const r of rows) {
      if (r == null || typeof r !== 'object') continue;
      const qid = (r as any).qid;
      if (qid == null) continue;
      checked++;
      const qText = String((r as any).question ?? '');
      // Our fallback placeholder format in hydrateQuestionsFromQids().
      if (!qText || qText.startsWith('— (')) {
        return true;
      }
      // If question exists but options/answer are missing for MCQ, also consider it placeholder-ish.
      const hasAnyOption =
        (r as any).option_1 != null || (r as any).option_2 != null || (r as any).option_3 != null || (r as any).option_4 != null;
      if (!hasAnyOption && typeof (r as any).type === 'string' && String((r as any).type).includes('বহুনির্বাচনি')) {
        return true;
      }
      if (checked >= 6) break;
    }
    return checked === 0;
  }

  /** Post-login / pre-token session blob: v2 always restores layout; v1 needs non-empty `questions`. */
  private sessionReturnPayloadHasDraft(parsed: Record<string, unknown>): boolean {
    const v = this.getPersistPayloadVersion(parsed);
    if (v >= QUESTION_CREATOR_PAYLOAD_VERSION) return true;
    const qs = parsed['questions'];
    return Array.isArray(qs) && qs.length > 0;
  }

  private hydrateQuestionsFromQids(qids: (string | number)[]): void {
    this.questionQidsHydrationSub?.unsubscribe();
    if (!qids.length) {
      this.questionQidsHydrationInFlight = false;
      this.questions = [];
      this.afterQuestionsHydratedFromQids();
      this.schedulePersistCreatorStateToLocalStorage();
      return;
    }

    // 1) Prefer resolving from localStorage caches created by `/question` page (question_list responses),
    // so reload works even when per-qid endpoint is unavailable.
    const qidStrings = qids.map((x) => String(x));
    const need = new Set<string>(qidStrings);
    const cacheByQid = this.tryResolveQuestionsByQidFromLocalStorage(need);

    // 2) If anything is still missing and we have context (topic/chapter), fetch once from question_list,
    // then resolve remaining qids from that response and cache it in localStorage for next time.
    const ctx = this.context as any;
    const level_tr = String(ctx?.level_tr ?? '').trim();
    const class_level = String(ctx?.class_level ?? '').trim();
    const subject_tr = String(ctx?.subject_tr ?? '').trim();
    const topic = String(ctx?.topic ?? '').trim();
    const chapter = String(ctx?.chapter ?? '').trim();

    this.questionQidsHydrationInFlight = true;

    const finishWith = (byQid: Map<string, any>) => {
      this.questionQidsHydrationSub = undefined;
      this.questionQidsHydrationInFlight = false;
      this.questions = qidStrings.map((id) => {
        const row = byQid.get(id);
        if (row != null && typeof row === 'object') return row as any;
        return { qid: id, question: `— (${id})`, type: 'বহুনির্বাচনি প্রশ্ন' } as any;
      });
      this.afterQuestionsHydratedFromQids();
      this.schedulePersistCreatorStateToLocalStorage();
    };

    if (need.size === 0) {
      finishWith(cacheByQid);
      return;
    }

    // Only do the topic fetch if we have enough context to match the same calls as `/question`.
    if (level_tr && class_level && subject_tr && topic) {
      const cacheKey = this.creatorTopicCacheKey(level_tr, class_level, subject_tr, chapter, topic);
      // Try cached topic response first (fast path).
      const topicCached = this.tryReadCreatorTopicCache(cacheKey);
      if (topicCached?.length) {
        for (const q of topicCached) {
          const id = q?.qid != null ? String(q.qid) : '';
          if (!id || !need.has(id)) continue;
          cacheByQid.set(id, q);
          need.delete(id);
        }
        if (need.size === 0) {
          finishWith(cacheByQid);
          return;
        }
      }

      this.questionQidsHydrationSub = this.apiService
        .getQuestionListByTopic({ level_tr, class_level, subject_tr, topic, ...(chapter ? { chapter } : {}) })
        .pipe(
          take(1),
          map((res) => (Array.isArray(res?.questions) ? res.questions : [])),
          catchError(() => of([] as any[]))
        )
        .subscribe((list) => {
          // Cache full response for next reload.
          this.writeCreatorTopicCache(cacheKey, list);
          for (const q of list) {
            const id = q?.qid != null ? String(q.qid) : '';
            if (!id || !need.has(id)) continue;
            cacheByQid.set(id, q);
            need.delete(id);
            if (need.size === 0) break;
          }
          finishWith(cacheByQid);
        });
      return;
    }

    // 3) Last resort: if logged in, try per-qid fetch for remaining ones (only for numeric qids).
    const token = this.apiService.getToken();
    if (token) {
      const idsToFetch = Array.from(need);
      const requests = idsToFetch.map((id) => {
        const isNumeric = /^\d+$/.test(id);
        if (!isNumeric) return of(null);
        return this.apiService.getQuestionById(id).pipe(catchError(() => of(null)));
      });
      this.questionQidsHydrationSub = forkJoin(requests).subscribe((results) => {
        for (let i = 0; i < idsToFetch.length; i++) {
          const id = idsToFetch[i]!;
          const row = results[i];
          if (row != null && typeof row === 'object') {
            cacheByQid.set(id, row);
          }
        }
        finishWith(cacheByQid);
      });
      return;
    }

    finishWith(cacheByQid);
  }

  /** Build a stable cache key for a creator topic query. */
  private creatorTopicCacheKey(
    level_tr: string,
    class_level: string,
    subject_tr: string,
    chapter: string,
    topic: string
  ): string {
    return `cheradip_creator_topic_cache_${encodeURIComponent(level_tr)}_${encodeURIComponent(class_level)}_${encodeURIComponent(
      subject_tr
    )}_${encodeURIComponent(chapter || '_')}_${encodeURIComponent(topic)}`;
  }

  private tryReadCreatorTopicCache(cacheKey: string): any[] | null {
    try {
      const raw = localStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeCreatorTopicCache(cacheKey: string, list: any[]): void {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(Array.isArray(list) ? list : []));
    } catch {
      // ignore quota
    }
  }

  /**
   * Resolve as many qids as possible from localStorage caches populated by `/question` page.
   * Mutates `need` (removes found qids). Returns map for found qids.
   */
  private tryResolveQuestionsByQidFromLocalStorage(need: Set<string>): Map<string, any> {
    const out = new Map<string, any>();
    if (!need.size) return out;
    const ctx = this.context as any;
    const level_tr = String(ctx?.level_tr ?? '').trim();
    const class_level = String(ctx?.class_level ?? '').trim();
    const subject_tr = String(ctx?.subject_tr ?? '').trim();
    if (!level_tr || !class_level || !subject_tr) return out;

    const keyBase = `cheradip_subject_all_${level_tr}_${class_level}_${subject_tr}`;
    try {
      const listMetaStr = localStorage.getItem(`${keyBase}_list_meta`);
      const listMeta = listMetaStr ? JSON.parse(listMetaStr) : null;
      if (listMeta && typeof listMeta.total === 'number' && listMeta.total >= 0) {
        const chunkCount = listMeta.chunkCount ?? Math.ceil(listMeta.total / 500);
        for (let i = 0; i < chunkCount && need.size > 0; i++) {
          const str = localStorage.getItem(`${keyBase}_list_chunk_${i}`);
          const chunk = str ? JSON.parse(str) : null;
          if (!Array.isArray(chunk)) continue;
          for (const q of chunk) {
            const id = q?.qid != null ? String(q.qid) : '';
            if (!id || !need.has(id)) continue;
            out.set(id, q);
            need.delete(id);
            if (!need.size) break;
          }
        }
        return out;
      }

      // Older by-chapter format fallback.
      const metaStr = localStorage.getItem(`${keyBase}_meta`);
      const meta = metaStr ? JSON.parse(metaStr) : null;
      const chapterIds = Array.isArray(meta?.chapterIds) ? (meta.chapterIds as unknown[]) : [];
      for (const chId of chapterIds) {
        if (!need.size) break;
        const chStr = localStorage.getItem(`${keyBase}_ch_${String(chId)}`);
        const chData = chStr ? JSON.parse(chStr) : null;
        const topics = chData?.topics;
        if (!topics || typeof topics !== 'object') continue;
        for (const arr of Object.values(topics) as any[]) {
          if (!need.size) break;
          if (!Array.isArray(arr)) continue;
          for (const q of arr) {
            const id = q?.qid != null ? String(q.qid) : '';
            if (!id || !need.has(id)) continue;
            out.set(id, q);
            need.delete(id);
            if (!need.size) break;
          }
        }
      }
    } catch (_) {
      // ignore parse errors
    }
    return out;
  }

  private afterQuestionsHydratedFromQids(): void {
    if (!this.headerUseLegacyQuestionHeader) {
      if (
        this.questions.length > 0 &&
        !this.selectionHasBothHeaderTypes() &&
        this.paperSubjectMetaLinesEligible()
      ) {
        this.normalizeStructuredHeaderForSingleQuestionTypeSelection();
      } else {
        this.ensureMcqTextareaSixUpperLines();
        this.runHeaderTextareaSyncs();
      }
    }
    this.syncHeaderFontSizesToLineCount();
    this.scheduleLayout();
    queueMicrotask(() => this.updatePreviewFitScale());
    this.cdr.markForCheck();
  }

  /** True if JSON looks like a saved creator draft (layout and/or questions). */
  private isRestorableCreatorPayload(parsed: unknown): parsed is Record<string, unknown> {
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }
    const o = parsed as Record<string, unknown>;
    const vn = this.getPersistPayloadVersion(o);
    if (vn >= QUESTION_CREATOR_PAYLOAD_VERSION) return true;
    if (vn === 1) return true;
    if (Array.isArray(o['questions'])) return true;
    if (Array.isArray(o['questionQids'])) return true;
    return false;
  }

  private mergeLayoutFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(QUESTION_CREATOR_LOCAL_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      this.applyLayoutAndHeaderFromParsed(parsed);
    } catch (_) {}
  }

  /** Keep /question Type filter checkboxes aligned when user returns from creator (same key as question.component). */
  private syncQuestionListFilterTypesFromNavigation(types: string[] | undefined): void {
    if (!types?.length) return;
    const key = 'cheradip_question_filter_state';
    try {
      const raw = localStorage.getItem(key);
      const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const base = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      localStorage.setItem(key, JSON.stringify({ ...base, types: types.slice() }));
    } catch (_) {}
  }

  /** Subject from /question flow: English uses Latin exam labels. */
  isEnglishSubject(): boolean {
    const s = (this.context.subject_tr || '').toLowerCase();
    const raw = this.context.subject_tr || '';
    return (
      s.includes('english') ||
      raw.includes('ইংরেজ') ||
      raw.includes('ইংরেজি') ||
      raw.includes('ইংরেজী')
    );
  }

  get examTypeOptions(): ExamTypeOption[] {
    return this.isEnglishSubject()
      ? QuestionCreatorComponent.EXAM_TYPES_EN
      : QuestionCreatorComponent.EXAM_TYPES_BN;
  }

  private currentExamTypeUsesCounter(): boolean {
    const opt = this.examTypeOptions.find((o) => o.key === this.headerExamTypeKey);
    return !!opt?.counter;
  }

  private getExamSerialMap(): Record<string, number> {
    try {
      const raw = localStorage.getItem(QUESTION_CREATOR_EXAM_SERIAL_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw) as unknown;
      return o != null && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private examSerialStorageKey(): string {
    const sub = (this.context.subject_tr || '_').trim() || '_';
    return `${sub}|${this.headerExamTypeKey}`;
  }

  /** Next serial shown in header (01, 02, …) for counter exam types. */
  private getNextExamSerialDisplay(): number {
    const m = this.getExamSerialMap();
    return (m[this.examSerialStorageKey()] ?? 0) + 1;
  }

  /** Call after a successful save when counter-type exam is selected. */
  private commitExamSerialAfterSave(): void {
    if (!this.currentExamTypeUsesCounter()) return;
    const k = this.examSerialStorageKey();
    const m = this.getExamSerialMap();
    m[k] = (m[k] ?? 0) + 1;
    try {
      localStorage.setItem(QUESTION_CREATOR_EXAM_SERIAL_KEY, JSON.stringify(m));
    } catch (_) {}
    this.rebuildQuestionHeader();
  }

  /**
   * Short `name` for Created Questions API: `base_examLabel_suffix`.
   * Counter exams (last three): suffix = BN serial (`…_ক্লাস_টেস্ট_০১`).
   * Other exams: same layout with calendar year (ASCII or BN digits), no serial.
   */
  private buildCreatedQuestionSetName(): string {
    const base = this.defaultFileNameBase;
    const opt = this.examTypeOptions.find((o) => o.key === this.headerExamTypeKey);
    if (!opt) {
      return base.slice(0, 200);
    }
    if (opt.counter) {
      return this.buildCreatedQuestionSetNameFromSerial(this.getNextExamSerialDisplay());
    }
    const examPart = opt.label.replace(/\s+/g, '_');
    const cy = new Date().getFullYear();
    const y = String(Math.max(1900, Math.min(2100, cy)));
    const yearSuffix = this.isEnglishSubject() ? y : QuestionCreatorComponent.toBengaliDigits(y);
    const out = `${base}_${examPart}_${yearSuffix}`;
    return out.length > 200 ? out.slice(0, 200) : out;
  }

  /** Counter exams only: `base_examLabel_BNSerial` for a given 1-based serial (collision probing). */
  private buildCreatedQuestionSetNameFromSerial(serialOneBased: number): string {
    const base = this.defaultFileNameBase;
    const opt = this.examTypeOptions.find((o) => o.key === this.headerExamTypeKey);
    if (!opt || !opt.counter) {
      return this.buildCreatedQuestionSetName();
    }
    const examPart = opt.label.replace(/\s+/g, '_');
    const pad = String(Math.max(1, Math.min(999, Math.floor(serialOneBased)))).padStart(2, '0');
    const bn = QuestionCreatorComponent.toBengaliDigits(pad);
    const out = `${base}_${examPart}_${bn}`;
    return out.length > 200 ? out.slice(0, 200) : out;
  }

  /**
   * Stem for PDF/DOCX downloads, `exportQuestions` `filename`, and Created Questions `name`
   * (subject/chapter/topic + exam label + year or BN serial).
   */
  get exportFileNameBase(): string {
    return this.buildCreatedQuestionSetName();
  }

  /** Same as {@link exportFileNameBase} — persisted set name on create. */
  get createdQuestionSetName(): string {
    return this.exportFileNameBase;
  }

  /**
   * When a counter exam (last three options) is selected, bump stored serial if the short saved name
   * already exists on the server so header + create payload stay in sync.
   */
  private async bumpExamSerialToAvoidDuplicateCreatedSetName(): Promise<void> {
    if (!this.currentExamTypeUsesCounter() || !this.apiService.isLoggedIn()) {
      return;
    }
    try {
      const sets = await firstValueFrom(this.apiService.getCreatedQuestionSets().pipe(take(1)));
      const names = new Set((sets ?? []).map((s) => (s.name ?? '').trim()).filter((n) => n.length > 0));
      const k = this.examSerialStorageKey();
      const m = this.getExamSerialMap();
      const committed = m[k] ?? 0;
      let next = committed + 1;
      while (next < 500 && names.has(this.buildCreatedQuestionSetNameFromSerial(next))) {
        next++;
      }
      if (next !== committed + 1) {
        m[k] = next - 1;
        try {
          localStorage.setItem(QUESTION_CREATOR_EXAM_SERIAL_KEY, JSON.stringify(m));
        } catch (_) {
          /* private mode */
        }
        this.rebuildQuestionHeader();
        this.cdr.markForCheck();
      }
    } catch {
      /* offline / list failure — keep current serial */
    }
  }

  /** Exam dropdown: bump serial on collision, then same header + preview refresh as {@link onHeaderMetaChange}. */
  async onHeaderExamTypeChange(_newKey: string): Promise<void> {
    await this.bumpExamSerialToAvoidDuplicateCreatedSetName();
    this.onHeaderMetaChange();
  }

  /**
   * MCQ-only or creative-only: clear stale mixed header from localStorage, then same rebuild + sync chain
   * as manual Reset Setting (without wiping layout columns/margins).
   */
  private normalizeStructuredHeaderForSingleQuestionTypeSelection(): void {
    if (!this.paperSubjectMetaLinesEligible() || this.headerUseLegacyQuestionHeader) {
      return;
    }
    if (this.selectionHasBothHeaderTypes()) {
      return;
    }
    if (this.questions.length === 0) {
      return;
    }
    const prevLines = this.getHeaderEditorLinesRaw();
    /** Mixed + sq layout: 8th line = index 7, 9th line = index 8 (see MIXED_HEADER_UNIFIED_SQ_NOTICE_LINES). */
    let mixedSqCreativeNotice = '';
    let mixedSqMcqNotice = '';
    if (prevLines.length >= QuestionCreatorComponent.MIXED_HEADER_UNIFIED_SQ_NOTICE_LINES) {
      mixedSqCreativeNotice = (prevLines[7] ?? '').trimEnd();
      mixedSqMcqNotice = (prevLines[8] ?? '').trimEnd();
    }
    this.questionHeader = '';
    this.rebuildQuestionHeader();
    this.onPreviewLayoutChange({ suppressAutoFit: false });
    if (!mixedSqCreativeNotice && !mixedSqMcqNotice) {
      return;
    }
    const merged = this.getHeaderEditorLinesRaw().slice();
    let changed = false;
    if (this.selectionHasCreativeType() && !this.selectionHasMcqType() && mixedSqCreativeNotice) {
      while (merged.length <= 6) {
        merged.push('');
      }
      merged[6] = mixedSqCreativeNotice;
      changed = true;
    }
    if (this.selectionHasMcqType() && !this.selectionHasCreativeType() && mixedSqMcqNotice) {
      while (merged.length <= 7) {
        merged.push('');
      }
      merged[7] = mixedSqMcqNotice;
      changed = true;
    }
    if (!changed) {
      return;
    }
    this.questionHeader = merged.join('\n');
    this.onPreviewLayoutChange({ suppressAutoFit: false });
  }

  /**
   * Line 1: instituteNameBn, districtNameBn — Line 2: exam label − year or zero-padded serial.
   * Keeps textarea lines from index 2 onward (MCQ title / subject / extras) when user edits them.
   */
  rebuildQuestionHeader(): void {
    if (this.headerUseLegacyQuestionHeader) {
      return;
    }
    const newTop: string[] = [];
    const inst = this.headerInstitute;
    if (inst?.instituteNameBn && inst?.districtNameBn) {
      newTop.push(`${inst.instituteNameBn}, ${inst.districtNameBn}`);
    } else if (inst?.instituteNameBn) {
      newTop.push(inst.instituteNameBn);
    }
    const opt = this.examTypeOptions.find((o) => o.key === this.headerExamTypeKey);
    const label = opt?.label ?? '';
    const en = this.isEnglishSubject();
    let suffix = '';
    if (opt?.counter) {
      const n = this.getNextExamSerialDisplay();
      const padded = String(n).padStart(2, '0');
      suffix = en ? padded : QuestionCreatorComponent.toBengaliDigits(padded);
    } else {
      const cy = new Date().getFullYear();
      const y = String(Math.max(1900, Math.min(2100, cy)));
      suffix = en ? y : QuestionCreatorComponent.toBengaliDigits(y);
    }
    if (label) {
      // Put subject code in the exam line itself (textarea).
      // Preserve any user-edited bracket content if it exists.
      const existing = this.headerPreviewLines;
      const prevExam = (existing?.[1] ?? '').trimEnd();
      const bracket = prevExam.match(/\[[^\]]*\]/)?.[0] ?? '';
      const base = `${label} - ${suffix}`;
      newTop.push(bracket ? `${base} ${bracket}` : this.examLineWithBracketedSubjectCode(base));
    }
    const newHead = newTop.join('\n');
    const existing = this.headerPreviewLines;
    const tail = existing.slice(2);
    this.questionHeader = tail.length ? `${newHead}\n${tail.join('\n')}` : newHead;
    /** After EIIN/exam lines exist, pad MCQ-only header to six editable rows (also fixes load paths that never hit onPreviewLayoutChange). */
    this.ensureMcqTextareaSixUpperLines();
    this.headerManualEditSinceRebuild = false;
    this.runHeaderTextareaSyncs();
    this.syncHeaderFontSizesToLineCount();
    this.scheduleLayout();
    this.cdr.markForCheck();
  }

  /** True when Exam name is one of the first three options (auto-fit runs on change). */
  private examTypeKeyIsFirstThreeExamOptions(key: string): boolean {
    return (QuestionCreatorComponent.EXAM_TYPE_KEYS_FIRST_THREE as readonly string[]).includes(key);
  }

  /**
   * After restore / init: align {@link previewAutoFitSuppressNextLayoutRun} with whether this exam ever runs auto-fit.
   * Non–first-three: set `true` so the next layout does not mutate (same as permanent `suppressAutoFit` in {@link runLayout}).
   * First-three: set `false` so the first pass after load may auto-fit unless a later `onPreviewLayoutChange` suppresses.
   */
  private syncPreviewAutoFitSuppressWithExamType(): void {
    this.previewAutoFitSuppressNextLayoutRun = !this.examTypeKeyIsFirstThreeExamOptions(this.headerExamTypeKey);
  }

  onHeaderMetaChange(): void {
    this.headerUseLegacyQuestionHeader = false;
    this.rebuildQuestionHeader();
    const runAutoFit = this.examTypeKeyIsFirstThreeExamOptions(this.headerExamTypeKey);
    // First-three exam: allow auto-fit on next layout; other exams: suppress (header text changed but policy unchanged).
    this.onPreviewLayoutChange({ suppressAutoFit: !runAutoFit });
  }

  /**
   * Lines shown in the sheet header: split on newline (`\n` / `\r\n`).
   * One row per segment (including blank lines). Typography: line 1 = 1st stepper,
   * line 2 = 2nd stepper, lines 3–5 = 1em (body), line 6+ = 12px.
   */
  get headerPreviewLines(): string[] {
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    if (raw === '') return [];
    return raw.split('\n').map((s) => s.trimEnd());
  }

  /** Structured mode: lines 3–4 (subject / code row) when we have subject + questions. */
  paperSubjectMetaLinesEligible(): boolean {
    return (
      !this.headerUseLegacyQuestionHeader &&
      !!(this.context.subject_tr || '').trim() &&
      this.questions.length > 0
    );
  }

  private normalizeQuestionType(q: { type?: unknown }): string {
    return (q?.type ?? '').toString().trim();
  }

  questionIsCreativeType(q: { type?: unknown }): boolean {
    const t = this.normalizeQuestionType(q);
    return !!t && (t === 'সৃজনশীল' || t.includes('সৃজনশীল'));
  }

  questionIsMcqType(q: { type?: unknown }): boolean {
    const t = this.normalizeQuestionType(q);
    return !!t && (t === 'বহুনির্বাচনি' || t.includes('বহুনির্বাচনি'));
  }

  selectionHasCreativeType(): boolean {
    return this.questions.some((q) => this.questionIsCreativeType(q));
  }

  selectionHasMcqType(): boolean {
    return this.questions.some((q) => this.questionIsMcqType(q));
  }

  selectionHasBothHeaderTypes(): boolean {
    return this.selectionHasCreativeType() && this.selectionHasMcqType();
  }

  /**
   * Mixed CQ + MCQ on separate sheet pages: unified 7-line textarea drives both headers
   * ({@link QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES}).
   */
  private mixedHeaderUsesExpandedEditorLines(): boolean {
    return (
      !this.headerUseLegacyQuestionHeader &&
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasBothHeaderTypes() &&
      !this.mixedTypesSinglePageMergedHeader
    );
  }

  /** True when mixed header uses one plain line for both CQ and MCQ code grids (line index 6). */
  mixedBothTypesUseUnifiedCodeGridLine(): boolean {
    return this.mixedHeaderUsesExpandedEditorLines();
  }

  /** Plain বিষয় কোড row (textarea index 6) shown inside both code areas when mixed. */
  mixedUnifiedCodeGridPlainLine(): string {
    return this.headerPreviewLines[6] ?? '';
  }

  /** Mixed + sq 25/30: show দ্রষ্টব্য lines 8–9 in textarea (indices 7–8). */
  mixedSqNoticeLinesEligible(): boolean {
    return this.mixedHeaderUsesExpandedEditorLines() && this.subjectSqExamVariant() !== null;
  }

  /**
   * সৃজনশীল-only + sq 25/30: CQ দ্রষ্টব্য at textarea index 6 (7th sidebar row — same copy as mixed 8th line;
   * no blank spacer line before it).
   */
  private creativeOnlySqNoticeRowsEligible(): boolean {
    return (
      !this.headerUseLegacyQuestionHeader &&
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasCreativeType() &&
      !this.selectionHasMcqType() &&
      this.subjectSqExamVariant() !== null
    );
  }

  /**
   * MCQ-only + sq 25/30: MCQ দ্রষ্টব্য at index 7 (8th sidebar row — same copy as mixed 9th line; no blank row before it).
   */
  private mcqOnlySqNoticeRowsEligible(): boolean {
    return (
      !this.headerUseLegacyQuestionHeader &&
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasMcqType() &&
      !this.selectionHasCreativeType() &&
      this.subjectSqExamVariant() !== null
    );
  }

  /** Minimum textarea rows for unified mixed header (7, or 9 when sq 25/30 notices apply). */
  private mixedUnifiedHeaderTextareaMinLines(): number {
    if (!this.mixedHeaderUsesExpandedEditorLines()) {
      return QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES;
    }
    return this.mixedSqNoticeLinesEligible()
      ? QuestionCreatorComponent.MIXED_HEADER_UNIFIED_SQ_NOTICE_LINES
      : QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES;
  }

  private mixedSqNoticeCreativeLineBn(): string {
    const v = this.subjectSqExamVariant();
    if (v === 25) {
      return QuestionCreatorComponent.MIXED_SQ_NOTICE_CREATIVE_SQ25;
    }
    if (v === 30) {
      return QuestionCreatorComponent.MIXED_SQ_NOTICE_CREATIVE_SQ30;
    }
    return '';
  }

  private mixedSqNoticeMcqLineBn(): string {
    return this.subjectSqExamVariant() != null
      ? QuestionCreatorComponent.MIXED_SQ_NOTICE_MCQ
      : '';
  }

  /** Creative row 3 (1-based): subject + (সৃজনশীল) from plain textarea line 2. */
  mixedUnifiedCreativeSubjectPreviewLine(plainSubject: string | undefined | null): string {
    const t = (plainSubject ?? '').trimEnd();
    if (!t) {
      return '(সৃজনশীল)';
    }
    if (/\(সৃজনশীল\)\s*$/.test(t)) {
      return t;
    }
    return `${t} (সৃজনশীল)`;
  }

  private mixedHeaderEditorLooksUnifiedSix(lines: string[]): boolean {
    if (lines.length < QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES) {
      return false;
    }
    if (lines.length >= 9 && this.parseMcqSqCombinedDisplayParts(lines[4] ?? '') != null) {
      return false;
    }
    return true;
  }

  /** Legacy 6-line mixed saves: insert dedicated সৃজনশীল meta row at index 4. */
  private migrateMixedHeaderUnifiedSixToSeven(lines: string[]): string[] {
    const L = lines.map((s) => s.trimEnd());
    const cre = this.examSqMetaCombinedLineCreative();
    return [
      L[0] ?? '',
      L[1] ?? '',
      L[2] ?? '',
      L[3] ?? '',
      cre,
      L[4] ?? '',
      L[5] ?? '',
      ...L.slice(6),
    ];
  }

  private mixedHeaderEditorNeedsNineLineToSixMigration(lines: string[]): boolean {
    if (lines.length < 9) {
      return false;
    }
    if (this.parseMcqSqCombinedDisplayParts(lines[4] ?? '') == null) {
      return false;
    }
    /**
     * Already unified mixed + sq: code at index 6, CQ/MCQ দ্রষ্টব্য at 7–8 — do not run legacy migrate
     * (it used old[7] as code and would replace code with CQ notice or drop rows).
     */
    if (this.headerLineLooksLikeUnifiedMixedCodeRow(lines[6] ?? '')) {
      return false;
    }
    return true;
  }

  private mixedHeaderEditorNeedsLegacyMigration(lines: string[]): boolean {
    if (lines.length < 2) {
      return false;
    }
    /** Only institute + exam from rebuild: let syncMcqSqMetaMixed / syncCreativeSubjectLabel fill rows 2–6. */
    if (lines.length <= 2) {
      return false;
    }
    if (this.mixedHeaderEditorNeedsNineLineToSixMigration(lines)) {
      return false;
    }
    if (lines.length < QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES) {
      return true;
    }
    const c = this.examSqMetaCombinedLineMcq().trim();
    const L2 = (lines[2] ?? '').trim();
    if (c && (this.parseMcqSqCombinedDisplayParts(lines[2]) != null || L2 === c)) {
      return true;
    }
    return false;
  }

  private migrateMixedHeaderNineLinesToSix(lines: string[]): string[] {
    const old = lines.map((s) => s.trimEnd());
    const codeAt6 = this.headerLineLooksLikeUnifiedMixedCodeRow(old[6] ?? '');
    const mcqMeta =
      (old[3] ?? '').trim() || (old[4] ?? '').trim() || this.examSqMetaCombinedLineMcq() || '';
    const creMeta = codeAt6
      ? (old[4] ?? '').trim() || this.examSqMetaCombinedLineCreative()
      : this.examSqMetaCombinedLineCreative();
    const hr = codeAt6
      ? (old[5] ?? '').trim() ||
        QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR
      : (old[6] ?? '').trim() ||
        (old[5] ?? '').trim() ||
        QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    const code = codeAt6 ? (old[6] ?? '').trim() : (old[7] ?? '').trim();
    const tail = codeAt6 ? old.slice(7) : old.slice(8);
    const out = [
      old[0] ?? '',
      old[1] ?? '',
      old[2] ?? '',
      mcqMeta,
      creMeta,
      hr,
      code,
      ...tail,
    ];
    while (out.length < QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES) {
      out.push('');
    }
    return out;
  }

  /** True when plain subject row (index 2) wrongly holds MCQ সময়+পূর্ণমান (common after bad migrate / persist). */
  private mixedExpandedLine2IsMcqMeta(lines: string[]): boolean {
    const cMcq = this.examSqMetaCombinedLineMcq().trim();
    if (!cMcq || lines.length < 3) {
      return false;
    }
    const t = (lines[2] ?? '').trim();
    if (!t) {
      return false;
    }
    return t === cMcq || this.parseMcqSqCombinedDisplayParts(lines[2] ?? '') != null;
  }

  /** Rebuild 7 core mixed lines: inst, exam, '' (subject), MCQ meta, CQ meta, hr, code. */
  private normalizeMixedExpandedSevenLineHeader(lines: string[]): string[] {
    const L = lines.map((s) => s.trimEnd());
    const mcq = this.examSqMetaCombinedLineMcq().trim() || (L[3] ?? '').trim() || (L[2] ?? '').trim();
    const cre = this.examSqMetaCombinedLineCreative().trim() || (L[4] ?? '').trim();
    const hrCand = (L[5] ?? '').trim();
    const hr =
      hrCand.toLowerCase().includes('<hr>')
        ? hrCand
        : QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    const code = (L[6] ?? '').trim();
    return [L[0] ?? '', L[1] ?? '', '', mcq, cre, hr, code];
  }

  /**
   * When the MCQ সময়+পূর্ণমান row was dropped, Creative meta sits at index 3 and `<hr>` at 4
   * (বিষয় কোড shifts to index 5). {@link syncMcqSqMetaMixedTextarea} only seeds MCQ when [3] is empty,
   * so it never fixes this — insert canonical MCQ at index 3 and shift the block down.
   */
  private mixedHeaderRepairShiftedCoreRowsMissingMcq(lines: string[]): boolean {
    if (!this.mixedHeaderUsesExpandedEditorLines()) {
      return false;
    }
    const mcqC = this.examSqMetaCombinedLineMcq().trim();
    const creC = this.examSqMetaCombinedLineCreative().trim();
    if (!mcqC || !creC) {
      return false;
    }
    if (lines.length < 5) {
      return false;
    }
    const t3 = (lines[3] ?? '').trim();
    const mcqAt3 =
      this.parseMcqSqCombinedDisplayParts(lines[3] ?? '') != null || t3 === mcqC;
    if (mcqAt3) {
      return false;
    }
    const creativeAt3 =
      this.parseCreativeSqCombinedDisplayParts(lines[3] ?? '') != null ||
      t3 === creC.trim() ||
      (this.parseMcqSqCombinedDisplayParts(lines[3] ?? '') == null &&
        this.lineLooksLikeCreativeSqMetaNotMcq(t3));
    if (!creativeAt3) {
      return false;
    }
    const t4 = (lines[4] ?? '').trim();
    const hrAt4 = t4.toLowerCase().includes('<hr>');
    const codeAt5 = this.headerLineLooksLikeUnifiedMixedCodeRow((lines[5] ?? '').trim());
    const codeAt6 = lines.length > 6 && this.headerLineLooksLikeUnifiedMixedCodeRow((lines[6] ?? '').trim());
    if (hrAt4 || (codeAt5 && !codeAt6)) {
      lines.splice(3, 0, mcqC);
      return true;
    }
    return false;
  }

  /**
   * Pad / migrate textarea to the unified mixed two-page layout (7 core lines + tail).
   */
  private ensureMixedExpandedHeaderEditorLines(): void {
    if (!this.mixedHeaderUsesExpandedEditorLines()) {
      return;
    }
    if (this.headerManualEditSinceRebuild) {
      return;
    }
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    if (raw.trim() === '') {
      return;
    }
    let lines = raw.split('\n').map((s) => s.trimEnd());
    if (this.mixedHeaderRepairShiftedCoreRowsMissingMcq(lines)) {
      this.questionHeader = lines.join('\n');
      const again = (this.questionHeader || '').replace(/\r\n/g, '\n');
      lines = again.split('\n').map((s) => s.trimEnd());
    }
    if (this.mixedHeaderEditorNeedsNineLineToSixMigration(lines)) {
      lines = this.migrateMixedHeaderNineLinesToSix(lines);
      this.questionHeader = lines.join('\n');
      return;
    }
    if (lines.length === 6 && !this.mixedHeaderEditorNeedsNineLineToSixMigration(lines)) {
      lines = this.migrateMixedHeaderUnifiedSixToSeven(lines);
      this.questionHeader = lines.join('\n');
      return;
    }
    if (this.mixedExpandedLine2IsMcqMeta(lines)) {
      this.questionHeader = this.normalizeMixedExpandedSevenLineHeader(lines).join('\n');
      return;
    }
    if (this.mixedHeaderEditorLooksUnifiedSix(lines)) {
      const min = this.mixedUnifiedHeaderTextareaMinLines();
      while (lines.length < min) {
        lines.push('');
      }
      const padded = lines.join('\n');
      if (padded !== raw) {
        this.questionHeader = padded;
      }
      return;
    }
    if (!this.mixedHeaderEditorNeedsLegacyMigration(lines)) {
      return;
    }
    const top = lines.slice(0, 2);
    const old2 = lines[2] ?? '';
    const old3 = lines[3] ?? '';
    const tailOld = lines.slice(4);
    const cMcq = this.examSqMetaCombinedLineMcq().trim();
    let mcqCombined = old2.trim();
    if (
      cMcq &&
      this.parseMcqSqCombinedDisplayParts(old2) == null &&
      mcqCombined !== cMcq
    ) {
      mcqCombined = cMcq || mcqCombined;
    }
    let lineAfter = (old3 ?? '').trim();
    const marks = this.examFullMarksLineMcq();
    const legacyMarks = ['পূর্ণমান-- ৩০', 'পূর্ণমান-- ২৫', 'পূর্ণমান -- ৩০', 'পূর্ণমান -- ২৫'];
    if (marks && (lineAfter === marks || legacyMarks.includes(lineAfter))) {
      lineAfter = '';
    }
    const hr =
      (tailOld[0] ?? '').trim() || QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    const restTail = tailOld.slice(1);
    const newLines = [
      ...top,
      '',
      mcqCombined,
      this.examSqMetaCombinedLineCreative(),
      hr,
      '',
      ...restTail,
    ];
    while (newLines.length < QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES) {
      newLines.push('');
    }
    const proposed = newLines.join('\n');
    if (proposed !== raw) {
      this.questionHeader = proposed;
    }
  }

  /** Pure MCQ set: six upper header rows all come from the sidebar textarea (editable + per-line font size). */
  private mcqOnlyUsesSixLineTextareaBlock(): boolean {
    return (
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasMcqType() &&
      !this.selectionHasBothHeaderTypes()
    );
  }

  /**
   * Six sheet header rows from textarea + line 7 = one plain-text copy of the code grid (editable + font size).
   */
  private ensureMcqTextareaSixUpperLines(): void {
    if (this.headerUseLegacyQuestionHeader || !this.mcqOnlyUsesSixLineTextareaBlock()) {
      return;
    }
    if (this.headerManualEditSinceRebuild) {
      return;
    }
    let lines = this.headerPreviewLines;
    /**
     * `rebuildQuestionHeader` may produce 0–1 lines when institute / exam labels are not ready yet.
     * Previously we bailed here, so the MCQ template (title, subject, সময়/HR, code row) never appeared
     * until Reset (which reloads and rehydrates metadata). Pad to two rows so indices 2–5 can be filled.
     */
    if (lines.length < 2) {
      const padded = lines.slice();
      while (padded.length < 2) {
        padded.push('');
      }
      this.questionHeader = padded.join('\n');
      lines = this.headerPreviewLines;
    }
    const title = 'বহুনির্বাচনি অভীক্ষা';
    const subj = this.creatorSubjectLabel || '';
    if (lines.length < 6) {
      if (lines.length === 2) {
        this.questionHeader = [...lines, title, subj, '', ''].join('\n');
      } else if (lines.length === 4) {
        this.questionHeader = [lines[0], lines[1], title, subj, lines[2], lines[3]].join('\n');
      } else {
        const out = lines.slice();
        while (out.length < 6) {
          out.push('');
        }
        this.questionHeader = out.join('\n');
      }
      lines = this.headerPreviewLines;
    }
    // Do not append a separate "বিষয় কোড" text line in the textarea; the exam line already contains it in brackets.
  }

  /**
   * Seed plain বিষয় কোড row when empty: MCQ-only / mixed unified at index 6 (7th line);
   * সৃজনশীল-only at index 5 (6th line).
   */
  private syncMcqCodePlainLineInTextarea(): void {
    // Intentionally disabled: we no longer keep a separate "বিষয় কোড" text row in the textarea.
  }

  /** MCQ-only: one textarea line (index 4) = সময় + পূর্ণমান separated by spaces; sheet shows two rows. */
  private syncMcqSqMetaLineInTextarea(): void {
    if (this.headerUseLegacyQuestionHeader || !this.mcqOnlyUsesSixLineTextareaBlock()) {
      return;
    }
    const combined = this.examSqMetaCombinedLineMcq();
    if (!combined) {
      return;
    }
    const lines = this.headerPreviewLines;
    if (lines.length < 5) {
      return;
    }
    const next = lines.slice();
    next[4] = combined;
    const marks = this.examFullMarksLineMcq();
    const legacyMarks = ['পূর্ণমান-- ৩০', 'পূর্ণমান-- ২৫', 'পূর্ণমান -- ৩০', 'পূর্ণমান -- ২৫'];
    const t5 = (next[5] ?? '').trim();
    if (marks && (t5 === marks || legacyMarks.includes(t5))) {
      next[5] = QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    }
    const proposed = next.join('\n');
    if (proposed.replace(/\r\n/g, '\n') === (this.questionHeader || '').replace(/\r\n/g, '\n')) {
      return;
    }
    this.questionHeader = proposed;
  }

  /** Mixed: line 3 = MCQ সময়+পূর্ণমান, line 4 = সৃজনশীল — seed when empty. */
  private syncMcqSqMetaMixedTextarea(): void {
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return;
    }
    if (!this.selectionHasBothHeaderTypes() || !this.selectionHasMcqType()) {
      return;
    }
    if (this.mixedTypesSinglePageMergedHeader) {
      return;
    }
    const next = this.headerPreviewLines.slice();
    while (next.length < QuestionCreatorComponent.MIXED_HEADER_UNIFIED_MIN_LINES) {
      next.push('');
    }
    const mcqC = this.examSqMetaCombinedLineMcq();
    const creC = this.examSqMetaCombinedLineCreative();
    let changed = false;
    const t3 = (next[3] ?? '').trim();
    if (mcqC && this.shouldReseedSqMcqCombinedLine(t3)) {
      next[3] = mcqC;
      changed = true;
    }
    const t4 = (next[4] ?? '').trim();
    if (creC && this.shouldReseedSqCreativeCombinedLine(t4)) {
      next[4] = creC;
      changed = true;
    }
    if (!changed) {
      return;
    }
    const proposed = next.join('\n');
    if (proposed.replace(/\r\n/g, '\n') === (this.questionHeader || '').replace(/\r\n/g, '\n')) {
      return;
    }
    this.questionHeader = proposed;
  }

  /**
   * সৃজনশীল: line 3 (index 2) = subject label + (সৃজনশীল) (or merged-header plain name), same text as preview meta.
   * Skipped when mixed two-page layout (MCQ uses textarea lines 2–3).
   */
  private syncCreativeSubjectLabelLineInTextarea(): void {
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return;
    }
    if (!this.selectionHasCreativeType()) {
      return;
    }
    if (
      this.selectionHasBothHeaderTypes() &&
      !this.mixedTypesSinglePageMergedHeader &&
      !this.mixedHeaderUsesExpandedEditorLines()
    ) {
      return;
    }
    const next = this.headerPreviewLines.slice();
    while (next.length < 3) {
      next.push('');
    }
    const cur = (next[2] ?? '').trimEnd();
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      const plainName = (this.creatorSubjectLabel ?? '').trimEnd();
      if (!plainName) {
        return;
      }
      const withSuffix = this.mixedUnifiedCreativeSubjectPreviewLine(plainName);
      if (!this.creativeSubjectLineLooksAutoGenerated(cur, plainName, withSuffix)) {
        return;
      }
      if (cur === plainName) {
        return;
      }
      next[2] = plainName;
    } else {
      const canonical = (this.paperHeaderLine3Text(0) ?? '').trimEnd();
      if (!canonical) {
        return;
      }
      if (!this.creativeSubjectLineLooksAutoGenerated(cur, canonical, canonical)) {
        return;
      }
      if (cur === canonical) {
        return;
      }
      next[2] = canonical;
    }
    const proposed = next.join('\n');
    if (proposed.replace(/\r\n/g, '\n') === (this.questionHeader || '').replace(/\r\n/g, '\n')) {
      return;
    }
    this.questionHeader = proposed;
  }

  /**
   * True if line 2 may be replaced with plain subject name (`plain` / `withSuffix` from
   * {@link mixedUnifiedCreativeSubjectPreviewLine}).
   */
  private creativeSubjectLineLooksAutoGenerated(
    cur: string,
    plain: string,
    withSuffix: string
  ): boolean {
    const t = (cur ?? '').trimEnd();
    const p = (plain ?? '').trimEnd();
    const w = (withSuffix ?? '').trimEnd();
    if (t === '') {
      return true;
    }
    if (t === p || t === w) {
      return true;
    }
    return /\(সৃজনশীল\)\s*$/.test(t);
  }

  /**
   * সৃজনশীল-only: line 4 (index 3) = one combined textarea row.
   * Skipped when mixed — lines 2–3 are reserved for MCQ band on the other page.
   */
  private syncCreativeSqMetaLineInTextarea(): void {
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return;
    }
    if (!this.selectionHasCreativeType()) {
      return;
    }
    if (
      this.selectionHasBothHeaderTypes() &&
      !this.mixedTypesSinglePageMergedHeader &&
      !this.mixedHeaderUsesExpandedEditorLines()
    ) {
      return;
    }
    const next = this.headerPreviewLines.slice();
    while (next.length < 4) {
      next.push('');
    }
    const expandedMix = this.mixedHeaderUsesExpandedEditorLines();
    const combined = this.examSqMetaCombinedLineCreative();
    if (!combined) {
      return;
    }
    const idx = expandedMix ? 4 : 3;
    const cur = (next[idx] ?? '').trim();
    if (cur && !this.shouldReseedSqCreativeCombinedLine(cur)) {
      return;
    }
    if (expandedMix) {
      while (next.length < 5) {
        next.push('');
      }
      next[4] = combined;
    } else {
      next[3] = combined;
    }
    if (!expandedMix) {
      const marks = this.examFullMarksLineCreative();
      const t4 = (next[4] ?? '').trim();
      if (marks && t4 === marks) {
        next[4] = QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
      }
    }
    const proposed = next.join('\n');
    if (proposed.replace(/\r\n/g, '\n') === (this.questionHeader || '').replace(/\r\n/g, '\n')) {
      return;
    }
    this.questionHeader = proposed;
  }

  private runHeaderTextareaSyncs(): void {
    this.ensureMixedExpandedHeaderEditorLines();
    if (!this.headerManualEditSinceRebuild) {
      this.syncMcqSqMetaLineInTextarea();
      this.syncMcqSqMetaMixedTextarea();
      this.syncCreativeSubjectLabelLineInTextarea();
      this.syncCreativeSqMetaLineInTextarea();
      /** Legacy: if any defaults insert HR, do it only before manual edits. */
      this.applyDefaultStructuredHeaderHrLines();
      this.syncMixedSq25Sq30NoticeLines();
      this.syncSingleTypeSqDurstobyoLines();
      this.compactCreativeOnlyTrailingEmptyLines();
    }
    this.syncMcqCodePlainLineInTextarea();
  }

  /**
   * Unified mixed plain বিষয় কোড row (driven by Set + subject code grids); not shown in sidebar — same text is edited via the grids.
   */
  private headerLineIsUnifiedMixedPlainCodeRow(line: string): boolean {
    const t = (line ?? '').trim();
    if (!t) {
      return false;
    }
    return /^\s*বিষ[য়য]\s*কোড\s*[:ঃ]/u.test(t);
  }

  /**
   * True when `line` is the unified mixed plain বিষয় কোড row (index 6), not CQ দ্রষ্টব্য.
   */
  private headerLineLooksLikeUnifiedMixedCodeRow(line: string): boolean {
    const t = (line ?? '').trim();
    if (!t) {
      return false;
    }
    if (/বিষয়\s*কোড|বিষয়\s*কোড/.test(t)) {
      return true;
    }
    return this.parseBnDigitCharsFromCodePlainLine(t).length >= 3;
  }

  /**
   * If বিষয় কোড was pushed to index 7 (HR/blank at 6, or CQ notice wrongly at 6), move it to index 6
   * before writing sq notices — otherwise `lines[7] = cre` overwrites the code row.
   */
  private mixedHeaderShiftCodeBeforeSqNoticesIfNeeded(lines: string[]): boolean {
    if (lines.length < 8) {
      return false;
    }
    const s6 = (lines[6] ?? '').trim();
    const s7 = (lines[7] ?? '').trim();
    const codeAt6 = this.headerLineLooksLikeUnifiedMixedCodeRow(lines[6] ?? '');
    const codeAt7 = this.headerLineLooksLikeUnifiedMixedCodeRow(lines[7] ?? '');
    if (codeAt6 || !codeAt7) {
      return false;
    }
    const cre = this.mixedSqNoticeCreativeLineBn();
    const hrOnly = (t: string) => !t || t.toLowerCase().includes('<hr>');
    if (hrOnly(s6)) {
      lines[6] = lines[7]!;
      lines[7] = '';
      return true;
    }
    if (cre && s6 === cre.trim()) {
      lines[6] = lines[7]!;
      lines[7] = cre;
      return true;
    }
    return false;
  }

  /** Seeds textarea lines 8–9 (indices 7–8) for sq 25/30 mixed CQ+MCQ দ্রষ্টব্য copy. */
  private syncMixedSq25Sq30NoticeLines(): void {
    if (!this.mixedSqNoticeLinesEligible()) {
      return;
    }
    const cre = this.mixedSqNoticeCreativeLineBn();
    const mcq = this.mixedSqNoticeMcqLineBn();
    if (!cre || !mcq) {
      return;
    }
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n').map((s) => s.trimEnd());
    let changed = false;
    if (this.mixedHeaderShiftCodeBeforeSqNoticesIfNeeded(lines)) {
      changed = true;
    }
    const min = this.mixedUnifiedHeaderTextareaMinLines();
    while (lines.length < min) {
      lines.push('');
    }
    /** Wrong-slot CQ/MCQ notice at index 6: clear it (grids/exam bracket drive code — no stored plain বিষয় কোড row). */
    if (lines.length > 6) {
      const t6 = (lines[6] ?? '').trim();
      const t7 = (lines[7] ?? '').trim();
      const creT = cre.trim();
      const mcqT = mcq.trim();
      if (!this.headerLineLooksLikeUnifiedMixedCodeRow(lines[6] ?? '')) {
        if (t6 === creT || t6 === mcqT || (!t6 && t7 === creT)) {
          lines[6] = '';
          changed = true;
        }
      }
    }
    if (lines[7] !== cre) {
      lines[7] = cre;
      changed = true;
    }
    if (lines[8] !== mcq) {
      lines[8] = mcq;
      changed = true;
    }
    if (changed) {
      this.questionHeader = lines.join('\n');
    }
  }

  /**
   * সৃজনশীল-only or MCQ-only + sq 25/30: seed দ্রষ্টব্য copy (same strings as mixed lines 8–9).
   * CQ-only: pad to 7 lines, index 6 = CQ notice (no blank line between বিষয় কোড row and notice).
   * MCQ-only: pad to 8 lines, index 7 = MCQ notice (sidebar “Header line 8”) — no empty row before it;
   * legacy 9-line saves with notice at index 8 and empty index 7 are compacted.
   */
  private syncSingleTypeSqDurstobyoLines(): void {
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return;
    }
    const cre = this.mixedSqNoticeCreativeLineBn();
    const mcq = this.mixedSqNoticeMcqLineBn();
    if (!cre || !mcq) {
      return;
    }
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n').map((s) => s.trimEnd());
    let changed = false;
    if (this.creativeOnlySqNoticeRowsEligible()) {
      if (lines.length >= 8 && !(lines[6] ?? '').trim() && (lines[7] ?? '').trim()) {
        lines[6] = lines[7]!;
        lines.length = 7;
        changed = true;
      }
      while (lines.length < 7) {
        lines.push('');
        changed = true;
      }
      if (lines[6] !== cre) {
        lines[6] = cre;
        changed = true;
      }
      if (lines.length > 7) {
        const t7 = (lines[7] ?? '').trim();
        if (!t7 || t7 === cre) {
          lines.length = 7;
          changed = true;
        }
      }
    } else if (this.mcqOnlySqNoticeRowsEligible()) {
      if (lines.length >= 9 && !(lines[7] ?? '').trim() && (lines[8] ?? '').trim()) {
        lines[7] = lines[8]!;
        lines.length = 8;
        changed = true;
      }
      while (lines.length < 8) {
        lines.push('');
      }
      if (lines[7] !== mcq) {
        lines[7] = mcq;
        changed = true;
      }
    }
    if (changed) {
      this.questionHeader = lines.join('\n');
    }
  }

  /**
   * CQ-only without sq 25/30 দ্রষ্টব্য: drop trailing blank rows after the 6th line (বিষয় কোড).
   * Sq notice path is handled in {@link syncSingleTypeSqDurstobyoLines}.
   */
  private compactCreativeOnlyTrailingEmptyLines(): void {
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return;
    }
    if (!this.selectionHasCreativeType() || this.selectionHasMcqType()) {
      return;
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return;
    }
    if (this.creativeOnlySqNoticeRowsEligible()) {
      return;
    }
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n').map((s) => s.trimEnd());
    let changed = false;
    while (lines.length > 6 && !(lines[lines.length - 1] ?? '').trim()) {
      lines.pop();
      changed = true;
    }
    if (changed) {
      this.questionHeader = lines.join('\n');
    }
  }

  /**
   * When the MCQ-only 6th line (index 5) or সৃজনশীল-only 5th line (index 4) is blank, default to `<hr>`.
   */
  private applyDefaultStructuredHeaderHrLines(): void {
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return;
    }
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    if (raw === '') {
      return;
    }
    const lines = raw.split('\n').map((s) => s.trimEnd());
    let changed = false;

    if (this.mcqOnlyUsesSixLineTextareaBlock() && lines.length >= 7) {
      if (!(lines[5] ?? '').trim()) {
        lines[5] = QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
        changed = true;
      }
    }

    // Do not store <hr> for creative or mixed headers (it should not appear in the editor).
    // MCQ rendering still uses <hr> (in preview/export) as needed.

    if (!changed) {
      return;
    }
    const proposed = lines.join('\n');
    if (proposed === raw) {
      return;
    }
    this.questionHeader = proposed;
  }

  /**
   * Pick the subject row that matches `subject_tr`, preferring `class_level` when set
   * (API can return multiple rows per slug; `.find` alone may pick one with empty labels).
   */
  private pickSubjectRowFromApiList(
    subjects: Array<{
      subject_tr?: string;
      class_level?: string;
      subject_name?: string;
      name?: string;
      subject_code?: string;
      sq?: number;
    }>,
    subjectTr: string,
    classLevel?: string
  ): (typeof subjects)[number] | undefined {
    const tr = subjectTr.trim();
    const cl = (classLevel || '').trim();
    let list = subjects.filter((s) => (s.subject_tr || '').trim() === tr);
    if (!list.length) return undefined;
    if (cl) {
      const byClass = list.filter((s) => (s.class_level || '').trim() === cl);
      if (byClass.length) list = byClass;
    }
    const withLabel = list.find((s) => (s.subject_name || s.name || '').trim());
    return withLabel ?? list[0];
  }

  /** Shown in page chrome and creative header line 3 (API `name` / `subject_name` / slug). */
  get creatorSubjectLabel(): string {
    return (this.context.name || this.context.subject_name || this.context.subject_tr || '').trim();
  }

  /**
   * Fill name / subject_name / subject_code from question_subjects when missing or empty
   * (router state may omit them; DB is source of truth).
   */
  private hydrateSubjectMetaFromApiIfNeeded(): void {
    const tr = (this.context.subject_tr || '').trim();
    const level = (this.context.level_tr || '').trim();
    if (!tr || !level) {
      this.suppressHydrateHeaderRebuildOnce = false;
      return;
    }
    const params: { level_tr: string; class_level?: string; group?: string } = { level_tr: level };
    const cl = (this.context.class_level || '').trim();
    if (cl) params.class_level = cl;
    const gr = (this.context.group || '').trim();
    if (gr) params.group = gr;
    this.apiService
      .getQuestionSubjects(params)
      .pipe(take(1))
      .subscribe({
        next: (res) => {
          const match = this.pickSubjectRowFromApiList(res.subjects || [], tr, cl || undefined);
          if (!match) {
            this.suppressHydrateHeaderRebuildOnce = false;
            return;
          }
          const apiName = (match.name || '').trim();
          const apiSubjectName = (match.subject_name || '').trim();
          const displayName = (apiSubjectName || apiName).trim();
          const code = (match.subject_code || '').trim();
          if (displayName) {
            this.context.subject_name = displayName;
            this.context.name = (apiName || displayName).trim();
          }
          if (code) this.context.subject_code = code;
          const sqRaw = match.sq;
          const sqN = typeof sqRaw === 'number' ? sqRaw : parseInt(String(sqRaw ?? ''), 10);
          if (sqN === 25 || sqN === 30) {
            this.context.sq = sqN;
          }
          this.cdr.markForCheck();
          if (this.suppressHydrateHeaderRebuildOnce) {
            this.suppressHydrateHeaderRebuildOnce = false;
            /** Rebuild was skipped (trusted restore); sq/subject may have been missing on first sync — rerun header syncs. */
            if (!this.headerUseLegacyQuestionHeader) {
              this.onPreviewLayoutChange({ suppressAutoFit: false });
            }
          } else if (!this.headerUseLegacyQuestionHeader) {
            /**
             * `rebuildQuestionHeader` only prepends institute/exam and keeps `existing.slice(2)` — that
             * preserves wrong slots when the first build ran before sq / subject_name were set. For CQ-only
             * or MCQ-only, full clear + sync matches Reset and fixes textarea rows + font steps.
             */
            if (
              this.questions.length > 0 &&
              !this.selectionHasBothHeaderTypes() &&
              this.paperSubjectMetaLinesEligible()
            ) {
              this.normalizeStructuredHeaderForSingleQuestionTypeSelection();
            } else {
              this.rebuildQuestionHeader();
            }
          }
          this.scheduleLayout();
        },
        error: () => {
          this.suppressHydrateHeaderRebuildOnce = false;
        },
      });
  }

  /** Stable seed from set variant + MCQ identity (same selection → same order per set). */
  private mcqPermutationSeed(variantIndex: number, mcqInOrder: unknown[]): number {
    let h = ((variantIndex + 1) * 1_000_003) >>> 0;
    for (const q of mcqInOrder) {
      const o = q as { qid?: unknown };
      const id = typeof o?.qid === 'number' ? o.qid : parseInt(String(o?.qid ?? ''), 10);
      const part = Number.isFinite(id) ? id : String(o?.qid ?? '').length;
      h = (Math.imul(h, 31) + (part >>> 0)) >>> 0;
    }
    return h || 1;
  }

  private shuffleArrayDeterministic<T>(items: T[], seed: number): T[] {
    const a = items.slice();
    let s = seed >>> 0;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]!;
      a[i] = a[j]!;
      a[j] = t;
    }
    return a;
  }

  /**
   * In mixed mode, all সৃজনশীল questions are listed first; this is that count (and the 0-based index
   * where বহুনির্বাচনি starts in `previewQuestions`).
   */
  previewCreativeBlockQuestionCount(): number {
    if (!this.selectionHasCreativeType()) {
      return 0;
    }
    return this.previewQuestions.filter((q) => this.questionIsCreativeType(q)).length;
  }

  /** Sheet preview / pagination: canonical order until a set is chosen; then shuffled or frozen saved order. */
  get previewQuestions(): any[] {
    const base =
      !this.selectionHasMcqType() || this.selectedMcqSetLetter == null
        ? this.questions
        : this.buildQuestionsOrderedForMcqSet(this.selectedMcqSetLetter);
    if (!this.selectionHasBothHeaderTypes()) {
      return base;
    }
    const creative = base.filter((q) => this.questionIsCreativeType(q));
    const mcq = base.filter((q) => this.questionIsMcqType(q));
    const others = base.filter((q) => !this.questionIsCreativeType(q) && !this.questionIsMcqType(q));
    // Mixed mode order: সৃজনশীল first, then বহুনির্বাচনি.
    return [...creative, ...mcq, ...others];
  }

  /** Same display rules as the /question list (`QuestionComponent.getQuestionDisplayText`). */
  getQuestionDisplayText(q: { question?: unknown; type?: string }): string {
    const raw = q?.question != null ? String(q.question).trim() : '';
    if (!raw) return '';
    const prepared = formatMaybeCProgramQuestionText(raw);
    const type = (q?.type ?? '').toString().trim();
    if (type !== 'সৃজনশীল প্রশ্ন') return prepared;
    const withNewlines = prepared
      .replace(/([^\n])\s*(ক\.|খ\.|গ\.|ঘ\.)/g, '$1\n$2')
      .replace(/\n{2,}/g, '\n');
    const dottedToParen = withNewlines
      .replace(/ক\./g, '(ক)')
      .replace(/খ\./g, '(খ)')
      .replace(/গ\./g, '(গ)')
      .replace(/ঘ\./g, '(ঘ)');
    // DB/import often uses (ক)(খ)(গ)(ঘ) without Bengali dots; dotted rules above only match ক. etc.
    return dottedToParen
      .replace(/\s*(\(ক\)|\(খ\)|\(গ\)|\(ঘ\))/g, '\n$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  /**
   * Split CQ by (ক)→(খ)→(গ) or (ক)→(খ)→(গ)→(ঘ) in the display string (simple index order).
   * Marks use 3 vs 4 parts; no reliance on newlines alone.
   */
  private parseCreativeStructureFromParenMarkers(full: string): { intro: string; parts: string[] } | null {
    const pK = full.indexOf('(ক)');
    const pKh = full.indexOf('(খ)');
    const pG = full.indexOf('(গ)');
    const pGh = full.indexOf('(ঘ)');
    if (pK < 0 || pKh < 0 || pG < 0) return null;
    if (!(pK < pKh && pKh < pG)) return null;
    const intro = full.slice(0, pK).trim();
    if (pGh >= 0 && pGh > pG) {
      return {
        intro,
        parts: [
          full.slice(pK, pKh).trim(),
          full.slice(pKh, pG).trim(),
          full.slice(pG, pGh).trim(),
          full.slice(pGh).trim(),
        ],
      };
    }
    return {
      intro,
      parts: [
        full.slice(pK, pKh).trim(),
        full.slice(pKh, pG).trim(),
        full.slice(pG).trim(),
      ],
    };
  }

  /** Same structure as the /question list (`QuestionComponent.getQuestionDisplayStructure`). */
  getQuestionDisplayStructure(q: { question?: unknown; type?: string }): { intro: string; parts: string[] } {
    const full = this.getQuestionDisplayText(q);
    if (!full) return { intro: '', parts: [] };
    const type = (q?.type ?? '').toString().trim();
    if (type !== 'সৃজনশীল প্রশ্ন') return { intro: full, parts: [] };
    const byMarkers = this.parseCreativeStructureFromParenMarkers(full);
    if (byMarkers) return byMarkers;
    const lines = full
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length <= 1) return { intro: full, parts: [] };
    const intro = lines[0] ?? '';
    const parts = lines.slice(1);
    return { intro, parts };
  }

  /**
   * CQ sub-section marks at the right of each (ক)–(ঘ) block: 3 parts → 2+4+4; 4 parts → 1+2+3+4 (Bengali digits).
   */
  creativeSubpartMarkBn(partCount: number, partIndexZeroBased: number): string | null {
    if (partCount === 3 && partIndexZeroBased >= 0 && partIndexZeroBased < 3) {
      const marks = [2, 4, 4];
      return QuestionCreatorComponent.toBengaliDigits(String(marks[partIndexZeroBased]));
    }
    if (partCount === 4 && partIndexZeroBased >= 0 && partIndexZeroBased < 4) {
      const marks = [1, 2, 3, 4];
      return QuestionCreatorComponent.toBengaliDigits(String(marks[partIndexZeroBased]));
    }
    return null;
  }

  /** Preview serial with Bengali digits (e.g. ১, ১০) for stem prefix. */
  previewQuestionSerialBn(oneBasedSerial: number): string {
    const n = Math.max(0, Math.floor(Number(oneBasedSerial) || 0));
    return QuestionCreatorComponent.toBengaliDigits(String(n));
  }

  /**
   * 1-based number shown before each stem: সৃজনশীল and বহুনির্বাচনি each count from ১ in `previewQuestions` order;
   * other types keep the global position (১…N in sheet order).
   */
  previewQuestionDisplaySerialOneBased(listIndex: number, q: { type?: unknown }): number {
    const list = this.previewQuestions;
    if (listIndex < 0 || listIndex >= list.length) return Math.max(1, listIndex + 1);
    const isCreative = this.questionIsCreativeType(q);
    const isMcq = !isCreative && this.questionIsMcqType(q);
    if (!isCreative && !isMcq) return listIndex + 1;
    let prior = 0;
    for (let i = 0; i < listIndex; i++) {
      const qi = list[i];
      if (isCreative) {
        if (this.questionIsCreativeType(qi)) prior++;
      } else if (this.questionIsMcqType(qi)) prior++;
    }
    return prior + 1;
  }

  /** Sidebar list: CQ rows in preview order (same SL stream as the sheet). */
  get creatorSidebarCreativeQuestions(): any[] {
    return this.previewQuestions.filter((q) => this.questionIsCreativeType(q));
  }

  /** Sidebar list: MCQ rows in preview order (SL ১… separate from CQ). */
  get creatorSidebarMcqQuestions(): any[] {
    return this.previewQuestions.filter(
      (q) => !this.questionIsCreativeType(q) && this.questionIsMcqType(q)
    );
  }

  /** Neither CQ nor MCQ (rare); SL matches global position in preview order. */
  get creatorSidebarOtherQuestions(): any[] {
    return this.previewQuestions.filter(
      (q) => !this.questionIsCreativeType(q) && !this.questionIsMcqType(q)
    );
  }

  /** Bengali SL for a sidebar row — same numbering as {@link previewQuestionDisplaySerialOneBased}. */
  creatorSidebarQuestionSlBn(q: { type?: unknown }): string {
    const list = this.previewQuestions;
    const i = list.indexOf(q as any);
    if (i < 0) {
      const j = this.questions.indexOf(q as any);
      return this.previewQuestionSerialBn(j >= 0 ? j + 1 : 1);
    }
    return this.previewQuestionSerialBn(this.previewQuestionDisplaySerialOneBased(i, q));
  }

  trackCreatorQuestionQid(_index: number, q: { qid?: unknown }): string | number {
    return q?.qid != null ? (q.qid as string | number) : _index;
  }

  getOptionDisplayText(opt: unknown): string {
    if (opt == null) return '';
    const raw = typeof opt === 'string' ? opt.trim() : String(opt);
    return formatMaybeCProgramQuestionText(raw);
  }

  /** Grid columns for MCQ options in preview + measure rail (repeat N). */
  get previewOptionsGridStyle(): Record<string, string> {
    const n = Math.max(
      QuestionCreatorComponent.OPTIONS_COLUMNS_MIN,
      Math.min(QuestionCreatorComponent.OPTIONS_COLUMNS_MAX, Math.floor(Number(this.optionsColumns)) || 2)
    );
    return {
      gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
    };
  }

  onMcqSetLetterChange(): void {
    if (this.selectedMcqSetLetter != null && !this.mcqOrdersFrozen) {
      this.mcqPreviewShuffleNonce++;
    }
    this.onPreviewLayoutChange();
  }

  private clearMcqPersistedOrders(): void {
    this.persistedMcqOrderBySet = {};
    this.questionHeaderByMcqSet = {};
    this.mcqOrdersFrozen = false;
  }

  /** Rebuild full list from stored qids (redownload / frozen preview). */
  reorderQuestionsFromQidList(qids: (string | number)[] | undefined | null): any[] {
    if (!qids?.length) return this.questions.slice();
    const byId = new Map<string | number, any>();
    for (const q of this.questions) {
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
    for (const q of this.questions) {
      if (q?.qid != null && !seen.has(q.qid)) out.push(q);
    }
    return out;
  }

  private parsePersistedMcqOrderMap(raw: unknown): Partial<
    Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], (string | number)[]>
  > {
    const out: Partial<Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], (string | number)[]>> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const letters = QuestionCreatorComponent.MCQ_SET_LETTERS;
    for (const L of letters) {
      const arr = (raw as Record<string, unknown>)[L];
      if (Array.isArray(arr) && arr.length) {
        out[L] = arr.map((x) => (typeof x === 'number' || typeof x === 'string' ? x : String(x)));
      }
    }
    return out;
  }

  private parsePersistedHeaderMap(raw: unknown): Partial<
    Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], string>
  > {
    const out: Partial<Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], string>> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const letters = QuestionCreatorComponent.MCQ_SET_LETTERS;
    for (const L of letters) {
      const s = (raw as Record<string, unknown>)[L];
      if (typeof s === 'string' && s.trim()) out[L] = s;
    }
    return out;
  }

  /**
   * Same সৃজনশীল items and order as `this.questions`; each বহুনির্বাচনি slot gets
   * the corresponding entry from a set-specific shuffle (or frozen saved order).
   */
  buildQuestionsOrderedForMcqSet(setLetter: string): any[] {
    const letters = QuestionCreatorComponent.MCQ_SET_LETTERS;
    const L = setLetter as (typeof letters)[number];
    if (!letters.includes(L)) return this.questions.slice();
    const snap = this.persistedMcqOrderBySet[L];
    if (snap?.length && this.mcqOrdersFrozen) {
      return this.reorderQuestionsFromQidList(snap);
    }
    const variantIndex = Math.max(0, letters.indexOf(L));
    const mcqInOrder = this.questions.filter((q) => this.questionIsMcqType(q));
    if (mcqInOrder.length <= 1) {
      return this.questions.slice();
    }
    let seed = this.mcqPermutationSeed(variantIndex, mcqInOrder);
    if (!this.mcqOrdersFrozen) {
      seed = (seed + Math.imul(this.mcqPreviewShuffleNonce, 0x9e3779b9)) >>> 0;
    }
    const shuffled = this.shuffleArrayDeterministic(mcqInOrder, seed);
    let mi = 0;
    const mixed = this.questions.map((q) => (this.questionIsMcqType(q) ? shuffled[mi++]! : q));
    if (!this.selectionHasBothHeaderTypes()) {
      return mixed;
    }
    const creative = mixed.filter((q) => this.questionIsCreativeType(q));
    const mcq = mixed.filter((q) => this.questionIsMcqType(q));
    const others = mixed.filter((q) => !this.questionIsCreativeType(q) && !this.questionIsMcqType(q));
    return [...creative, ...mcq, ...others];
  }

  /**
   * First sheet page: creative block if only creative or mixed (সৃজনশীল first).
   * When mixed spans multiple sheets, every creative-only sheet uses the creative block; the first
   * sheet that starts with an MCQ question uses the MCQ block (not “sheet index === 1”).
   */
  headerVariantForPage(pageIndex?: number | null): 'creative' | 'mcq' {
    const pi = pageIndex == null || !Number.isFinite(Number(pageIndex)) ? 0 : Number(pageIndex);
    if (!this.paperSubjectMetaLinesEligible()) return 'mcq';
    if (this.selectionHasBothHeaderTypes() && this.mixedTypesSinglePageMergedHeader) {
      return 'creative';
    }
    if (!this.selectionHasBothHeaderTypes()) {
      return this.selectionHasCreativeType() ? 'creative' : 'mcq';
    }
    const page = this.paginatedPages[pi];
    const c = this.previewCreativeBlockQuestionCount();
    if (!page?.items?.length) {
      return pi === 0 ? 'creative' : 'mcq';
    }
    const minI = Math.min(...page.items.map((it) => it.index));
    return minI >= c ? 'mcq' : 'creative';
  }

  /** Header block visible on this paginated sheet (0-based page index). */
  paperHeaderVisibleForSheetPage(pageIndex: number): boolean {
    if (!(this.questionHeader || '').trim()) return false;
    if (this.headerUseLegacyQuestionHeader) return pageIndex === 0;
    if (!this.paperSubjectMetaLinesEligible()) return pageIndex === 0;
    if (this.selectionHasBothHeaderTypes() && this.mixedTypesSinglePageMergedHeader) {
      return pageIndex === 0;
    }
    if (this.selectionHasBothHeaderTypes()) {
      const page = this.paginatedPages[pageIndex];
      const c = this.previewCreativeBlockQuestionCount();
      if (!page?.items?.length) {
        return pageIndex === 0;
      }
      const idxs = page.items.map((it) => it.index);
      const minI = Math.min(...idxs);
      const maxI = Math.max(...idxs);
      if (maxI < c) {
        return pageIndex === 0;
      }
      if (minI >= c) {
        return minI === c;
      }
      return false;
    }
    return pageIndex === 0;
  }

  paperHeaderLine3Text(pageIndex?: number | null): string {
    const v = this.headerVariantForPage(pageIndex);
    const name = this.creatorSubjectLabel;
    if (v === 'creative') {
      if (this.selectionHasBothHeaderTypes() && this.mixedTypesSinglePageMergedHeader) {
        return name || '';
      }
      return name ? `${name} (সৃজনশীল)` : '(সৃজনশীল)';
    }
    /** MCQ: plain text for export (newline between title and subject). */
    return name ? `বহুনির্বাচনি অভীক্ষা\n${name}` : 'বহুনির্বাচনি অভীক্ষা';
  }

  /** MCQ line 3 in live preview: `<br>` between title and subject (name HTML-escaped). */
  paperHeaderLine3McqPreviewHtml(): string {
    const name = this.creatorSubjectLabel;
    return name
      ? `বহুনির্বাচনি অভীক্ষা<br>${QuestionCreatorComponent.escapeHtmlText(name)}`
      : 'বহুনির্বাচনি অভীক্ষা';
  }

  /** MCQ sheet with subject meta: 2×5 code/set grid beside first six logical header lines. */
  headerUsesMcqCodeTable(pageIndex?: number | null): boolean {
    return this.paperSubjectMetaLinesEligible() && this.headerVariantForPage(pageIndex) === 'mcq';
  }

  mcqHeaderUpperLineSlots(
    pageIndex?: number | null
  ): Array<{ kind: 'text'; text: string } | { kind: 'mcqTitle' } | { kind: 'mcqSubject' }> {
    const lines = this.headerPreviewLines;
    if (!this.headerUsesMcqCodeTable(pageIndex)) {
      const out: Array<{ kind: 'text'; text: string } | { kind: 'mcqTitle' } | { kind: 'mcqSubject' }> = [];
      for (let i = 0; i < Math.min(6, lines.length); i++) {
        const raw = lines[i] ?? '';
        out.push({ kind: 'text', text: i === 1 ? this.examLineDisplayWithoutBracket(raw) : raw });
      }
      while (out.length < 6) out.push({ kind: 'text', text: '' });
      return out;
    }
    if (this.mcqOnlyUsesSixLineTextareaBlock()) {
      return Array.from({ length: 6 }, (_, i) => ({ kind: 'text' as const, text: lines[i] ?? '' }));
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      // MCQ lower block renders its own <hr>; do not also show an <hr> inside the upper band slot.
      const t5 = (lines[5] ?? '').trim();
      const slot5 = t5.toLowerCase().includes('<hr') ? '' : (lines[5] ?? '');
      return [
        { kind: 'text', text: lines[0] ?? '' },
        { kind: 'text', text: this.examLineDisplayWithoutBracket(lines[1] ?? '') },
        { kind: 'mcqTitle' },
        { kind: 'text', text: lines[2] ?? '' },
        { kind: 'text', text: lines[3] ?? '' },
        { kind: 'text', text: slot5 },
      ];
    }
    return [
      { kind: 'text', text: lines[0] ?? '' },
      { kind: 'text', text: this.examLineDisplayWithoutBracket(lines[1] ?? '') },
      { kind: 'mcqTitle' },
      { kind: 'mcqSubject' },
      { kind: 'text', text: lines[2] ?? '' },
      { kind: 'text', text: lines[3] ?? '' },
    ];
  }

  /**
   * Maps MCQ upper-band slot index (0–5) to `headerLineFontSizes` index. Mixed unified: title + subject
   * share font index 2 (textarea subject line) with সৃজনশীল display.
   */
  mcqUpperSlotFontIndex(slotIndex: number, pageIndex?: number | null): number {
    const pi = pageIndex == null || !Number.isFinite(Number(pageIndex)) ? 0 : Number(pageIndex);
    if (!this.headerUsesMcqCodeTable(pi) || this.mcqOnlyUsesSixLineTextareaBlock()) {
      return slotIndex;
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      if (slotIndex === 2 || slotIndex === 3) {
        return 2;
      }
      if (slotIndex === 4) {
        return 3;
      }
      if (slotIndex === 5) {
        return 5;
      }
      return slotIndex;
    }
    if (slotIndex === 4) {
      return 2;
    }
    if (slotIndex === 5) {
      return 3;
    }
    return slotIndex;
  }

  /** Reserved: extra MCQ-only font rows in sidebar were removed; mixed uses textarea line 2 for title/subject font. */
  headerUsesMcqSyntheticTitleSlots(): boolean {
    return false;
  }

  /**
   * Lines below the MCQ band + code grid.
   * MCQ-only: textarea line 7 (index 6) is the plain code/set row for sidebar edit only — the grid already shows it, so preview starts at `slice(7)`.
   */
  mcqHeaderLowerLines(): string[] {
    const lines = this.headerPreviewLines;
    const hr = QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    const withSingleHr = (arr: string[]): string[] => {
      // Ensure exactly one <hr> in the MCQ lower block, even if the stored header still contains <hr>.
      const out = arr
        .filter((s) => !!(s ?? '').trim())
        .filter((s) => !String(s ?? '').trim().toLowerCase().includes('<hr'));
      return [hr, ...out];
    };
    if (this.mcqOnlyUsesSixLineTextareaBlock()) {
      return withSingleHr(lines.slice(7));
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      if (this.mixedSqNoticeLinesEligible()) {
        return withSingleHr(lines.slice(8));
      }
      return withSingleHr(lines.slice(7));
    }
    return withSingleHr(lines.slice(4));
  }

  /** Font stepper index for first row below the MCQ band (`mcqHeaderLowerLines` j=0). */
  mcqHeaderLowerLinesFontBase(): number {
    if (this.mcqOnlyUsesSixLineTextareaBlock()) {
      return 7;
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return this.mixedSqNoticeLinesEligible() ? 8 : 7;
    }
    return 6;
  }

  /** Same slice start as {@link mcqHeaderLowerLines} before `withSingleHr` prepends `<hr>`. */
  private mcqHeaderLowerSourceSliceStart(): number {
    if (this.mcqOnlyUsesSixLineTextareaBlock()) return 7;
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return this.mixedSqNoticeLinesEligible() ? 8 : 7;
    }
    return 4;
  }

  /**
   * 0-based index in `headerPreviewLines` (newline split) → `getHeaderEditorLinesRaw()` model index
   * (sidebar / `headerLineFontSizes` index).
   */
  private headerPreviewRawLineIndexToEditorModelIndex(rawLineIndex: number): number {
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n').split('\n');
    if (rawLineIndex < 0 || rawLineIndex >= raw.length) return -1;
    let fi = 0;
    for (let ri = 0; ri < raw.length; ri++) {
      const ln = (raw[ri] ?? '').trim();
      if (!ln) continue;
      if (ln.toLowerCase().includes('<hr')) continue;
      if (ri === rawLineIndex) return fi;
      fi++;
    }
    return -1;
  }

  /**
   * Font index for `mcqHeaderLowerLines()` row `j` — matches sidebar `row.modelIndex` / ± buttons.
   * `mcqHeaderLowerLines` always starts with a synthetic `<hr>` at j=0, so real header lines use j≥1;
   * `mcqHeaderLowerLinesFontBase() + j` was off by one for those rows.
   */
  mcqHeaderLowerLineFontIndex(j: number): number {
    this.syncHeaderFontSizesToLineCount();
    const rows = this.mcqHeaderLowerLines();
    if (j < 0 || j >= rows.length) return 0;
    const hr = QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    const first = (rows[0] ?? '').trim();
    if (j === 0 && first === hr.trim()) {
      return rows.length > 1 ? this.mcqHeaderLowerLineFontIndex(1) : 0;
    }
    const sliceStart = this.mcqHeaderLowerSourceSliceStart();
    const contentIdx = first === hr.trim() ? j - 1 : j;
    if (contentIdx < 0) return 0;
    let seen = 0;
    for (let ri = sliceStart; ri < this.headerPreviewLines.length; ri++) {
      const ln = (this.headerPreviewLines[ri] ?? '').trim();
      if (!ln) continue;
      if (ln.toLowerCase().includes('<hr')) continue;
      if (seen === contentIdx) {
        const modelIdx = this.headerPreviewRawLineIndexToEditorModelIndex(ri);
        return modelIdx >= 0 ? modelIdx : 0;
      }
      seen++;
    }
    return 0;
  }

  /** First MCQ lower content row after optional synthetic `<hr>` (sq 25/30 দ্রষ্টব্য styling). */
  mcqHeaderLowerLineIsSqNoticeRow(j: number): boolean {
    if (!this.mixedSqNoticeLinesEligible()) return false;
    const rows = this.mcqHeaderLowerLines();
    const hr = QuestionCreatorComponent.DEFAULT_STRUCTURED_HEADER_HR;
    if (rows.length > 0 && (rows[0] ?? '').trim() === hr.trim()) {
      return j === 1;
    }
    return j === 0;
  }

  /**
   * MCQ বিষয় কোড / সেট grid font slot.
   * Mixed CQ+MCQ: same as exam line (textarea index 1, sidebar “Header line 2”) — not the plain code row.
   */
  mcqCodeGridHeaderFontIndex(): number {
    if (this.mcqOnlyUsesSixLineTextareaBlock()) {
      return this.plainCodeLineIndexForGrid();
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return 1;
    }
    const n = this.headerLineFontSizes.length;
    return Math.max(0, Math.min(5, n - 1));
  }

  /** First sheet page index whose header variant matches (same rule as export `buildHeaderForPdfKind`). */
  private exportFirstSheetPageIndexForHeaderVariant(variant: 'creative' | 'mcq'): number {
    const n = Array.isArray(this.paginatedPages) ? this.paginatedPages.length : 0;
    for (let i = 0; i < n; i++) {
      if (this.headerVariantForPage(i) === variant) {
        return i;
      }
    }
    return 0;
  }

  /**
   * One font size (px) per physical line in split PDF headers — mirrors `buildHeaderForPdfKind` and preview
   * `headerPreviewLineTypoStyle` / `mcqUpperSlotFontIndex` so Playwright PDF matches the sheet header.
   */
  private buildPdfHeaderLineFontPxListForSplitExport(
    kind: 'creative' | 'mcq',
    setLetter: (typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number] | null,
  ): number[] {
    const setL = setLetter !== null ? setLetter : this.selectedMcqSetLetter;
    const out: number[] = [];
    const mcqTitlePx = this.clampHeaderLineFontPx(QuestionCreatorComponent.HEADER_LINE3_FONT_DEFAULT_PX);
    if (kind === 'creative') {
      this.creativeHeaderTopLinesPadded().forEach((ln, ti) => {
        const fi = this.creativeTopLineFontIndex(ti);
        const px = this.headerLineFontPxForEditorLine(fi);
        if (this.creativeShowSqSplitTopRow(ti, ln)) {
          out.push(px, px);
        } else {
          out.push(px);
        }
      });
      const band = this.creativeHeaderBandLeftLines();
      if (band.length) {
        out.push(this.headerLineFontPxForEditorLine(this.creativeBandFirstLineFontIndex()));
        out.push(this.headerLineFontPxForEditorLine(this.creativeCodeGridFontIndex()));
        band.slice(1).forEach((_ln, bj) => {
          out.push(this.headerLineFontPxForEditorLine(this.creativeBandTailFontBase() + bj));
        });
      } else {
        out.push(this.headerLineFontPxForEditorLine(this.creativeCodeGridFontIndex()));
      }
      return out;
    }
    const piMcq = this.exportFirstSheetPageIndexForHeaderVariant('mcq');
    const slots = this.mcqHeaderUpperLineSlots(piMcq);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const slotFontPx =
        s.kind === 'mcqTitle'
          ? mcqTitlePx
          : this.headerLineFontPxForEditorLine(this.mcqUpperSlotFontIndex(i, piMcq));
      if (this.mcqShowSqSplitMcqBandRow(piMcq, i, s as { kind: string; text?: string })) {
        out.push(slotFontPx, slotFontPx);
      } else {
        out.push(slotFontPx);
      }
    }
    out.push(this.headerLineFontPxForEditorLine(this.mcqCodeGridHeaderFontIndex()));
    const lower = this.mcqHeaderLowerLines();
    for (let j = 0; j < lower.length; j++) {
      out.push(this.headerLineFontPxForEditorLine(this.mcqHeaderLowerLineFontIndex(j)));
    }
    return out;
  }

  /** `question_subjects.sq`: 25 or 30 (per-question MCQ/CQ সময়+পূর্ণমান in structured header). */
  private subjectSqExamVariant(): 25 | 30 | null {
    const s = this.context.sq;
    if (s === 25 || s === 30) return s;
    const n = typeof s === 'string' ? parseInt(s, 10) : Number(s);
    if (n === 25 || n === 30) return n as 25 | 30;
    return null;
  }

  /** Counts MCQ (বহুনির্বাচনি) and CQ (সৃজনশীল) in the active creator list for sq header math. */
  private sqMcqCreativeQuestionCounts(): { mcq: number; cq: number } {
    let mcq = 0;
    let cq = 0;
    for (const q of this.questions ?? []) {
      if (this.questionIsMcqType(q)) {
        mcq++;
      } else if (this.questionIsCreativeType(q)) {
        cq++;
      }
    }
    return { mcq, cq };
  }

  private normalizeSqMetaWhitespace(s: string): string {
    return String(s ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '<br>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private lineMatchesLegacySqMcqCombined(text: string): boolean {
    const n = this.normalizeSqMetaWhitespace(text);
    const legacy = this.normalizeSqMetaWhitespace('সময় -- ৩০ মিনিট <br> পূর্ণমান -- ৩০');
    return n === legacy;
  }

  private lineMatchesLegacySqCreativeCombined(text: string): boolean {
    const n = this.normalizeSqMetaWhitespace(text);
    const legacy25 = this.normalizeSqMetaWhitespace('সময় -- ২ ঘন্টা ৩৫ মিনিট <br> পূর্ণমান -- ৫০');
    const legacy30 = this.normalizeSqMetaWhitespace('সময় -- ২ ঘন্টা ৩০ মিনিট <br> পূর্ণমান -- ৭০');
    return n === legacy25 || n === legacy30;
  }

  /**
   * True when a two-part `<br>` line looks like auto MCQ sq meta (minutes-only সময় line, marks == minutes).
   * Used to re-seed when question counts change.
   */
  private isProbableAutoMcqSqMetaTwoLine(text: string): boolean {
    const parts = String(text ?? '')
      .split(/<br\s*\/?>/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length !== 2) {
      return false;
    }
    const a = parts[0]!;
    const b = parts[1]!;
    if (!/^সময়\s*--/iu.test(a) || !/^পূর্ণমান\s*--/iu.test(b)) {
      return false;
    }
    if (/ঘন্টা|ঘণ্টা/u.test(a)) {
      return false;
    }
    const asciiA = QuestionCreatorComponent.bnToAsciiDigits(a);
    const asciiB = QuestionCreatorComponent.bnToAsciiDigits(b);
    const ma = asciiA.match(/সময়\s*--\s*(\d+)\s*মিনিট/i);
    const mb = asciiB.match(/পূর্ণমান\s*--\s*(\d+)/i);
    if (!ma || !mb) {
      return false;
    }
    return parseInt(ma[1]!, 10) === parseInt(mb[1]!, 10);
  }

  /** CQ combined meta (two `<br>` parts) — not the MCQ “minutes == marks” pattern. */
  private lineLooksLikeCreativeSqMetaNotMcq(text: string): boolean {
    const parts = String(text ?? '')
      .split(/<br\s*\/?>/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length !== 2) {
      return false;
    }
    if (!/^সময়\s*--/iu.test(parts[0]!) || !/^পূর্ণমান\s*--/iu.test(parts[1]!)) {
      return false;
    }
    return !this.isProbableAutoMcqSqMetaTwoLine(text);
  }

  private shouldReseedSqMcqCombinedLine(text: string): boolean {
    const t = String(text ?? '').trim();
    if (!t) {
      return true;
    }
    if (this.parseMcqSqCombinedDisplayParts(text) != null) {
      return true;
    }
    if (this.lineMatchesLegacySqMcqCombined(text)) {
      return true;
    }
    return this.isProbableAutoMcqSqMetaTwoLine(text);
  }

  private shouldReseedSqCreativeCombinedLine(text: string): boolean {
    const t = String(text ?? '').trim();
    if (!t) {
      return true;
    }
    if (this.parseCreativeSqCombinedDisplayParts(text) != null) {
      return true;
    }
    if (this.lineMatchesLegacySqCreativeCombined(text)) {
      return true;
    }
    return this.lineLooksLikeCreativeSqMetaNotMcq(text);
  }

  /** BN duration after `সময় -- ` (e.g. `২০ মিনিট`, `১ ঘন্টা ৪৭ মিনিট`). */
  private formatBnSqDurationAfterDash(totalMinutes: number): string {
    const m = Math.max(0, Math.floor(totalMinutes));
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h <= 0) {
      return `${QuestionCreatorComponent.toBengaliDigits(String(m))} মিনিট`;
    }
    if (rem === 0) {
      return `${QuestionCreatorComponent.toBengaliDigits(String(h))} ঘন্টা`;
    }
    return `${QuestionCreatorComponent.toBengaliDigits(String(h))} ঘন্টা ${QuestionCreatorComponent.toBengaliDigits(String(rem))} মিনিট`;
  }

  /** MCQ header: 5th line (1-based). sq 25/30: 1 minute per MCQ question. */
  examDurationLineMcq(): string {
    const v = this.subjectSqExamVariant();
    if (v !== 25 && v !== 30) {
      return '';
    }
    const { mcq } = this.sqMcqCreativeQuestionCounts();
    if (mcq <= 0) {
      return '';
    }
    const minutes = mcq;
    return `সময় -- ${this.formatBnSqDurationAfterDash(minutes)}`;
  }

  /** সৃজনশীল header: 4th line (1-based). sq 25: 31 min per CQ; sq 30: floor(n×21.43) total minutes. */
  examDurationLineCreative(): string {
    const v = this.subjectSqExamVariant();
    if (v !== 25 && v !== 30) {
      return '';
    }
    const { cq } = this.sqMcqCreativeQuestionCounts();
    if (cq <= 0) {
      return '';
    }
    const totalMin =
      v === 25
        ? cq * QuestionCreatorComponent.SQ_CQ_MINUTES_PER_25
        : Math.floor(cq * QuestionCreatorComponent.SQ_CQ_MINUTES_PER_30);
    return `সময় -- ${this.formatBnSqDurationAfterDash(totalMin)}`;
  }

  /** MCQ header: 6th line (1-based). sq 25/30: 1 mark per MCQ question. */
  examFullMarksLineMcq(): string {
    const v = this.subjectSqExamVariant();
    if (v !== 25 && v !== 30) {
      return '';
    }
    const { mcq } = this.sqMcqCreativeQuestionCounts();
    if (mcq <= 0) {
      return '';
    }
    return `পূর্ণমান -- ${QuestionCreatorComponent.toBengaliDigits(String(mcq))}`;
  }

  /** সৃজনশীল header: marks line. sq 25/30: 10 marks per CQ question. */
  examFullMarksLineCreative(): string {
    const v = this.subjectSqExamVariant();
    if (v !== 25 && v !== 30) {
      return '';
    }
    const { cq } = this.sqMcqCreativeQuestionCounts();
    if (cq <= 0) {
      return '';
    }
    return `পূর্ণমান -- ${QuestionCreatorComponent.toBengaliDigits(String(cq * 10))}`;
  }

  /** One textarea segment: সময় then পূর্ণমান (MCQ). */
  examSqMetaCombinedLineMcq(): string {
    return this.joinSqMetaLineParts(this.examDurationLineMcq(), this.examFullMarksLineMcq());
  }

  /** One textarea segment: সময় then পূর্ণমান (সৃজনশীল). */
  examSqMetaCombinedLineCreative(): string {
    return this.joinSqMetaLineParts(this.examDurationLineCreative(), this.examFullMarksLineCreative());
  }

  private joinSqMetaLineParts(a: string, b: string): string {
    const x = (a || '').trim();
    const y = (b || '').trim();
    if (!x && !y) {
      return '';
    }
    if (!x) {
      return y;
    }
    if (!y) {
      return x;
    }
    return `${x} <br> ${y}`;
  }

  private static escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** If textarea line matches canonical MCQ combined সময়+পূর্ণমান, split for sheet preview. */
  parseMcqSqCombinedDisplayParts(text: string | undefined | null): { first: string; second: string } | null {
    const dur = this.examDurationLineMcq();
    const marks = this.examFullMarksLineMcq();
    if (!dur || !marks) {
      return null;
    }
    const raw = (text ?? '').trim();
    const canon = this.examSqMetaCombinedLineMcq().trim();
    if (raw === canon) {
      return { first: dur, second: marks };
    }
    const brParts = raw.split(/<br\s*\/?>/i).map((p) => p.trim());
    const brNonEmpty = brParts.filter((p) => p.length > 0);
    if (brNonEmpty.length === 2) {
      const p0 = brNonEmpty[0] ?? '';
      const p1 = brNonEmpty[1] ?? '';
      if (p0 === dur.trim() && p1 === marks.trim()) {
        return { first: dur, second: marks };
      }
    }
    const re = new RegExp(
      `^${QuestionCreatorComponent.escapeRegExp(dur)}\\s{2,}${QuestionCreatorComponent.escapeRegExp(marks)}$`
    );
    if (re.test(raw)) {
      return { first: dur, second: marks };
    }
    return null;
  }

  parseCreativeSqCombinedDisplayParts(text: string | undefined | null): { first: string; second: string } | null {
    const dur = this.examDurationLineCreative();
    const marks = this.examFullMarksLineCreative();
    if (!dur || !marks) {
      return null;
    }
    const raw = (text ?? '').trim();
    const canon = this.examSqMetaCombinedLineCreative().trim();
    if (raw === canon) {
      return { first: dur, second: marks };
    }
    const brParts = raw.split(/<br\s*\/?>/i).map((p) => p.trim());
    const brNonEmpty = brParts.filter((p) => p.length > 0);
    if (brNonEmpty.length === 2) {
      const p0 = brNonEmpty[0] ?? '';
      const p1 = brNonEmpty[1] ?? '';
      if (p0 === dur.trim() && p1 === marks.trim()) {
        return { first: dur, second: marks };
      }
    }
    const re = new RegExp(
      `^${QuestionCreatorComponent.escapeRegExp(dur)}\\s+${QuestionCreatorComponent.escapeRegExp(marks)}$`
    );
    if (re.test(raw)) {
      return { first: dur, second: marks };
    }
    return null;
  }

  mcqShowSqSplitMcqBandRow(
    _pageIndex: number | null | undefined,
    slotIndex: number,
    slot: { kind: string; text?: string }
  ): boolean {
    return slot.kind === 'text' && slotIndex === 4 && this.parseMcqSqCombinedDisplayParts(slot.text) != null;
  }

  /**
   * Last MCQ upper slot (0-based) whose bottom aligns with the বিষয় কোড grid.
   * When line 5 is split (সময় / পূর্ণমান), that is two sheet rows but one slot — grid ends after slot 4 (6th visual line).
   * Otherwise grid ends after slot 5 (6th textarea line).
   */
  mcqCodeGridAlignLastSlotIndex(pageIndex?: number | null): number {
    const slots = this.mcqHeaderUpperLineSlots(pageIndex);
    const s4 = slots[4];
    if (s4 && this.mcqShowSqSplitMcqBandRow(pageIndex, 4, s4)) {
      return 4;
    }
    return 5;
  }

  mcqSqSplitLineFirst(text: string | undefined | null): string {
    return this.parseMcqSqCombinedDisplayParts(text)?.first ?? '';
  }

  mcqSqSplitLineSecond(text: string | undefined | null): string {
    return this.parseMcqSqCombinedDisplayParts(text)?.second ?? '';
  }

  /**
   * সৃজনশীল top row 4 (combined সময়+পূর্ণমান): split when line matches **either** CQ canonical
   * or MCQ canonical (mixed mode uses one shared line, often MCQ-shaped).
   */
  creativeShowSqSplitTopRow(topIndex: number, line: string): boolean {
    if (topIndex !== 3) {
      return false;
    }
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return this.parseCreativeSqCombinedDisplayParts(line) != null;
    }
    return (
      this.parseCreativeSqCombinedDisplayParts(line) != null ||
      this.parseMcqSqCombinedDisplayParts(line) != null
    );
  }

  creativeSqSplitLineFirst(line: string): string {
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return this.parseCreativeSqCombinedDisplayParts(line)?.first ?? '';
    }
    return (
      this.parseCreativeSqCombinedDisplayParts(line)?.first ??
      this.parseMcqSqCombinedDisplayParts(line)?.first ??
      ''
    );
  }

  creativeSqSplitLineSecond(line: string): string {
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return this.parseCreativeSqCombinedDisplayParts(line)?.second ?? '';
    }
    return (
      this.parseCreativeSqCombinedDisplayParts(line)?.second ??
      this.parseMcqSqCombinedDisplayParts(line)?.second ??
      ''
    );
  }

  /** MCQ band: text from textarea (combined line splits into two sheet rows in template when matched). */
  mcqUpperSlotDisplayText(
    _slotIndex: number,
    slot: { kind: string; text?: string }
  ): string {
    if (slot.kind !== 'text') return '';
    return slot.text ?? '';
  }

  /** Live sheet header: render safe HTML (e.g. `<b>`) per line; Angular sanitizes `[innerHTML]`. */
  headerLinePreviewInnerHtml(line: string | null | undefined): string {
    const s = QuestionCreatorComponent.normalizeHeaderLineRawForPreview(line ?? '');
    return s.length === 0 ? '\u00a0' : s;
  }

  /**
   * Font index for `creativeHeaderTopLinesPadded()` row `ti`. Mixed unified: `ti === 3` is
   * `headerPreviewLines[4]` (sidebar line 5, সৃজনশীল সময়+পূর্ণমান) — not `ti` (which would match MCQ
   * combined line at model index 3).
   */
  creativeTopLineFontIndex(ti: number): number {
    if (this.mixedHeaderUsesExpandedEditorLines() && ti === 3) {
      return 4;
    }
    return ti;
  }

  /** সৃজনশীল structured header: first four lines (padded); mixed: index 4 = সৃজনশীল সময়+পূর্ণমান. */
  creativeHeaderTopLinesPadded(): string[] {
    const L = this.headerPreviewLines;
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      const subj = this.mixedUnifiedCreativeSubjectPreviewLine(L[2] ?? '');
      return [L[0] ?? '', this.examLineDisplayWithoutBracket(L[1] ?? ''), subj, L[4] ?? ''];
    }
    const out = L.slice(0, 4);
    while (out.length < 4) {
      out.push('');
    }
    if (out.length > 1) {
      out[1] = this.examLineDisplayWithoutBracket(out[1] ?? '');
    }
    return out;
  }

  /** Lines beside the code grid; mixed: HR at index 5; sq 25/30: only index 7 (CQ দ্রষ্টব্য) — index 8 is MCQ-only. */
  creativeHeaderBandLeftLines(): string[] {
    const L = this.headerPreviewLines;
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      const out: string[] = [];
      if (L.length > 5) {
        const v = (L[5] ?? '').trim();
        if (v && !v.toLowerCase().includes('<hr')) out.push(L[5] ?? '');
      }
      if (this.mixedSqNoticeLinesEligible()) {
        if (L.length > 7) {
          out.push(L[7] ?? '');
        }
        return out;
      }
      for (let i = 7; i < L.length; i++) {
        out.push(L[i] ?? '');
      }
      return out;
    }
    /**
     * CQ-only: index 4 = HR beside grid; index 5 = plain বিষয় কোড (digits already in
     * {@link headerCodeGridDigitsBn} grid — do not repeat as a tail row).
     */
    if (this.selectionHasCreativeType() && !this.selectionHasMcqType()) {
      const out: string[] = [];
      if (L.length > 4) {
        const v = (L[4] ?? '').trim();
        if (v && !v.toLowerCase().includes('<hr')) out.push(L[4] ?? '');
      }
      for (let i = 6; i < L.length; i++) {
        out.push(L[i] ?? '');
      }
      return out.filter((s) => !/বিষ[য়য]\s*কোড/.test(String(s ?? '').trim()));
    }
    return L
      .slice(4)
      .filter((s) => !/বিষ[য়য]\s*কোড/.test(String(s ?? '').trim()));
  }

  /**
   * First সৃজনশীল band row beside the subject code grid.
   * `headerPreviewLineTypoStyle` uses {@link headerLineFontSizes} indexed like {@link getHeaderEditorLinesRaw}
   * (same as sidebar `modelIndex`). Mixed: first band line may be preview L[5] or only L[7] (CQ দ্রষ্টব্য) — map
   * from preview line index to that filtered slot (e.g. CQ at preview index 7 → slot 6, not 5 = code or 7 = MCQ).
   */
  creativeBandFirstLineFontIndex(): number {
    if (!this.mixedHeaderUsesExpandedEditorLines()) {
      return 4;
    }
    const L = this.headerPreviewLines;
    if (L.length === 0) {
      return 5;
    }
    /** Same rule as {@link creativeHeaderBandLeftLines}: optional non-HR L[5], else first sq line is L[7]. */
    let previewIdx = 7;
    if (L.length > 5) {
      const v = (L[5] ?? '').trim();
      if (v && !v.toLowerCase().includes('<hr')) {
        previewIdx = 5;
      }
    }
    const fi = this.filteredEditorIndexForPreviewLineIndex(previewIdx);
    return fi >= 0 ? fi : 5;
  }

  /** Font index for `creativeHeaderBandLeftLines().slice(1)` rows (0-based `bj`). */
  creativeBandTailFontBase(): number {
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      /** + bj lines up with filtered slots: CQ @ preview 7 → slot 6, MCQ @ preview 8 → slot 7. */
      return 6;
    }
    if (this.selectionHasCreativeType() && !this.selectionHasMcqType()) {
      return 6;
    }
    return 5;
  }

  /**
   * সৃজনশীল বিষয় কোড grid font slot.
   * Mixed CQ+MCQ: same as exam line (textarea index 1, sidebar “Header line 2”) — matches MCQ grid.
   * সৃজনশীল-only: plain code row beside grid (index 5).
   */
  creativeCodeGridFontIndex(): number {
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return 1;
    }
    if (this.selectionHasCreativeType() && !this.selectionHasMcqType()) {
      return 5;
    }
    return Math.max(0, this.headerPreviewLines.length);
  }

  trackMcqUpperSlot(index: number): number {
    return index;
  }

  trackMcqHeaderLowerLine(index: number, _line: string): number {
    return index;
  }

  /**
   * Three Bengali digit chars from subject_code: strip all non-digits (e.g. H275 → 275),
   * then use the last three digits, padding with leading 0 if needed. Latin letters are ignored.
   */
  subjectCodeDigitsBn(): string[] {
    const digitsOnly = (this.context.subject_code || '').replace(/\D/g, '');
    const core = digitsOnly.length > 3 ? digitsOnly.slice(-3) : digitsOnly.padStart(3, '0');
    return core.split('').map((ch) => QuestionCreatorComponent.toBengaliDigits(ch));
  }

  private static readonly BN_DIGIT_CHARS = '০১২৩৪৫৬৭৮৯';

  /** Collect Bengali (and ASCII) digit characters in order from the editable code row. */
  private parseBnDigitCharsFromCodePlainLine(line: string): string[] {
    const out: string[] = [];
    const bn = QuestionCreatorComponent.BN_DIGIT_CHARS;
    for (const ch of line) {
      const bi = bn.indexOf(ch);
      if (bi >= 0) {
        out.push(ch);
        continue;
      }
      if (ch >= '0' && ch <= '9') {
        out.push(bn[ch.charCodeAt(0) - 48]!);
      }
    }
    return out;
  }

  /**
   * Textarea row index of the plain `বিষয় কোড : …` line that drives the preview digit grid.
   * Mixed unified: index 6. CQ-only (non-mixed): index 5 (6th line). MCQ-only: index 6 when present;
   * if that row is empty but index 5 has digits — use 5 (legacy layouts).
   */
  private plainCodeLineIndexForGrid(): number {
    if (this.mixedHeaderUsesExpandedEditorLines()) {
      return 6;
    }
    if (
      this.selectionHasCreativeType() &&
      !this.selectionHasMcqType() &&
      !this.mixedHeaderUsesExpandedEditorLines()
    ) {
      return 5;
    }
    if (!this.mcqOnlyUsesSixLineTextareaBlock()) {
      return 6;
    }
    const L = this.headerPreviewLines;
    const digitCount = (i: number): number =>
      this.parseBnDigitCharsFromCodePlainLine(L[i] ?? '').length;
    if (digitCount(6) > 0) {
      return 6;
    }
    if (digitCount(5) > 0) {
      return 5;
    }
    return 6;
  }

  /**
   * Digits shown in the MCQ/CQ বিষয় কোড grid: editable plain row from {@link plainCodeLineIndexForGrid}
   * when MCQ-only, CQ-only, or mixed unified; otherwise derived from `context.subject_code`.
   */
  headerCodeGridDigitsBn(): string[] {
    // Prefer the subject code digits from the bracket text on the exam line:
    // "… [বিষয় কোড : ২৭৫]" so editing the bracket updates the grid.
    const examLine = (this.headerPreviewLines?.[1] ?? '').toString();
    const m = examLine.match(/\[([^\]]+)\]/);
    const bracket = (m?.[1] ?? '').trim();
    if (bracket && /বিষ[য়য]\s*কোড/i.test(bracket)) {
      const extracted = this.parseBnDigitCharsFromCodePlainLine(bracket);
      if (extracted.length > 0) {
        const core = extracted.length > 3 ? extracted.slice(-3) : extracted.slice();
        const padded = core.slice();
        while (padded.length < 3) {
          padded.unshift(QuestionCreatorComponent.BN_DIGIT_CHARS[0]!);
        }
        return padded.slice(-3);
      }
    }
    return this.subjectCodeDigitsBn();
  }

  /** Bengali subject code digits without spaces (for MCQ line). */
  get subjectCodeCompactBn(): string {
    return this.subjectCodeDigitsBn().join('');
  }

  /** Show subject code in brackets on the exam line (no separate code text line). */
  private examLineWithBracketedSubjectCode(line: string | null | undefined): string {
    const base = (line ?? '').trimEnd();
    if (!base) return base;
    if (/\[\s*বিষ[য়য]\s*কোড\s*:/.test(base)) return base;
    const code = this.subjectCodeCompactBn;
    if (!code) return base;
    return `${base} [বিষয় কোড : ${code}]`;
  }

  /** Preview should hide the bracket chunk (it only drives the code grid). */
  private examLineDisplayWithoutBracket(line: string | null | undefined): string {
    const s = (line ?? '').toString();
    return s.replace(/\s*\[[^\]]*\]\s*$/u, '').trimEnd();
  }

  /** Plain-text line 4 for export / API (no boxes). Omit সেট when no set is chosen (Select). */
  paperHeaderLine4Plain(pageIndex?: number | null, mcqSetLetter?: string | null): string {
    const v = this.headerVariantForPage(pageIndex);
    const cells = this.subjectCodeDigitsBn();
    const spaced = cells.join(' ');
    const compact = cells.join('');
    if (v === 'creative') {
      return `বিষয় কোড : ${spaced}`;
    }
    const raw = mcqSetLetter !== undefined ? mcqSetLetter : this.selectedMcqSetLetter;
    if (raw == null || raw === '') {
      return `বিষয় কোডঃ ${compact}`;
    }
    const s = String(raw).trim();
    if (s === 'ক' || s === 'খ' || s === 'গ' || s === 'ঘ') {
      return `বিষয় কোডঃ ${compact} সেট : ${s}`;
    }
    return `বিষয় কোডঃ ${compact}`;
  }

  /**
   * True when বহুনির্বাচনি questions exist and a set letter is chosen → four exports (ক–ঘ) on save.
   * If "Select" is active (no set), export a single PDF/DOCX with no set row in the MCQ header.
   */
  private shouldExportFourMcqSetFiles(): boolean {
    return (
      !this.headerUseLegacyQuestionHeader &&
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasMcqType() &&
      this.selectedMcqSetLetter != null
    );
  }

  /**
   * Pure MCQ export: lines 0–5 from textarea, one canonical code row for `setL`, then any lines after 7.
   * (Line 6 in the textarea is the editable mirror of the grid — replaced on export so ক–ঘ variants stay correct.)
   */
  private composeMcqPersistHeaderFromTextarea(baseTrimmed: string, setL: string | null | undefined): string {
    const lines = baseTrimmed.replace(/\r\n/g, '\n').split('\n').map((s) => s.trimEnd());
    const upper = lines.slice(0, 6).join('\n');
    const code = this.paperHeaderLine4Plain(0, setL);
    const tail = lines.slice(7).join('\n');
    return [upper, code, tail].filter((p) => p.length > 0).join('\n');
  }

  /** Full header string for save/export: pure MCQ uses textarea + canonical code row; mixed appends auto meta blocks. */
  buildQuestionHeaderForPersist(explicitMcqSetLetter?: string | null): string {
    const base = (this.questionHeader || '').trimEnd();
    if (this.headerUseLegacyQuestionHeader || !this.paperSubjectMetaLinesEligible()) {
      return base;
    }
    const setL = explicitMcqSetLetter !== undefined ? explicitMcqSetLetter : this.selectedMcqSetLetter;
    if (!this.selectionHasCreativeType() && this.selectionHasMcqType()) {
      return this.composeMcqPersistHeaderFromTextarea(base, setL);
    }
    /** Creative / merged creative: subject+(সৃজনশীল) is textarea line 3 (index 2); do not append again. */
    const parts = [base, this.paperHeaderLine4Plain(0, setL)];
    if (this.selectionHasBothHeaderTypes() && !this.mixedTypesSinglePageMergedHeader) {
      parts.push(this.paperHeaderLine3Text(1), this.paperHeaderLine4Plain(1, setL));
    }
    return parts.filter((p) => !!p).join('\n');
  }

  trackHeaderPreviewLine(index: number, line: string): string {
    return `${index}:${line}`;
  }

  trackCreativeTopLine(index: number, line: string): string {
    return `ct:${index}:${line}`;
  }

  trackCreativeBandLine(index: number, line: string): string {
    return `cb:${index}:${line}`;
  }

  onHeaderEiinInput(value: string): void {
    this.instituteLookupError = '';
    this.eiinSearchSubject.next(value ?? '');
    this.schedulePersistCreatorStateToLocalStorage();
  }

  private defaultHeaderInstituteForEiin(eiinRaw?: string): InstituteHeaderSummary {
    const eiin = (eiinRaw ?? '').trim() || this.headerEiin || QuestionCreatorComponent.HEADER_EIIN_DEFAULT;
    return {
      eiinNo: eiin,
      instituteNameBn: QuestionCreatorComponent.HEADER_INSTITUTE_DEFAULT_NAME,
      districtNameBn: QuestionCreatorComponent.HEADER_INSTITUTE_DEFAULT_DISTRICT,
      instituteName: QuestionCreatorComponent.HEADER_INSTITUTE_DEFAULT_NAME,
      districtName: QuestionCreatorComponent.HEADER_INSTITUTE_DEFAULT_DISTRICT,
    };
  }

  /** Debounced live search (same idea as /institutes search bar). */
  private initEiinLiveSearch(): void {
    this.eiinSearchSub = this.eiinSearchSubject
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((raw) => {
          const q = (raw ?? '').trim();
          if (!q) {
            this.instituteLookupLoading = false;
            return of({ kind: 'clear' as const });
          }
          this.instituteLookupLoading = true;
          this.cdr.markForCheck();
          return this.apiService.searchInstitutesByQuery(q, 1).pipe(
            map((res) => ({ kind: 'result' as const, q, res })),
            catchError(() => of({ kind: 'error' as const })),
            finalize(() => {
              this.instituteLookupLoading = false;
              this.cdr.markForCheck();
            })
          );
        })
      )
      .subscribe((out) => {
        if (out.kind === 'clear') {
          this.headerInstitute = this.defaultHeaderInstituteForEiin(this.headerEiin);
          this.instituteLookupError = '';
          this.headerUseLegacyQuestionHeader = false;
          this.rebuildQuestionHeader();
          this.onPreviewLayoutChange();
          return;
        }
        if (out.kind === 'error') {
          this.instituteLookupError = '';
          this.headerInstitute = this.defaultHeaderInstituteForEiin(this.headerEiin);
          this.onHeaderMetaChange();
          return;
        }
        const row = out.res.results?.[0] as Record<string, unknown> | undefined;
        if (!row) {
          this.headerInstitute = null;
          this.instituteLookupError = 'No institute found for this EIIN.';
          this.onHeaderMetaChange();
          return;
        }
        this.headerInstitute = {
          eiinNo: row['eiinNo'] != null ? String(row['eiinNo']) : out.q,
          instituteNameBn:
            row['instituteNameBn'] != null ? String(row['instituteNameBn']) : undefined,
          districtNameBn: row['districtNameBn'] != null ? String(row['districtNameBn']) : undefined,
          instituteName: row['instituteName'] != null ? String(row['instituteName']) : undefined,
          districtName: row['districtName'] != null ? String(row['districtName']) : undefined,
        };
        this.instituteLookupError = '';
        this.headerUseLegacyQuestionHeader = false;
        this.rebuildQuestionHeader();
        this.onPreviewLayoutChange();
      });
  }

  private clampHeaderLineFontPx(n: number): number {
    return Math.max(
      QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX,
      Math.min(QuestionCreatorComponent.HEADER_LINE_FONT_MAX_PX, Math.round(n))
    );
  }

  /**
   * Default px for header textarea line index (0-based).
   *
   * Reset rule (requested):
   * - Line 1: 18px
   * - Last line (CQ-only or MCQ-only): 10px
   * - Last two lines (mixed CQ+MCQ): 10px
   * - All other lines: 14px
   */
  private defaultHeaderFontPxForLineIndex(i: number): number {
    if (i === 0) return 18;
    return 12;
  }

  /** True when this header row is the ICT subject line (plain or with (সৃজনশীল)). */
  private isHeaderLineIctSubjectDefaultText(line: string): boolean {
    let t = (line ?? '').trim();
    t = t.replace(/\s*\(সৃজনশীল\)\s*$/u, '').trim();
    return t === QuestionCreatorComponent.HEADER_ICT_SUBJECT_LINE_BN;
  }

  /** MCQ title line — 21px default whenever this exact text appears in the header editor. */
  private isHeaderLineMcqTitleBn(line: string): boolean {
    return (line ?? '').trim() === QuestionCreatorComponent.HEADER_MCQ_TITLE_LINE_BN;
  }

  /**
   * Default px for a line when no override is stored.
   * Uses the "Reset all Header text size" rule described above.
   */
  private defaultHeaderFontPxForLineFromContent(i: number): number {
    const lines = this.getHeaderEditorLinesRaw();
    const n = Math.max(1, lines.length);
    const mixed = this.selectionHasBothHeaderTypes();

    if (i === 0) return 18;
    if (mixed && i >= n - 2) return 10;
    if (!mixed && i === n - 1) return 10;
    return 12;
  }

  /**
   * When shrinking fonts to fit within 2 pages, do not shrink any header line below 14px
   * if that line's default is already above 14px (e.g. 24/18/21). Lines whose defaults
   * are <= 14px may still shrink down to the global minimum.
   */
  private minHeaderFontPxWhileFittingTwoPages(i: number): number {
    const def = this.defaultHeaderFontPxForLineFromContent(i);
    return def > 12 ? 12 : QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX;
  }

  /** Grow/shrink `headerLineFontSizes` to match editable lines + optional auto subject/meta lines (3–4). */
  syncHeaderFontSizesToLineCount(): void {
    const base = this.headerPreviewLines.length;
    let n = base;
    if (this.paperSubjectMetaLinesEligible()) {
      if (this.selectionHasCreativeType() && !this.selectionHasMcqType()) {
        n = base + 1;
      } else if (!this.selectionHasCreativeType() && this.selectionHasMcqType()) {
        n = base;
      } else if (this.selectionHasBothHeaderTypes()) {
        n = Math.max(base + 2, 6 + Math.max(0, base - 4));
      } else {
        n = base + 2;
      }
    }
    const a = this.headerLineFontSizes;
    while (a.length < n) {
      a.push(this.clampHeaderLineFontPx(this.defaultHeaderFontPxForLineFromContent(a.length)));
    }
    if (a.length > n) {
      a.length = n;
    }
    const editorLines = this.getHeaderEditorLinesRaw();
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      let useDefault = typeof v !== 'number' || !Number.isFinite(v);
      const line = i < editorLines.length ? (editorLines[i] ?? '') : '';
      if (
        !useDefault &&
        this.selectionHasCreativeType() &&
        !this.selectionHasMcqType() &&
        this.parseCreativeSqCombinedDisplayParts(line) != null &&
        v === QuestionCreatorComponent.HEADER_LINE3_FONT_DEFAULT_PX
      ) {
        /** Was treated like line-3 body (21px); creative combined সময়+পূর্ণমান default is now 14px. */
        useDefault = true;
      }
      if (
        !useDefault &&
        this.mcqOnlyUsesSixLineTextareaBlock() &&
        i === 3 &&
        v === QuestionCreatorComponent.HEADER_CREATIVE_SQ_META_COMBINED_FONT_DEFAULT_PX
      ) {
        /** Stale 14px from creative-only rule or persist — MCQ-only line 4 is ICT @ 21px. */
        useDefault = true;
      }
      a[i] = this.clampHeaderLineFontPx(useDefault ? this.defaultHeaderFontPxForLineFromContent(i) : v);
    }
  }

  trackHeaderEditorLineIndex(index: number, _line: string): number {
    return index;
  }

  /**
   * Lines for structured header editor: split on newline, drop &lt;hr&gt; rows only.
   * Blank physical lines may still exist in storage; {@link getHeaderEditorSidebarRows} hides them in the sidebar.
   */
  getHeaderEditorLinesRaw(): string[] {
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n');
    if (raw === '') return [];
    return raw.split('\n').filter((ln) => !((ln ?? '').trim().toLowerCase().includes('<hr')));
  }

  /** 0-based index in `questionHeader` split for the i-th row of {@link getHeaderEditorLinesRaw}, or -1. */
  private previewLineIndexForFilteredEditorLine(filteredIndex: number): number {
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n').split('\n');
    let fi = 0;
    for (let pi = 0; pi < raw.length; pi++) {
      const ln = raw[pi] ?? '';
      if (ln.trim().toLowerCase().includes('<hr')) continue;
      if (fi === filteredIndex) return pi;
      fi++;
    }
    return -1;
  }

  /**
   * Inverse: `headerLineFontSizes` / sidebar `modelIndex` use filtered-editor indices (see {@link getHeaderEditorLinesRaw}),
   * not raw `headerPreviewLines` indices. Map a physical preview line index to that font slot.
   */
  private filteredEditorIndexForPreviewLineIndex(previewLineIndex: number): number {
    const raw = (this.questionHeader || '').replace(/\r\n/g, '\n').split('\n');
    let fi = 0;
    for (let pi = 0; pi < raw.length; pi++) {
      const ln = raw[pi] ?? '';
      if (ln.trim().toLowerCase().includes('<hr')) continue;
      if (pi === previewLineIndex) return fi;
      fi++;
    }
    return -1;
  }

  /**
   * Sidebar rows: same strings as {@link getHeaderEditorLinesRaw}, except the unified mixed
   * plain বিষয় কোড row (not duplicated here — grids handle it). Rows with only whitespace are
   * hidden; clearing a line in the UI removes it from the model (see {@link onHeaderEditorLineChange}).
   * If nothing would show, a single empty line 0 is offered so the user can type.
   */
  getHeaderEditorSidebarRows(): { modelIndex: number; text: string }[] {
    const all = this.getHeaderEditorLinesRaw();
    const out: { modelIndex: number; text: string }[] = [];
    for (let i = 0; i < all.length; i++) {
      if (this.mixedBothTypesUseUnifiedCodeGridLine()) {
        if (this.headerLineIsUnifiedMixedPlainCodeRow(all[i] ?? '')) {
          continue;
        }
      }
      if (!(all[i] ?? '').trim()) {
        continue;
      }
      out.push({ modelIndex: i, text: all[i] ?? '' });
    }
    if (out.length === 0) {
      return [{ modelIndex: 0, text: '' }];
    }
    return out;
  }

  trackHeaderEditorSidebarRow(_i: number, row: { modelIndex: number }): number {
    return row.modelIndex;
  }

  private commitHeaderEditorLines(lines: string[]): void {
    if (lines.length === 1 && lines[0] === '') {
      this.questionHeader = '';
    } else {
      this.questionHeader = lines.join('\n');
    }
  }

  headerEditorLineShowsFontControls(line: string): boolean {
    return (line ?? '').trim().length > 0;
  }

  headerLineFontPxForEditorLine(index: number): number {
    this.syncHeaderFontSizesToLineCount();
    const v = this.headerLineFontSizes[index];
    return this.clampHeaderLineFontPx(
      typeof v === 'number' && Number.isFinite(v) ? v : this.defaultHeaderFontPxForLineFromContent(index)
    );
  }

  /** Focus header line inputs without inserting rows; blocks auto header sync until EIIN/exam rebuild. */
  onHeaderEditorLineFocus(): void {
    this.headerManualEditSinceRebuild = true;
  }

  /** Move focus to the next/previous visible sidebar row (same model as {@link getHeaderEditorSidebarRows}). */
  private focusAdjacentHeaderEditorSidebar(modelIndex: number, delta: 1 | -1): void {
    const rows = this.getHeaderEditorSidebarRows();
    const cur = rows.findIndex((r) => r.modelIndex === modelIndex);
    if (cur < 0) {
      return;
    }
    const target = rows[cur + delta];
    if (!target) {
      return;
    }
    queueMicrotask(() => {
      this.cdr.detectChanges();
      this.focusHeaderEditorInput(target.modelIndex);
    });
  }

  onHeaderEditorLineChange(index: number, value: string): void {
    const lines = [...this.getHeaderEditorLinesRaw()];
    while (lines.length <= index) lines.push('');
    const normalized = QuestionCreatorComponent.normalizeHeaderLineRawForPreview(value);
    if (!normalized.trim()) {
      if (lines.length > 1) {
        lines.splice(index, 1);
        this.headerManualEditSinceRebuild = true;
        this.commitHeaderEditorLines(lines.length ? lines : ['']);
        this.onPreviewLayoutChange();
        queueMicrotask(() => {
          this.cdr.detectChanges();
          this.focusHeaderEditorInput(Math.max(0, index - 1));
        });
        return;
      }
      lines[0] = '';
      this.headerManualEditSinceRebuild = true;
      this.commitHeaderEditorLines(lines);
      this.onPreviewLayoutChange();
      return;
    }
    lines[index] = normalized;
    this.headerManualEditSinceRebuild = true;
    this.commitHeaderEditorLines(lines);
    this.onPreviewLayoutChange();
  }

  onHeaderEditorLineKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.headerManualEditSinceRebuild = true;
      this.focusAdjacentHeaderEditorSidebar(index, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const lines = this.getHeaderEditorLinesRaw();
      if (lines[index] !== '') return;
      if (lines.length <= 1) return;
      event.preventDefault();
      const next = [...lines];
      next.splice(index, 1);
      this.headerManualEditSinceRebuild = true;
      this.commitHeaderEditorLines(next.length ? next : ['']);
      this.onPreviewLayoutChange();
      queueMicrotask(() => {
        this.cdr.detectChanges();
        this.focusHeaderEditorInput(Math.max(0, index - 1));
      });
    }
  }

  private focusHeaderEditorInput(modelIndex: number): void {
    const arr = this.headerLineEditorInputs?.toArray();
    const vis = this.getHeaderEditorSidebarRows().findIndex((r) => r.modelIndex === modelIndex);
    if (vis >= 0) {
      arr?.[vis]?.nativeElement?.focus?.();
    }
  }

  /** Per-line ± in header editor: adjust size and show centered px toast on that row. */
  onHeaderLineFontAdjustInEditor(index: number, delta: -1 | 1, event: MouseEvent): void {
    if (delta < 0) this.decHeaderLineFontAt(index);
    else this.incHeaderLineFontAt(index);
    const row = (event.currentTarget as HTMLElement | null)?.closest('.header-line-editor-row');
    const r = row?.getBoundingClientRect();
    if (r) {
      this.headerLineFontToastLeft = Math.round(r.left + r.width / 2);
      this.headerLineFontToastTop = Math.round(r.top + r.height / 2);
    } else {
      this.headerLineFontToastLeft = 0;
      this.headerLineFontToastTop = 0;
    }
    this.headerLineFontToastText = `${this.headerLineFontPxForEditorLine(index)}px`;
    this.headerLineFontToastVisible = true;
    this.cdr.markForCheck();
    if (this.headerLineFontToastTimer != null) clearTimeout(this.headerLineFontToastTimer);
    this.headerLineFontToastTimer = window.setTimeout(() => {
      this.headerLineFontToastTimer = null;
      this.headerLineFontToastVisible = false;
      this.cdr.markForCheck();
    }, 700);
  }

  decHeaderLineFontAt(index: number): void {
    this.syncHeaderFontSizesToLineCount();
    if (index < 0 || index >= this.headerLineFontSizes.length) return;
    const v = this.headerLineFontSizes[index]!;
    if (v <= QuestionCreatorComponent.HEADER_LINE_FONT_MIN_PX) return;
    this.headerLineFontSizes[index] = v - 1;
    this.onPreviewLayoutChange();
  }

  incHeaderLineFontAt(index: number): void {
    this.syncHeaderFontSizesToLineCount();
    if (index < 0 || index >= this.headerLineFontSizes.length) return;
    const v = this.headerLineFontSizes[index]!;
    if (v >= QuestionCreatorComponent.HEADER_LINE_FONT_MAX_PX) return;
    this.headerLineFontSizes[index] = v + 1;
    this.onPreviewLayoutChange();
  }

  private buildPersistPayload(): Record<string, unknown> {
    const questionQids = this.questions
      .map((q) => q?.qid)
      .filter((id): id is string | number => id != null && id !== '');
    return {
      v: QUESTION_CREATOR_PAYLOAD_VERSION,
      savedAt: Date.now(),
      questionQids,
      // Include full rows so reload can render real question text even if API hydration fails.
      questions: this.questions,
      context: this.context,
      questionHeader: this.questionHeader,
      ...this.buildLayoutSettingsForPersist(),
    };
  }

  /**
   * Online customer settings: layout + header template + context only — no question id references
   * (saved sets appear on `/created-questions` from the API).
   */
  private buildRemoteCustomerSettingsPayload(): Record<string, unknown> {
    let firstVisitDone = false;
    try {
      firstVisitDone = !!localStorage.getItem(QUESTION_CREATOR_FIRST_VISIT_RESET_KEY);
    } catch (_) {
      /* */
    }
    return {
      v: QUESTION_CREATOR_PAYLOAD_VERSION,
      savedAt: Date.now(),
      settingsOnly: true,
      questionQids: [] as (string | number)[],
      creatorFirstVisitResetDone: firstVisitDone,
      context: this.context,
      questionHeader: this.questionHeader,
      ...this.buildLayoutSettingsForPersist(),
    };
  }

  private persistCreatorStateToLocalStorage(): void {
    try {
      localStorage.setItem(
        QUESTION_CREATOR_LOCAL_STORAGE_KEY,
        JSON.stringify(this.buildPersistPayload())
      );
    } catch (_) {
      /* quota / private mode */
    }
    this.schedulePersistCreatorStateToRemote();
  }

  private schedulePersistCreatorStateToRemote(): void {
    if (!this.apiService.getToken()) {
      return;
    }
    if (this.remotePersistTimer != null) {
      clearTimeout(this.remotePersistTimer);
    }
    this.remotePersistTimer = window.setTimeout(() => {
      this.remotePersistTimer = null;
      const json = JSON.stringify(this.buildRemoteCustomerSettingsPayload());
      this.apiService
        .updateCustomerSettings({ [CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY]: json })
        .subscribe({ next: () => {}, error: () => {} });
    }, QuestionCreatorComponent.REMOTE_CREATOR_PERSIST_DEBOUNCE_MS);
  }

  /**
   * Restore page/layout/MCQ-order defaults and rebuild the structured header from the current institute,
   * subject, and question selection (e.g. 7-line mixed template). Keeps the active draft (questions,
   * context, EIIN, institute, exam type). Persists (no full page reload from the Reset button).
   */
  /** Reset / Auto Fit button: show aside loader (page-load style), run reset, wait for layout to settle. */
  async onResetCreatorSettingsClick(): Promise<void> {
    if (this.resetAutoFitOverlayVisible) return;
    this.resetAutoFitOverlayVisible = true;
    this.resetAutoFitOverlayPercent = 10;
    this.cdr.markForCheck();
    this.scheduleResetAutoFitProgressTick();
    try {
      this.resetCreatorSettings({ forceAutoFit: true });
      await this.waitForLayoutIdle();
    } catch {
      /* layout timeout — still hide overlay; drop forced auto-fit so later layouts stay exam-gated */
      // Prevent `previewAutoFitForceOneLayoutChain` from staying true if reset never reached a stable paginatedPages.
      this.previewAutoFitForceOneLayoutChain = false;
    }
    this.clearResetAutoFitProgressTimer();
    this.resetAutoFitOverlayPercent = 100;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.resetAutoFitOverlayVisible = false;
      if (!this.autoFitBlockingOverlayVisible) {
        this.resetAutoFitOverlayPercent = 0;
      }
      this.cdr.markForCheck();
    }, 220);
  }

  private clearResetAutoFitProgressTimer(): void {
    if (this.resetAutoFitProgressTimer != null) {
      clearTimeout(this.resetAutoFitProgressTimer);
      this.resetAutoFitProgressTimer = null;
    }
  }

  private resetAutoFitFakeNextPercent(p: number): number {
    if (p < 50) return Math.min(50, p + 5);
    if (p < 60) return Math.min(60, p + 4);
    if (p < 70) return Math.min(70, p + 3);
    if (p < 80) return Math.min(80, p + 2);
    return Math.min(99, p + 1);
  }

  private scheduleResetAutoFitProgressTick(): void {
    this.clearResetAutoFitProgressTimer();
    if (!this.autoFitBlockingOverlayVisible) {
      this.resetAutoFitOverlayPercent = 0;
      return;
    }
    if (this.resetAutoFitOverlayPercent >= 99) return;
    this.resetAutoFitProgressTimer = setTimeout(() => {
      this.resetAutoFitProgressTimer = null;
      if (!this.autoFitBlockingOverlayVisible) {
        this.resetAutoFitOverlayPercent = 0;
        this.cdr.markForCheck();
        return;
      }
      this.resetAutoFitOverlayPercent = this.resetAutoFitFakeNextPercent(this.resetAutoFitOverlayPercent);
      this.cdr.markForCheck();
      this.scheduleResetAutoFitProgressTick();
    }, 500);
  }

  /** When exam allows auto-fit, keep stepped % ring in sync for layout-triggered overlays (not only Reset). */
  private maybeBootstrapAutoFitOverlayProgress(): void {
    if (!this.examTypeKeyIsFirstThreeExamOptions(this.headerExamTypeKey)) return;
    if (this.resetAutoFitOverlayVisible) return;
    if (this.resetAutoFitOverlayPercent < 10) {
      this.resetAutoFitOverlayPercent = 10;
    }
    this.scheduleResetAutoFitProgressTick();
  }

  /**
   * Restore layout/header defaults. Pass `{ skipReload: true }` to avoid `window.location.reload()` (default for the Reset Setting button).
   * Pass `{ skipReload: false }` only if a full reload is explicitly required after remote sync.
   * `skipRemotePersist`: first-visit flow sets the local “reset done” flag then persists remote once.
   * `forceAutoFit`: Reset Settings button — run the same auto-fit chain as first-three exams even for other exam names.
   */
  resetCreatorSettings(options?: { skipReload?: boolean; skipRemotePersist?: boolean; forceAutoFit?: boolean }): void {
    /** Default true: avoid full page reload; pass `{ skipReload: false }` to reload after remote sync (legacy). */
    const skipReload = options?.skipReload !== false;
    const skipRemotePersist = !!options?.skipRemotePersist;
    if (options?.forceAutoFit) {
      // Reset button: next layout(s) may run full auto-fit even for non–first-three exam names until chain completes.
      this.previewAutoFitForceOneLayoutChain = true;
    }
    if (this.remotePersistTimer != null) {
      clearTimeout(this.remotePersistTimer);
      this.remotePersistTimer = null;
    }
    try {
      localStorage.removeItem(QUESTION_CREATOR_LOCAL_STORAGE_KEY);
      sessionStorage.removeItem(QUESTION_CREATOR_STATE_KEY);
    } catch (_) {}
    this.applyCreatorLayoutFactoryDefaults();
    this.questionHeader = '';
    if (!this.headerUseLegacyQuestionHeader) {
      this.rebuildQuestionHeader();
      this.onPreviewLayoutChange({ suppressAutoFit: false });
    } else {
      this.syncHeaderFontSizesToLineCount();
    }
    this.scheduleLayout();
    queueMicrotask(() => this.updatePreviewFitScale());
    try {
      localStorage.setItem(
        QUESTION_CREATOR_LOCAL_STORAGE_KEY,
        JSON.stringify(this.buildPersistPayload())
      );
    } catch (_) {}
    const remoteJson = JSON.stringify(this.buildRemoteCustomerSettingsPayload());
    if (skipReload) {
      if (!skipRemotePersist && this.apiService.getToken()) {
        this.apiService
          .updateCustomerSettings({ [CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY]: remoteJson })
          .subscribe({ next: () => {}, error: () => {} });
      }
      this.cdr.markForCheck();
      return;
    }
    const reloadAfterReset = (): void => {
      window.location.reload();
    };
    if (!skipRemotePersist && this.apiService.getToken()) {
      this.apiService
        .updateCustomerSettings({ [CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY]: remoteJson })
        .subscribe({ next: reloadAfterReset, error: reloadAfterReset });
    } else {
      reloadAfterReset();
    }
  }

  /**
   * Layout, margins, per-line font overrides, and MCQ header/order extras — does not clear questions,
   * context, institute, EIIN, or exam type (those stay so the header template can be rebuilt).
   */
  private applyCreatorLayoutFactoryDefaults(): void {
    this.headerUseLegacyQuestionHeader = false;
    this.instituteLookupError = '';
    this.instituteLookupLoading = false;
    this.headerLineFontSizes = [];
    const preserveMcqSetLetter =
      this.smartCreatorNavHeader != null &&
      this.smartCreatorNavHeader.mcqSetLetter != null &&
      (QuestionCreatorComponent.MCQ_SET_LETTERS as readonly string[]).includes(
        this.smartCreatorNavHeader.mcqSetLetter as string
      );
    if (!preserveMcqSetLetter) {
      this.selectedMcqSetLetter = null;
    }
    this.mcqPreviewShuffleNonce = 0;
    this.mcqOrdersFrozen = false;
    this.persistedMcqOrderBySet = {};
    this.questionHeaderByMcqSet = {};
    this.pageSize = 'A4';
    this.pageOrientation = 'portrait';
    this.cqPageOrientation = 'landscape';
    this.mcqPageOrientation = 'portrait';
    this.customPageWidthIn = QuestionCreatorComponent.a4WidthInDefault();
    this.customPageHeightIn = QuestionCreatorComponent.a4HeightInDefault();
    this.marginPreset = 'narrow';
    this.marginTop = 12.7;
    this.marginRight = 12.7;
    this.marginBottom = 12.7;
    this.marginLeft = 12.7;
    this.questionsPadding = QuestionCreatorComponent.QUESTIONS_PADDING_DEFAULT_PX;
    this.questionsGap = QuestionCreatorComponent.QUESTIONS_GAP_MCQ_DEFAULT_PX;
    this.questionsGapCreative = QuestionCreatorComponent.QUESTIONS_GAP_CQ_DEFAULT_PX;
    this.previewQuestionsFontPx = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_DEFAULT_PX;
    this.previewQuestionsFontPxCreative = this.previewQuestionsFontPx;
    this.previewQuestionsFontPxMcq = this.previewQuestionsFontPx;
    this.layoutColumns = 2;
    this.layoutColumnsCreative = 2;
    this.layoutColumnGapPx = 12;
    this.showColumnDivider = false;
    this.optionsColumns = 2;
    this.previewHeaderLineHeight = QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT;
    this.previewQuestionsLineHeight = QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT;
    this.previewQuestionsLineHeightCreative = this.previewQuestionsLineHeight;
    this.previewQuestionsLineHeightMcq = this.previewQuestionsLineHeight;
    this.pageSections = 1;
    this.sectionGapPx = 24;
    this.mixedTypesSinglePageMergedHeader = false;
    this.previewFitScale = 0.5;
    this.magnifierActive = false;
    this.showExportFormatDialog = false;
    this.saveSuccessMessage = '';
  }

  /** Writes localStorage immediately so a reload always sees the latest settings (remote stays debounced). */
  private schedulePersistCreatorStateToLocalStorage(): void {
    if (this.creatorBootstrapPending || this.questionQidsHydrationInFlight) {
      return;
    }
    this.persistCreatorStateToLocalStorage();
  }

  /** Keep legacy/global pageOrientation aligned with MCQ orientation. */
  private syncPageOrientationForQTypeFilter(): void {
    this.pageOrientation = this.mcqPageOrientation;
  }

  /**
   * Central “something about the sheet preview changed” hook: bump layout generation id, reset in-flight auto-fit
   * expand/tighten state, optionally arm {@link previewAutoFitSuppressNextLayoutRun}, then queue {@link scheduleLayout}.
   *
   * **`suppressAutoFit` option (default `true`)** — `true`: next `runLayout` for first-three exams skips auto-fit
   * mutations once (see {@link previewAutoFitSuppressNextLayoutRun}). `false`: allow auto-fit on the next pass
   * (margins, reset, exam change to first-three, Smart save, etc.).
   */
  onPreviewLayoutChange(options?: { suppressAutoFit?: boolean }): void {
    // Caller passes `false` only when the next pagination should be allowed to auto-adjust (see JSDoc above).
    const suppress = options?.suppressAutoFit ?? true;
    // Bumped on every preview-affecting UI change so font grow/revert logic can correlate attempts (MCQ/CQ).
    this.previewLayoutChangeSeq++;
    // Restart the “tighten padding then header line fonts” round-robin from step 0 after any manual layout change.
    this.autoFitRegularLayoutTightenStep = 0;
    // Restart gap/LH expand rotation and cancel any in-flight bump — old pending values would be stale vs new layout.
    this.autoFitExpandPhase = 0;
    this.autoFitExpandPending = null;
    this.autoFitExpandStepBlocked.clear();
    // Cancel tentative paper-header line-height bump; user changed something else — validate fresh next time.
    this.autoFitHeaderLineHeightPending = null;
    this.autoFitHeaderLineHeightGrowBlocked = false;
    if (suppress) {
      // Typical path: sliders, fonts, columns — keep current numbers for one layout pass before auto-fit may run again.
      this.previewAutoFitSuppressNextLayoutRun = true;
    } else {
      // Explicit “run auto-fit if exam allows” (e.g. margins, reset, exam meta) — do not skip the next mutation pass.
      this.previewAutoFitSuppressNextLayoutRun = false;
    }
    this.ensureMcqTextareaSixUpperLines();
    this.runHeaderTextareaSyncs();
    this.syncHeaderFontSizesToLineCount();
    this.scheduleLayout();
    queueMicrotask(() => this.updatePreviewFitScale());
    this.schedulePersistCreatorStateToLocalStorage();
  }

  decLayoutColumns(): void {
    if (this.layoutColumns <= QuestionCreatorComponent.LAYOUT_COLUMNS_MIN) return;
    this.layoutColumns--;
    this.onPreviewLayoutChange();
  }

  incLayoutColumns(): void {
    if (this.layoutColumns >= QuestionCreatorComponent.LAYOUT_COLUMNS_MAX) return;
    this.layoutColumns++;
    this.onPreviewLayoutChange();
  }

  /** Manual column count: clamp 1–10 and refresh preview. */
  onLayoutColumnsInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
      Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, n)
    );
    if (c !== this.layoutColumns) {
      this.layoutColumns = c;
    }
    this.onPreviewLayoutChange();
  }

  onLayoutColumnsBlur(): void {
    const n = Math.floor(Number(this.layoutColumns));
    if (!Number.isFinite(n)) {
      this.layoutColumns = QuestionCreatorComponent.LAYOUT_COLUMNS_MIN;
    } else {
      this.layoutColumns = Math.max(
        QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
        Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decLayoutColumnsCreative(): void {
    if (this.layoutColumnsCreative <= QuestionCreatorComponent.LAYOUT_COLUMNS_MIN) return;
    this.layoutColumnsCreative--;
    this.onPreviewLayoutChange();
  }

  incLayoutColumnsCreative(): void {
    if (this.layoutColumnsCreative >= QuestionCreatorComponent.LAYOUT_COLUMNS_MAX) return;
    this.layoutColumnsCreative++;
    this.onPreviewLayoutChange();
  }

  onLayoutColumnsCreativeInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
      Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, n)
    );
    if (c !== this.layoutColumnsCreative) {
      this.layoutColumnsCreative = c;
    }
    this.onPreviewLayoutChange();
  }

  onLayoutColumnsCreativeBlur(): void {
    const n = Math.floor(Number(this.layoutColumnsCreative));
    if (!Number.isFinite(n)) {
      this.layoutColumnsCreative = QuestionCreatorComponent.LAYOUT_COLUMNS_MIN;
    } else {
      this.layoutColumnsCreative = Math.max(
        QuestionCreatorComponent.LAYOUT_COLUMNS_MIN,
        Math.min(QuestionCreatorComponent.LAYOUT_COLUMNS_MAX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  /** True if either MCQ or CQ column count is > 1 (show column gap control). */
  get multiColumnPreviewActive(): boolean {
    return this.layoutColumns > 1 || this.layoutColumnsCreative > 1;
  }

  /**
   * Column count for pagination + preview for this 0-based sheet page index.
   * Creative header pages use {@link layoutColumnsCreative}; MCQ pages use {@link layoutColumns}.
   */
  layoutColumnsForSheetPage(pageIndex: number): number {
    if (!this.paperSubjectMetaLinesEligible() || this.headerUseLegacyQuestionHeader) {
      return Math.max(1, Math.floor(this.layoutColumns));
    }
    const v = this.previewKindForSheetPage(pageIndex);
    const raw = v === 'creative' ? this.layoutColumnsCreative : this.layoutColumns;
    return Math.max(1, Math.floor(raw));
  }

  /** Sheet is landscape in preview when the page’s CQ/MCQ orientation is landscape. */
  landscapeSheetPageForPreview(pageIndex: number): boolean {
    const kind = this.previewKindForSheetPage(pageIndex);
    return (kind === 'creative' ? this.cqPageOrientation : this.mcqPageOrientation) === 'landscape';
  }

  /**
   * Content kind on this sheet page: CQ, MCQ, or other (from first question on the page).
   */
  sheetPreviewKindKey(pageIndex: number): 'creative' | 'mcq' | 'other' {
    const page = this.paginatedPages[pageIndex];
    if (!page?.items?.length) {
      if (this.selectionHasBothHeaderTypes() && !this.mixedTypesSinglePageMergedHeader) {
        return this.headerVariantForPage(pageIndex);
      }
      if (this.selectionHasCreativeType() && !this.selectionHasMcqType()) {
        return 'creative';
      }
      if (this.selectionHasMcqType() && !this.selectionHasCreativeType()) {
        return 'mcq';
      }
      return 'other';
    }
    const q0 = page.items[0]!.q;
    if (this.questionIsCreativeType(q0)) {
      return 'creative';
    }
    if (this.questionIsMcqType(q0)) {
      return 'mcq';
    }
    return 'other';
  }

  /**
   * Paper dimensions for preview follow the first question on the sheet (same basis as {@link paginationInnerHeightPx}).
   * {@link headerVariantForPage} only selects which header block is drawn; do not use it for sheet size.
   * CQ/MCQ sheets use {@link previewBottomMarginMmForKind} for preview bottom padding (same as {@link marginBottom}).
   */
  private previewKindForSheetPage(pageIndex: number): 'creative' | 'mcq' {
    const k = this.sheetPreviewKindKey(pageIndex);
    if (k === 'creative' || k === 'mcq') {
      return k;
    }
    return this.headerVariantForPage(pageIndex);
  }

  /** Preview/pagination bottom (mm): persisted margin only (no extra inset for CQ vs MCQ). */
  private previewBottomMarginMmForKind(_kind: 'creative' | 'mcq'): number {
    return this.marginBottom;
  }

  /** How many sheets share {@link sheetPreviewKindKey} with this page. */
  sheetPageCountForSameKind(pageIndex: number): number {
    const pages = this.paginatedPages;
    if (!pages?.length || pageIndex < 0 || pageIndex >= pages.length) {
      return 0;
    }
    const key = this.sheetPreviewKindKey(pageIndex);
    let n = 0;
    for (let i = 0; i < pages.length; i++) {
      if (this.sheetPreviewKindKey(i) === key) {
        n++;
      }
    }
    return n;
  }

  /** Kind of the first item on a sheet; {@link countKindsInCandidatePages} increments one bucket per page from this key. */
  private sheetKindKeyFromPreviewPage(page: PreviewPage | undefined): 'creative' | 'mcq' | 'other' {
    const q0 = page?.items?.[0]?.q;
    if (!q0) return 'other';
    if (this.questionIsCreativeType(q0)) return 'creative';
    if (this.questionIsMcqType(q0)) return 'mcq';
    return 'other';
  }

  private shouldUseLeadEmptyFirstColumnFromPages(pages: PreviewPage[]): boolean {
    if (pages.length <= 1) return false;
    if (Math.max(1, Math.floor(this.layoutColumnsForSheetPage(0))) <= 1) return false;
    if (!this.landscapeSheetPageForPreview(0)) return false;
    const k0 = this.sheetKindKeyFromPreviewPage(pages[0]);
    let n = 0;
    for (const p of pages) {
      if (this.sheetKindKeyFromPreviewPage(p) === k0) n++;
    }
    return n > 1;
  }

  /**
   * Lead-empty binding behavior:
   * Move the last page of the same kind’s column-2 contents into the first page’s lead binding column.
   * If the last page’s column 2 is empty, use column 1 instead.
   *
   * Only implemented for `pageSections <= 1` (single vertical section).
   */
  private applyLeadEmptyMoveLastPageColumnToFirstBinding(pages: PreviewPage[]): void {
    if (!this.leadEmptyFirstPageActive) return;
    if (this.pageSections > 1) return;
    if (pages.length <= 1) return;

    const first = pages[0];
    const k0 = this.sheetKindKeyFromPreviewPage(first);
    if (!k0) return;

    let lastSameKindIndex = -1;
    for (let i = pages.length - 1; i >= 0; i--) {
      if (this.sheetKindKeyFromPreviewPage(pages[i]) === k0) {
        lastSameKindIndex = i;
        break;
      }
    }
    if (lastSameKindIndex <= 0) return;

    const last = pages[lastSameKindIndex];
    const qCols = last.questionColumns ?? [];
    if (!qCols.length) return;

    const col2 = qCols[1];
    const chosenColIndex = col2 && col2.length > 0 ? 1 : qCols[0] && qCols[0].length > 0 ? 0 : -1;
    if (chosenColIndex < 0) return;

    const moved = (qCols[chosenColIndex] ?? []).slice();
    if (!moved.length) return;

    first.leadBindingItems = moved;

    const movedSet = new Set<number>(moved.map((it) => it.index));
    last.questionColumns = qCols.map((c, idx) => (idx === chosenColIndex ? [] : c));
    last.items = last.items.filter((it) => !movedSet.has(it.index));

    // If the chosen column represented the last visible content, remove the now-empty page.
    if (last.items.length === 0) {
      pages.splice(lastSameKindIndex, 1);
    }
  }

  /**
   * Sheet counts for auto-fit policy: each page is classified once by {@link sheetKindKeyFromPreviewPage}
   * (first question on that page only). `creative` ≈ CQ sheets, `mcq` ≈ MCQ sheets; used by autoFitExpandLayoutOk.
   */
  private countKindsInCandidatePages(pages: PreviewPage[]): { creative: number; mcq: number; other: number } {
    let creative = 0;
    let mcq = 0;
    let other = 0;
    for (const p of pages) {
      const k = this.sheetKindKeyFromPreviewPage(p);
      if (k === 'creative') creative++;
      else if (k === 'mcq') mcq++;
      else other++;
    }
    return { creative, mcq, other };
  }

  /**
   * When over page budget: tighten shared `questionsPadding` only (MCQ/CQ gaps are adjusted by expand step).
   */
  private maybeAutoFitPerKindSpacingTargets(candidatePages: PreviewPage[]): boolean {
    // Count how many preview sheets contain MCQ vs CQ (from first item per page — see countKindsInCandidatePages).
    const counts = this.countKindsInCandidatePages(candidatePages);
    // Smallest allowed inner padding around the question stack (shared for both kinds in this step).
    const minPad = QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX;

    // If MCQ spills onto more than one sheet, or CQ onto more than two, we are “over budget” for expand rules.
    if (counts.mcq > 1 || counts.creative > 2) {
      // Only shrink padding if there is room above the hard minimum (otherwise this step would do nothing).
      if (this.questionsPadding > minPad) {
        // Reduce shared padding by 1px (clamped to min) to free vertical space without touching per-kind gaps here.
        this.questionsPadding = Math.max(minPad, this.questionsPadding - 1); //  *
        // Re-run layout on the next tick so block heights re-measure with the new padding.
        this.scheduleLayout();
        // Signal runLayout to stop this pass early: another layout cycle will re-enter auto-fit from the top.
        return true;
      }
    }

    // No padding change applied this pass.
    return false;
  }

  /**
   * If a question kind (creative/mcq) spans more than 2 pages, shrink that kind’s question font (8px auto-fit floor).
   */
  private maybeShrinkFontsToFitTwoPagesPerKind(candidatePages: PreviewPage[]): boolean {
    const counts = this.countKindsInCandidatePages(candidatePages);
    // CQ is considered “too tall” for policy when it needs more than two sheets (third sheet appears).
    const creativeNeedsShrink = counts.creative > 2;
    // MCQ is “too tall” when it needs more than one sheet (second MCQ sheet appears).
    const mcqNeedsShrink = counts.mcq > 1;
    const needsShrink = creativeNeedsShrink || mcqNeedsShrink;
    // Nothing to do if both kinds are within their sheet budgets.
    if (!needsShrink) return false;

    // Auto-fit floor for regular (non-header) question body font during shrink passes.
    const minQAuto = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_AUTO_FIT_MIN_REGULAR_PX;

    if (mcqNeedsShrink && this.previewQuestionsFontPxMcq > minQAuto) {
      // Drop MCQ-only body font by 1px toward the floor so more MCQ content fits on fewer sheets.
      this.previewQuestionsFontPxMcq = Math.max(minQAuto, this.previewQuestionsFontPxMcq - 1); //  *
      // Keep legacy `previewQuestionsFontPx` aligned with the per-kind fields for persistence/export.
      this.syncGlobalPreviewQuestionsFontPxFromPerKind();
      this.scheduleLayout();
      return true;
    }
    if (creativeNeedsShrink && this.previewQuestionsFontPxCreative > minQAuto) {
      // Same as MCQ branch but for CQ (creative) body font.
      this.previewQuestionsFontPxCreative = Math.max(minQAuto, this.previewQuestionsFontPxCreative - 1); //  *
      this.syncGlobalPreviewQuestionsFontPxFromPerKind();
      this.scheduleLayout();
      return true;
    }

    // Over budget but already at min font for the kind that still needs shrinking — cannot shrink further here.
    return false;
  }

  /**
   * Question font steps after {@link maybeShrinkFontsToFitTwoPagesPerKind}: shrink when total pages over two
   * (only when a kind exceeds its sheet limit, or single-kind overflow), then grow MCQ/CQ fonts when
   * total pages ≤ 2 (via {@link maybeAutoFitMcqQuestionFontPages} / {@link maybeAutoFitCqQuestionFontPages}).
   * Used only from {@link maybeAutoFitQuestionFontsOnly}.
   */
  private maybeAutoFitRegularPreferOneThenTwo(candidatePages: PreviewPage[]): boolean {
    // Total preview sheet count after splitIntoPages (all kinds combined).
    const pages = candidatePages.length;
    // Minimum font size allowed when stepping down in this “mixed many pages” shrink path.
    const minToTryOne = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_AUTO_FIT_MIN_REGULAR_PX;
    const hasM = this.selectionHasMcqType();
    const hasC = this.selectionHasCreativeType();

    if (pages > 2) {
      if (hasM && hasC) {
        const counts = this.countKindsInCandidatePages(candidatePages);
        if (counts.creative > 2 && this.previewQuestionsFontPxCreative > minToTryOne) {
          // Mixed exam, many total pages: CQ still uses >2 sheets — shrink CQ font one px toward min.
          this.previewQuestionsFontPxCreative = Math.max(minToTryOne, this.previewQuestionsFontPxCreative - 1); //  *
          this.syncGlobalPreviewQuestionsFontPxFromPerKind();
          this.scheduleLayout();
          return true;
        }
        if (counts.mcq > 1 && this.previewQuestionsFontPxMcq > minToTryOne) {
          // Mixed exam, many total pages: MCQ uses >1 sheet — shrink MCQ font one px toward min.
          this.previewQuestionsFontPxMcq = Math.max(minToTryOne, this.previewQuestionsFontPxMcq - 1); //  *
          this.syncGlobalPreviewQuestionsFontPxFromPerKind();
          this.scheduleLayout();
          return true;
        }
        // MCQ≤1 sheet and CQ≤2 sheets: do not shrink here — total pages can exceed 2 without violating per-kind limits.
        return false;
      }
      if (hasM && !hasC) {
        // MCQ-only selection with many pages: delegate to MCQ font grow/shrink/revert logic.
        return this.maybeAutoFitMcqQuestionFontPages(candidatePages);
      }
      if (hasC && !hasM) {
        // CQ-only selection with many pages: delegate to CQ font logic.
        return this.maybeAutoFitCqQuestionFontPages(candidatePages);
      }
      return false;
    }

    if (hasM && hasC) {
      // Mixed grow path: try CQ and MCQ in the same cycle so both fonts can rise together.
      const cqFirst = this.previewLayoutChangeSeq % 2 === 0;
      const first = cqFirst
        ? this.maybeAutoFitCqQuestionFontPages(candidatePages, { deferSchedule: true })
        : this.maybeAutoFitMcqQuestionFontPages(candidatePages, { deferSchedule: true });
      const second = cqFirst
        ? this.maybeAutoFitMcqQuestionFontPages(candidatePages, { deferSchedule: true })
        : this.maybeAutoFitCqQuestionFontPages(candidatePages, { deferSchedule: true });
      if (first || second) {
        this.scheduleLayout();
        return true;
      }
      return false;
    }
    if (hasM && !hasC) {
      return this.maybeAutoFitMcqQuestionFontPages(candidatePages);
    }
    if (hasC && !hasM) {
      return this.maybeAutoFitCqQuestionFontPages(candidatePages);
    }
    return false;
  }

  /**
   * Phase 1 — fonts only: (1) when within per-kind sheet targets (MCQ≤1, CQ≤2) and total pages ≤ 2, try
   * growing question fonts first; (2) shrink per-kind fonts when over those targets; (3) remaining shrink
   * or grow for total pages and single-kind cases. Non-font steps must not run until this returns false.
   */
  private maybeAutoFitQuestionFontsOnly(candidatePages: PreviewPage[]): boolean {
    const pages = candidatePages.length;
    const counts = this.countKindsInCandidatePages(candidatePages);
    // True when MCQ uses at most one sheet and CQ at most two (same predicate used for gap/LH expand).
    const withinTargets = this.autoFitExpandLayoutOk(counts);
    // Only attempt +1px font growth when pagination is “compact” (≤2 total sheets) AND per-kind sheet counts OK.
    const growFirst = pages <= 2 && withinTargets;

    if (growFirst) {
      // Try CQ/MCQ font growth (or mixed shrink inside prefer-one-then-two when pages>2 branches not taken).
      if (this.maybeAutoFitRegularPreferOneThenTwo(candidatePages)) {
        return true;
      }
    }

    if (this.maybeShrinkFontsToFitTwoPagesPerKind(candidatePages)) {
      // One of the kinds exceeded its sheet budget — shrink that kind’s font by 1px toward auto min.
      return true;
    }

    if (!growFirst) {
      // Many total pages or over sheet budget: still run prefer-one-then-two for shrink / single-kind grow paths.
      return this.maybeAutoFitRegularPreferOneThenTwo(candidatePages);
    }

    // growFirst was true but prefer-one-then-two did nothing, and shrink step did not apply — font phase complete.
    return false;
  }

  /** MCQ question font: shrink when total pages > 2; grow +1px while MCQ fits on ≤1 sheet (revert if overflow). */
  private maybeAutoFitMcqQuestionFontPages(
    candidatePages: PreviewPage[],
    options?: { deferSchedule?: boolean }
  ): boolean {
    if (!this.selectionHasMcqType()) return false;
    // Monotonic id bumped on each onPreviewLayoutChange — ties “same user edit” to grow/revert bookkeeping.
    const seq = this.previewLayoutChangeSeq;
    const pages = candidatePages.length;
    const minQ = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_AUTO_FIT_MIN_REGULAR_PX;
    const maxQ = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX;
    const counts = this.countKindsInCandidatePages(candidatePages);
    const cur = this.previewQuestionsFontPxMcq;
    const defer = options?.deferSchedule === true;
    const finish = (): boolean => {
      if (!defer) this.scheduleLayout();
      return true;
    };

    if (
      pages > 2 &&
      this.autoFitMcqLastGrowSeq === seq &&
      cur === this.autoFitMcqLastGrowPrevFontPx + 1
    ) {
      // Last pass applied +1px MCQ font under same seq; pagination still shows >2 pages — revert the trial bump.
      this.previewQuestionsFontPxMcq = this.autoFitMcqLastGrowPrevFontPx; //  *
      this.syncGlobalPreviewQuestionsFontPxFromPerKind();
      // Block further +1 for this seq so we do not immediately retry the same failed size.
      this.autoFitMcqGrowBlockedSeq = seq;
      return finish();
    }

    if (pages > 2) {
      if (cur <= minQ) return false;
      // Many total pages but not the “revert last +1” case: shrink MCQ font by 1px toward min (legacy path).
      this.previewQuestionsFontPxMcq = Math.max(minQ, cur - 1); //  *
      this.syncGlobalPreviewQuestionsFontPxFromPerKind();
      return finish();
    }

    if (counts.mcq > 1) return false;
    if (this.autoFitMcqGrowBlockedSeq === seq) return false;
    if (cur >= maxQ) return false;

    // Record this layout generation and pre-bump size so the next pass can detect a failed +1 and revert.
    this.autoFitMcqLastGrowSeq = seq;
    this.autoFitMcqLastGrowPrevFontPx = cur;
    // Tentatively increase MCQ body font by 1px (capped at UI max); next layout validates sheet count.
    this.previewQuestionsFontPxMcq = Math.min(maxQ, cur + 1); //  *
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    return finish();
  }

  /** CQ question font: shrink when total pages > 2; grow +1px while CQ fits on ≤2 sheets (revert if overflow). */
  private maybeAutoFitCqQuestionFontPages(
    candidatePages: PreviewPage[],
    options?: { deferSchedule?: boolean }
  ): boolean {
    if (!this.selectionHasCreativeType()) return false;
    const seq = this.previewLayoutChangeSeq;
    const pages = candidatePages.length;
    const minQ = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_AUTO_FIT_MIN_REGULAR_PX;
    const maxQ = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX;
    const counts = this.countKindsInCandidatePages(candidatePages);
    const cur = this.previewQuestionsFontPxCreative;
    const defer = options?.deferSchedule === true;
    const finish = (): boolean => {
      if (!defer) this.scheduleLayout();
      return true;
    };

    if (
      pages > 2 &&
      this.autoFitCqLastGrowSeq === seq &&
      cur === this.autoFitCqLastGrowPrevFontPx + 1
    ) {
      // Revert the last +1px CQ trial when total page count stayed >2 under the same layout-change seq.
      this.previewQuestionsFontPxCreative = this.autoFitCqLastGrowPrevFontPx; //  *
      this.syncGlobalPreviewQuestionsFontPxFromPerKind();
      this.autoFitCqGrowBlockedSeq = seq;
      return finish();
    }

    if (pages > 2) {
      if (cur <= minQ) return false;
      // Shrink CQ font by 1px when many pages and not in the precise revert branch above.
      this.previewQuestionsFontPxCreative = Math.max(minQ, cur - 1); //  *
      this.syncGlobalPreviewQuestionsFontPxFromPerKind();
      return finish();
    }

    if (counts.creative > 2) return false;
    if (this.autoFitCqGrowBlockedSeq === seq) return false;
    if (cur >= maxQ) return false;

    this.autoFitCqLastGrowSeq = seq;
    this.autoFitCqLastGrowPrevFontPx = cur;
    // Tentative +1px on CQ body font; validated on next layout by creative sheet count (≤2 sheets).
    this.previewQuestionsFontPxCreative = Math.min(maxQ, cur + 1); //  *
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    return finish();
  }

  /**
   * After question font is at auto min (8px), tighten shared padding then structured header line fonts.
   * MCQ/CQ gaps are increased later by {@link maybeAutoFitExpandSpacingAfterFontFit} when layout allows.
   */
  private maybeAutoFitRegularTightenLayoutAfterMinFont(candidatePages: PreviewPage[]): boolean {
    const minFont = QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_AUTO_FIT_MIN_REGULAR_PX;
    // Legacy/global question font — tighten only when already at or below auto min for “regular” path.
    if (this.previewQuestionsFontPx > minFont) return false;

    const pages = candidatePages.length;
    // Nothing to tighten if everything already fits on a single sheet.
    if (pages <= 1) return false;

    const maxStep = 2;
    for (let i = 0; i < maxStep; i++) {
      // Round-robin between padding step (0) and header line font step (1); counter advances each attempt.
      const step = this.autoFitRegularLayoutTightenStep % maxStep;
      this.autoFitRegularLayoutTightenStep++;
      if (this.applyRegularLayoutTightenStep(step)) {
        this.scheduleLayout();
        return true;
      }
    }
    return false;
  }

  private applyRegularLayoutTightenStep(step: number): boolean {
    const H = QuestionCreatorComponent;
    switch (step) {
      case 0: {
        if (this.questionsPadding <= H.QUESTIONS_PADDING_MIN_PX) return false;
        // Step 0: shave 1px off shared inner padding (same field tightened in maybeAutoFitPerKindSpacingTargets path).
        this.questionsPadding = Math.max(H.QUESTIONS_PADDING_MIN_PX, this.questionsPadding - 1); //  *
        return true;
      }
      case 1: {
        if (!this.headerLineFontSizes?.length) return false;
        let changed = false;
        // Step 1: try −1px on each structured header line, clamped per line so exam header stays readable.
        this.headerLineFontSizes = this.headerLineFontSizes.map((v, i) => {
          const dec = this.clampHeaderLineFontPx((v ?? 0) - 1);
          const next = Math.max(this.minHeaderFontPxWhileFittingTwoPages(i), dec);
          if (next !== (v ?? 0)) changed = true;
          return next;
        }); //  *
        return changed;
      }
      default:
        return false;
    }
  }

  /** MCQ ≤ 1 sheet and CQ ≤ 2 sheets — required for each auto-fit expand bump. */
  private autoFitExpandLayoutOk(counts: { creative: number; mcq: number }): boolean {
    // Predicate shared by gap/LH bumps and their validation: both kinds within sheet budget.
    return counts.mcq <= 1 && counts.creative <= 2;
  }

  private autoFitExpandSteps(): Array<'mcqGap' | 'mcqLh' | 'cqGap' | 'cqLh'> {
    const hasM = this.selectionHasMcqType();
    const hasC = this.selectionHasCreativeType();
    if (hasM && hasC) {
      // Mixed: try MCQ spacing before CQ spacing in this round-robin (order matters for UX progression).
      return ['mcqGap', 'mcqLh', 'cqGap', 'cqLh'];
    }
    if (hasM) {
      return ['mcqGap', 'mcqLh'];
    }
    if (hasC) {
      return ['cqGap', 'cqLh'];
    }
    return [];
  }

  private advanceAutoFitExpandPhaseAfterBump(stepIndex: number): void {
    const L = this.autoFitExpandSteps().length;
    // Move ring index to the step after the one that was committed or reverted so the next bump rotates fairly.
    this.autoFitExpandPhase = L ? (stepIndex + 1) % L : 0;
  }

  private applyAutoFitExpandBump(
    step: 'mcqGap' | 'mcqLh' | 'cqGap' | 'cqLh',
    stepIndex: number,
    H: typeof QuestionCreatorComponent
  ): boolean {
    // Skip kinds that already failed validation for this expand cycle (see maybeRevertAutoFitExpandIfInvalid).
    if (this.autoFitExpandStepBlocked.has(step)) {
      return false;
    }
    switch (step) {
      case 'mcqGap': {
        if (!this.selectionHasMcqType()) return false;
        if (this.questionsGap >= H.QUESTIONS_GAP_MAX_PX) return false;
        const prev = this.questionsGap;
        // +1px vertical gap after each MCQ (and non-creative) block in preview — may be reverted next pass.
        this.questionsGap = Math.min(H.QUESTIONS_GAP_MAX_PX, prev + 1); //  *
        // Stash previous value so revert can restore if autoFitExpandLayoutOk becomes false after re-pagination.
        this.autoFitExpandPending = { kind: 'mcqGap', prev, stepIndex };
        return true;
      }
      case 'mcqLh': {
        if (!this.selectionHasMcqType()) return false;
        const cur = this.previewQuestionsLineHeightMcq;
        const next = H.clampPreviewLineHeight(cur + 0.1, H.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT);
        if (next <= cur) return false;
        this.autoFitExpandPending = { kind: 'mcqLh', prev: cur, stepIndex };
        // +0.1 line-height for MCQ question body only (separate from CQ line height).
        this.previewQuestionsLineHeightMcq = next; //  *
        this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
        return true;
      }
      case 'cqGap': {
        if (!this.selectionHasCreativeType()) return false;
        if (this.questionsGapCreative >= H.QUESTIONS_GAP_MAX_PX) return false;
        const prev = this.questionsGapCreative;
        // +1px gap after creative (CQ) blocks — validated like mcqGap.
        this.questionsGapCreative = Math.min(H.QUESTIONS_GAP_MAX_PX, prev + 1); //  *
        this.autoFitExpandPending = { kind: 'cqGap', prev, stepIndex };
        return true;
      }
      case 'cqLh': {
        if (!this.selectionHasCreativeType()) return false;
        const cur = this.previewQuestionsLineHeightCreative;
        const next = H.clampPreviewLineHeight(cur + 0.1, H.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT);
        if (next <= cur) return false;
        this.autoFitExpandPending = { kind: 'cqLh', prev: cur, stepIndex };
        this.previewQuestionsLineHeightCreative = next; //  *
        this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
        return true;
      }
      default:
        return false;
    }
  }

  private maybeRevertAutoFitExpandIfInvalid(candidatePages: PreviewPage[]): boolean {
    // Non-null while a gap/LH bump awaits validation on the next measured pagination.
    const p = this.autoFitExpandPending;
    if (!p) {
      return false;
    }
    const counts = this.countKindsInCandidatePages(candidatePages);
    const ok = this.autoFitExpandLayoutOk(counts);
    if (ok) {
      // Bump is compatible with MCQ≤1 / CQ≤2 — commit: clear pending, advance ring, unblock all steps.
      this.autoFitExpandPending = null;
      this.advanceAutoFitExpandPhaseAfterBump(p.stepIndex);
      this.autoFitExpandStepBlocked.clear();
      return false;
    }
    // Layout broke sheet policy after the bump — remember this step kind so we do not retry it blindly.
    this.autoFitExpandStepBlocked.add(p.kind);
    switch (p.kind) {
      case 'cqGap':
        this.questionsGapCreative = p.prev; //  *
        break;
      case 'cqLh':
        this.previewQuestionsLineHeightCreative = p.prev; //  *
        this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
        break;
      case 'mcqGap':
        this.questionsGap = p.prev; //  *
        break;
      case 'mcqLh':
        this.previewQuestionsLineHeightMcq = p.prev; //  *
        this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
        break;
    }
    this.autoFitExpandPending = null;
    this.advanceAutoFitExpandPhaseAfterBump(p.stepIndex);
    this.scheduleLayout();
    return true;
  }

  private autoFitExpandStepCannotBumpMore(
    step: 'mcqGap' | 'mcqLh' | 'cqGap' | 'cqLh',
    H: typeof QuestionCreatorComponent
  ): boolean {
    if (this.autoFitExpandStepBlocked.has(step)) {
      return true;
    }
    switch (step) {
      case 'mcqGap':
        // Cannot bump MCQ gap if there is no MCQ content or gap is already at configured maximum.
        return !this.selectionHasMcqType() || this.questionsGap >= H.QUESTIONS_GAP_MAX_PX;
      case 'mcqLh': {
        if (!this.selectionHasMcqType()) return true;
        const cur = this.previewQuestionsLineHeightMcq;
        const next = H.clampPreviewLineHeight(cur + 0.1, H.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT);
        // At clamp ceiling: another +0.1 would not change the stored value — treat as exhausted.
        return next <= cur;
      }
      case 'cqGap':
        return !this.selectionHasCreativeType() || this.questionsGapCreative >= H.QUESTIONS_GAP_MAX_PX;
      case 'cqLh': {
        if (!this.selectionHasCreativeType()) return true;
        const cur = this.previewQuestionsLineHeightCreative;
        const next = H.clampPreviewLineHeight(cur + 0.1, H.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT);
        return next <= cur;
      }
      default:
        return true;
    }
  }

  /**
   * After fonts and tighten steps, increase MCQ/CQ gap and per-kind line height when layout allows (MCQ≤1, CQ≤2).
   */
  private maybeAutoFitExpandSpacingAfterFontFit(candidatePages: PreviewPage[]): boolean {
    if (this.autoFitExpandPending) {
      // Wait until maybeRevertAutoFitExpandIfInvalid has validated or reverted the last bump.
      return false;
    }
    const H = QuestionCreatorComponent;
    const counts = this.countKindsInCandidatePages(candidatePages);
    if (!this.autoFitExpandLayoutOk(counts)) {
      // Do not expand spacing while sheet counts violate MCQ≤1 / CQ≤2 — font phase must shrink first.
      return false;
    }

    const steps = this.autoFitExpandSteps();
    const L = steps.length;
    if (L === 0) {
      return false;
    }

    if (steps.every((s) => this.autoFitExpandStepCannotBumpMore(s, H))) {
      // Every step is at max or blocked — spacing expand phase is finished for now.
      return false;
    }

    for (let k = 0; k < L; k++) {
      // Start at autoFitExpandPhase and walk the ring so we do not always starve later kinds.
      const idx = (this.autoFitExpandPhase + k) % L;
      const step = steps[idx]!;
      if (this.autoFitExpandStepCannotBumpMore(step, H)) {
        continue;
      }
      if (this.applyAutoFitExpandBump(step, idx, H)) {
        this.scheduleLayout();
        return true;
      }
    }
    return false;
  }

  private maybeRevertAutoFitHeaderLineHeightIfInvalid(candidatePages: PreviewPage[]): boolean {
    const p = this.autoFitHeaderLineHeightPending;
    if (!p) {
      return false;
    }
    const counts = this.countKindsInCandidatePages(candidatePages);
    const ok = this.autoFitExpandLayoutOk(counts);
    if (ok) {
      // Paper header line-height +0.1 is still valid — clear pending so maybeAutoFitHeaderLineHeightAfterExpand may run again later.
      this.autoFitHeaderLineHeightPending = null;
      return false;
    }
    // +0.1 on previewHeaderLineHeight broke sheet policy — restore previous header LH and stop further header grows this session.
    this.previewHeaderLineHeight = p.prev; //  *
    this.autoFitHeaderLineHeightPending = null;
    this.autoFitHeaderLineHeightGrowBlocked = true;
    this.scheduleLayout();
    return true;
  }

  /**
   * Last auto-fit step: increase header line height (+0.1) after other properties settle, only while
   * {@link autoFitExpandLayoutOk} (CQ≤2 sheets, MCQ≤1 sheet). Skips if no header text.
   */
  private maybeAutoFitHeaderLineHeightAfterExpand(candidatePages: PreviewPage[]): boolean {
    if (this.autoFitHeaderLineHeightPending) {
      // Awaiting validation/revert from maybeRevertAutoFitHeaderLineHeightIfInvalid on the next layout pass.
      return false;
    }
    if (this.autoFitExpandPending) {
      // Do not stack header LH trial while a gap/LH question-body bump is still pending.
      return false;
    }
    if (this.autoFitHeaderLineHeightGrowBlocked) {
      // User or revert path set this after a failed header LH bump — no more header auto-grow until onPreviewLayoutChange clears it.
      return false;
    }
    if (!(this.questionHeader || '').trim()) {
      return false;
    }
    const counts = this.countKindsInCandidatePages(candidatePages);
    if (!this.autoFitExpandLayoutOk(counts)) {
      return false;
    }
    const H = QuestionCreatorComponent;
    const cur = this.previewHeaderLineHeight;
    const next = H.clampPreviewLineHeight(cur + 0.1, H.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT);
    if (next <= cur) {
      return false;
    }
    this.autoFitHeaderLineHeightPending = { prev: cur };
    // Tentative +0.1 on the paper question header block line-height (separate from per-kind question body LH).
    this.previewHeaderLineHeight = next; //  *
    this.scheduleLayout();
    return true;
  }

  /**
   * First sheet only: same kind spans multiple pages — leave column 1 empty; content starts at column 2
   * (headers stay in the first question column as with landscape-first-col).
   */
  landscapeLeadEmptyFirstColumnForSheetPage(pageIndex: number): boolean {
    if (pageIndex !== 0) {
      return false;
    }
    if (this.layoutColumnsForSheetPage(pageIndex) <= 1) {
      return false;
    }
    if (!this.landscapeSheetPageForPreview(pageIndex)) {
      return false;
    }
    // Lead-empty is decided during layout generation (based on multi-page same-kind).
    // Even if we later remove an empty last page, keep lead-empty active so moved content
    // remains visible in the binding column.
    return this.leadEmptyFirstPageActive;
  }

  /**
   * Landscape + multi-column: header in first question column (not full width above).
   * When {@link landscapeLeadEmptyFirstColumnForSheetPage} applies, that column is the second grid column.
   */
  headerInFirstColumnLandscape(pageIndex: number): boolean {
    if (this.layoutColumnsForSheetPage(pageIndex) <= 1) {
      return false;
    }
    if (!this.landscapeSheetPageForPreview(pageIndex)) {
      return false;
    }
    return !this.landscapeLeadEmptyFirstColumnForSheetPage(pageIndex);
  }

  /** Grid: one empty track + N question tracks (content shifts right by one column on page 1). */
  leadEmptyGridTemplateColumnsStyle(pageIndex: number): string {
    if (!this.landscapeLeadEmptyFirstColumnForSheetPage(pageIndex)) {
      return '';
    }
    const n = this.layoutColumnsForSheetPage(pageIndex);
    if (n <= 1) {
      return '';
    }
    return `repeat(${n}, minmax(0, 1fr))`;
  }

  /** Sectioned lead-empty: section stack occupies grid columns 2…N+1. */
  leadEmptySectionMainGridColumnStyle(): string {
    return '2 / -1';
  }

  /**
   * Column count during pagination: for mixed CQ+MCQ multi-sheet, derive CQ vs MCQ from the first
   * question index on the page (do not use stale `paginatedPages`).
   */
  private layoutColumnsForPaginationPass(sheetPageIndex: number, startQuestionIndex: number): number {
    let cols = 1;
    if (!this.paperSubjectMetaLinesEligible() || this.headerUseLegacyQuestionHeader) {
      cols = Math.max(1, Math.floor(this.layoutColumns));
    } else if (!this.selectionHasBothHeaderTypes() || this.mixedTypesSinglePageMergedHeader) {
      if (this.selectionHasBothHeaderTypes() && this.mixedTypesSinglePageMergedHeader) {
        cols = Math.max(1, Math.floor(this.layoutColumnsCreative));
      } else if (!this.selectionHasBothHeaderTypes()) {
        const raw = this.selectionHasCreativeType() ? this.layoutColumnsCreative : this.layoutColumns;
        cols = Math.max(1, Math.floor(raw));
      }
    } else {
      const c = this.previewCreativeBlockQuestionCount();
      const raw = startQuestionIndex < c ? this.layoutColumnsCreative : this.layoutColumns;
      cols = Math.max(1, Math.floor(raw));
    }
    if (this.leadEmptyFirstPageActive && sheetPageIndex === 0 && cols > 1) {
      return cols - 1;
    }
    return cols;
  }

  /** Content width for one column when using `cols` columns (same gap as preview). */
  columnWidthPxForCols(cols: number): number {
    const n = Math.max(1, Math.floor(cols));
    if (n <= 1) return this.contentInnerWidthPx;
    return Math.max(
      80,
      (this.contentInnerWidthPx - (n - 1) * this.layoutColumnGapPx) / n
    );
  }

  /**
   * Measurement rail: creative-layout questions use CQ column width; MCQ-layout questions use MCQ width.
   * Matches which header variant will appear on their sheet (including merged mixed single page).
   */
  measureUsesCreativeColumnLayoutForPreviewIndex(i: number): boolean {
    const list = this.previewQuestions;
    const q = list[i];
    if (!q) return false;
    if (!this.paperSubjectMetaLinesEligible() || this.headerUseLegacyQuestionHeader) {
      return false;
    }
    if (this.selectionHasBothHeaderTypes() && this.mixedTypesSinglePageMergedHeader) {
      return true;
    }
    if (this.selectionHasBothHeaderTypes() && !this.mixedTypesSinglePageMergedHeader) {
      return this.questionIsCreativeType(q);
    }
    if (this.selectionHasCreativeType() && !this.selectionHasMcqType()) {
      return true;
    }
    return false;
  }

  columnMeasureWidthPxForQuestionIndex(i: number): number {
    const creativeLayout = this.measureUsesCreativeColumnLayoutForPreviewIndex(i);
    const baseInnerW = this.contentInnerWidthPxForKind(creativeLayout ? 'creative' : 'mcq');
    const cols = creativeLayout ? this.layoutColumnsCreative : this.layoutColumns;
    const n = Math.max(1, Math.floor(cols));
    if (n <= 1) {
      return baseInnerW;
    }
    return Math.max(
      80,
      (baseInnerW - (n - 1) * this.layoutColumnGapPx) / n
    );
  }

  decOptionsColumns(): void {
    if (this.optionsColumns <= QuestionCreatorComponent.OPTIONS_COLUMNS_MIN) return;
    this.optionsColumns--;
    this.onPreviewLayoutChange();
  }

  incOptionsColumns(): void {
    if (this.optionsColumns >= QuestionCreatorComponent.OPTIONS_COLUMNS_MAX) return;
    this.optionsColumns++;
    this.onPreviewLayoutChange();
  }

  onOptionsColumnsInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.OPTIONS_COLUMNS_MIN,
      Math.min(QuestionCreatorComponent.OPTIONS_COLUMNS_MAX, n)
    );
    if (c !== this.optionsColumns) {
      this.optionsColumns = c;
    }
    this.onPreviewLayoutChange();
  }

  onOptionsColumnsBlur(): void {
    const n = Math.floor(Number(this.optionsColumns));
    if (!Number.isFinite(n)) {
      this.optionsColumns = 2;
    } else {
      this.optionsColumns = Math.max(
        QuestionCreatorComponent.OPTIONS_COLUMNS_MIN,
        Math.min(QuestionCreatorComponent.OPTIONS_COLUMNS_MAX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decPreviewHeaderLineHeight(): void {
    this.previewHeaderLineHeight = QuestionCreatorComponent.clampPreviewLineHeight(
      this.previewHeaderLineHeight - 0.1,
      QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT
    );
    this.onPreviewLayoutChange();
  }

  incPreviewHeaderLineHeight(): void {
    this.previewHeaderLineHeight = QuestionCreatorComponent.clampPreviewLineHeight(
      this.previewHeaderLineHeight + 0.1,
      QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT
    );
    this.onPreviewLayoutChange();
  }

  onPreviewHeaderLineHeightInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const c = QuestionCreatorComponent.clampPreviewLineHeight(
      n,
      QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT
    );
    if (c !== this.previewHeaderLineHeight) {
      this.previewHeaderLineHeight = c;
    }
    this.onPreviewLayoutChange();
  }

  onPreviewHeaderLineHeightBlur(): void {
    this.previewHeaderLineHeight = QuestionCreatorComponent.clampPreviewLineHeight(
      Number(this.previewHeaderLineHeight),
      QuestionCreatorComponent.PREVIEW_HEADER_LINE_HEIGHT_DEFAULT
    );
    this.onPreviewLayoutChange();
  }

  decPreviewQuestionsLineHeightCreative(): void {
    this.previewQuestionsLineHeightCreative = QuestionCreatorComponent.clampPreviewLineHeight(
      this.previewQuestionsLineHeightCreative - 0.1,
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  incPreviewQuestionsLineHeightCreative(): void {
    this.previewQuestionsLineHeightCreative = QuestionCreatorComponent.clampPreviewLineHeight(
      this.previewQuestionsLineHeightCreative + 0.1,
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsLineHeightCreativeInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const c = QuestionCreatorComponent.clampPreviewLineHeight(
      n,
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    if (c !== this.previewQuestionsLineHeightCreative) {
      this.previewQuestionsLineHeightCreative = c;
    }
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsLineHeightCreativeBlur(): void {
    this.previewQuestionsLineHeightCreative = QuestionCreatorComponent.clampPreviewLineHeight(
      Number(this.previewQuestionsLineHeightCreative),
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  decPreviewQuestionsLineHeightMcq(): void {
    this.previewQuestionsLineHeightMcq = QuestionCreatorComponent.clampPreviewLineHeight(
      this.previewQuestionsLineHeightMcq - 0.1,
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  incPreviewQuestionsLineHeightMcq(): void {
    this.previewQuestionsLineHeightMcq = QuestionCreatorComponent.clampPreviewLineHeight(
      this.previewQuestionsLineHeightMcq + 0.1,
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsLineHeightMcqInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const c = QuestionCreatorComponent.clampPreviewLineHeight(
      n,
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    if (c !== this.previewQuestionsLineHeightMcq) {
      this.previewQuestionsLineHeightMcq = c;
    }
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsLineHeightMcqBlur(): void {
    this.previewQuestionsLineHeightMcq = QuestionCreatorComponent.clampPreviewLineHeight(
      Number(this.previewQuestionsLineHeightMcq),
      QuestionCreatorComponent.PREVIEW_QUESTIONS_LINE_HEIGHT_DEFAULT
    );
    this.syncGlobalPreviewQuestionsLineHeightFromPerKind();
    this.onPreviewLayoutChange();
  }

  decLayoutColumnGap(): void {
    if (this.layoutColumnGapPx <= QuestionCreatorComponent.LAYOUT_GAP_MIN_PX) return;
    this.layoutColumnGapPx--;
    this.onPreviewLayoutChange();
  }

  incLayoutColumnGap(): void {
    if (this.layoutColumnGapPx >= QuestionCreatorComponent.LAYOUT_GAP_MAX_PX) return;
    this.layoutColumnGapPx++;
    this.onPreviewLayoutChange();
  }

  /** Manual column gap (px): clamp 1–100 and refresh preview. */
  onLayoutColumnGapInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
      Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, n)
    );
    if (c !== this.layoutColumnGapPx) {
      this.layoutColumnGapPx = c;
    }
    this.onPreviewLayoutChange();
  }

  onLayoutColumnGapBlur(): void {
    const n = Math.round(Number(this.layoutColumnGapPx));
    if (!Number.isFinite(n)) {
      this.layoutColumnGapPx = QuestionCreatorComponent.LAYOUT_GAP_MIN_PX;
    } else {
      this.layoutColumnGapPx = Math.max(
        QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
        Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decQuestionsPadding(): void {
    if (this.questionsPadding <= QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX) return;
    this.questionsPadding--;
    this.onPreviewLayoutChange();
  }

  incQuestionsPadding(): void {
    if (this.questionsPadding >= QuestionCreatorComponent.QUESTIONS_PADDING_MAX_PX) return;
    this.questionsPadding++;
    this.onPreviewLayoutChange();
  }

  onQuestionsPaddingInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX,
      Math.min(QuestionCreatorComponent.QUESTIONS_PADDING_MAX_PX, n)
    );
    if (c !== this.questionsPadding) {
      this.questionsPadding = c;
    }
    this.onPreviewLayoutChange();
  }

  onQuestionsPaddingBlur(): void {
    const n = Math.round(Number(this.questionsPadding));
    if (!Number.isFinite(n)) {
      this.questionsPadding = QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX;
    } else {
      this.questionsPadding = Math.max(
        QuestionCreatorComponent.QUESTIONS_PADDING_MIN_PX,
        Math.min(QuestionCreatorComponent.QUESTIONS_PADDING_MAX_PX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decQuestionsGap(): void {
    if (this.questionsGap <= QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX) return;
    this.questionsGap--;
    this.onPreviewLayoutChange();
  }

  incQuestionsGap(): void {
    if (this.questionsGap >= QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX) return;
    this.questionsGap++;
    this.onPreviewLayoutChange();
  }

  onQuestionsGapInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX,
      Math.min(QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX, n)
    );
    if (c !== this.questionsGap) {
      this.questionsGap = c;
    }
    this.onPreviewLayoutChange();
  }

  onQuestionsGapBlur(): void {
    const n = Math.round(Number(this.questionsGap));
    if (!Number.isFinite(n)) {
      this.questionsGap = QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX;
    } else {
      this.questionsGap = Math.max(
        QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX,
        Math.min(QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decQuestionsGapCreative(): void {
    if (this.questionsGapCreative <= QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX) return;
    this.questionsGapCreative--;
    this.onPreviewLayoutChange();
  }

  incQuestionsGapCreative(): void {
    if (this.questionsGapCreative >= QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX) return;
    this.questionsGapCreative++;
    this.onPreviewLayoutChange();
  }

  onQuestionsGapCreativeInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX,
      Math.min(QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX, n)
    );
    if (c !== this.questionsGapCreative) {
      this.questionsGapCreative = c;
    }
    this.onPreviewLayoutChange();
  }

  onQuestionsGapCreativeBlur(): void {
    const n = Math.round(Number(this.questionsGapCreative));
    if (!Number.isFinite(n)) {
      this.questionsGapCreative = QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX;
    } else {
      this.questionsGapCreative = Math.max(
        QuestionCreatorComponent.QUESTIONS_GAP_MIN_PX,
        Math.min(QuestionCreatorComponent.QUESTIONS_GAP_MAX_PX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  /**
   * (ক)/(খ)/(গ)/(ঘ) sub-line hanging inset: 16px at 9px preview font, +2px per +1px font
   * (2 × fontPx − 2). Exposed as `--preview-q-bn-paren-inset` on `.preview-sheet-inner` / measure rail.
   * Same as PDF export: `2 * fz - 2` with per-sheet legacy font.
   */
  get previewQuestionBnParenInsetPx(): number {
    const fz = this.clampPreviewQuestionFontPx(Number(this.previewQuestionsFontPx));
    return 2 * fz - 2;
  }

  /**
   * Sub-part / options column: same `em` inset as PDF (`2.95em` = 2.75em number column + 0.2em gap).
   * Exposed as `--preview-q-subpart-pl` on `.preview-sheet-inner` / measure rail.
   */
  get previewQSubpartPaddingLeftEm(): string {
    return QuestionCreatorComponent.PREVIEW_Q_SUBPART_PL_EM;
  }

  private syncGlobalPreviewQuestionsFontPxFromPerKind(): void {
    // Legacy/global field retained for backwards compatibility in persisted payloads.
    this.previewQuestionsFontPx = Math.min(this.previewQuestionsFontPxCreative, this.previewQuestionsFontPxMcq);
  }

  /**
   * MCQ + CQ fonts, global sync, and overview `previewFitScale` — inline images re-measure caps +
   * column width (layout px; avoids % under scaled preview).
   */
  get previewRichImgFontTriggerKey(): string {
    return `${this.previewQuestionsFontPx},${this.previewQuestionsFontPxCreative},${this.previewQuestionsFontPxMcq},${this.previewFitScale}`;
  }

  private syncGlobalPreviewQuestionsLineHeightFromPerKind(): void {
    // Legacy/global field retained for backwards compatibility in persisted payloads.
    this.previewQuestionsLineHeight = Math.min(
      this.previewQuestionsLineHeightCreative,
      this.previewQuestionsLineHeightMcq
    );
  }

  decPreviewQuestionsFontPxCreative(): void {
    if (this.previewQuestionsFontPxCreative <= QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MIN_PX) return;
    this.previewQuestionsFontPxCreative--;
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  incPreviewQuestionsFontPxCreative(): void {
    if (this.previewQuestionsFontPxCreative >= QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX) return;
    this.previewQuestionsFontPxCreative++;
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsFontPxCreativeInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    this.previewQuestionsFontPxCreative = this.clampPreviewQuestionFontPx(Number(raw));
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsFontPxCreativeBlur(): void {
    this.previewQuestionsFontPxCreative = this.clampPreviewQuestionFontPx(this.previewQuestionsFontPxCreative);
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  decPreviewQuestionsFontPxMcq(): void {
    if (this.previewQuestionsFontPxMcq <= QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MIN_PX) return;
    this.previewQuestionsFontPxMcq--;
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  incPreviewQuestionsFontPxMcq(): void {
    if (this.previewQuestionsFontPxMcq >= QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX) return;
    this.previewQuestionsFontPxMcq++;
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsFontPxMcqInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    this.previewQuestionsFontPxMcq = this.clampPreviewQuestionFontPx(Number(raw));
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  onPreviewQuestionsFontPxMcqBlur(): void {
    this.previewQuestionsFontPxMcq = this.clampPreviewQuestionFontPx(this.previewQuestionsFontPxMcq);
    this.syncGlobalPreviewQuestionsFontPxFromPerKind();
    this.onPreviewLayoutChange();
  }

  decPageSections(): void {
    if (this.pageSections <= QuestionCreatorComponent.PAGE_SECTIONS_MIN) return;
    this.pageSections--;
    this.onPreviewLayoutChange();
  }

  incPageSections(): void {
    if (this.pageSections >= QuestionCreatorComponent.PAGE_SECTIONS_MAX) return;
    this.pageSections++;
    this.onPreviewLayoutChange();
  }

  onPageSectionsInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.PAGE_SECTIONS_MIN,
      Math.min(QuestionCreatorComponent.PAGE_SECTIONS_MAX, n)
    );
    if (c !== this.pageSections) {
      this.pageSections = c;
    }
    this.onPreviewLayoutChange();
  }

  onPageSectionsBlur(): void {
    const n = Math.floor(Number(this.pageSections));
    if (!Number.isFinite(n)) {
      this.pageSections = QuestionCreatorComponent.PAGE_SECTIONS_MIN;
    } else {
      this.pageSections = Math.max(
        QuestionCreatorComponent.PAGE_SECTIONS_MIN,
        Math.min(QuestionCreatorComponent.PAGE_SECTIONS_MAX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decSectionGap(): void {
    if (this.sectionGapPx <= QuestionCreatorComponent.LAYOUT_GAP_MIN_PX) return;
    this.sectionGapPx--;
    this.onPreviewLayoutChange();
  }

  incSectionGap(): void {
    if (this.sectionGapPx >= QuestionCreatorComponent.LAYOUT_GAP_MAX_PX) return;
    this.sectionGapPx++;
    this.onPreviewLayoutChange();
  }

  onSectionGapInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
      Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, n)
    );
    if (c !== this.sectionGapPx) {
      this.sectionGapPx = c;
    }
    this.onPreviewLayoutChange();
  }

  onSectionGapBlur(): void {
    const n = Math.round(Number(this.sectionGapPx));
    if (!Number.isFinite(n)) {
      this.sectionGapPx = QuestionCreatorComponent.LAYOUT_GAP_MIN_PX;
    } else {
      this.sectionGapPx = Math.max(
        QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
        Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, n)
      );
    }
    this.onPreviewLayoutChange();
  }

  decCustomPageWidthIn(): void {
    const next = Math.max(
      QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
      QuestionCreatorComponent.roundInches2(
        this.customPageWidthIn - QuestionCreatorComponent.CUSTOM_PAGE_STEPPER_IN
      )
    );
    if (Math.abs(next - this.customPageWidthIn) > 1e-9) {
      this.customPageWidthIn = next;
      this.onPreviewLayoutChange();
    }
  }

  incCustomPageWidthIn(): void {
    const next = Math.min(
      QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN,
      QuestionCreatorComponent.roundInches2(
        this.customPageWidthIn + QuestionCreatorComponent.CUSTOM_PAGE_STEPPER_IN
      )
    );
    if (Math.abs(next - this.customPageWidthIn) > 1e-9) {
      this.customPageWidthIn = next;
      this.onPreviewLayoutChange();
    }
  }

  onCustomPageWidthInInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
      Math.min(QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN, n)
    );
    if (Math.abs(c - this.customPageWidthIn) > 1e-9) {
      this.customPageWidthIn = c;
    }
    this.onPreviewLayoutChange();
  }

  onCustomPageWidthInBlur(): void {
    const n = Number(this.customPageWidthIn);
    const fallback = QuestionCreatorComponent.a4WidthInDefault();
    this.customPageWidthIn = QuestionCreatorComponent.roundInches2(
      Math.max(
        QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
        Math.min(QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN, Number.isFinite(n) ? n : fallback)
      )
    );
    this.onPreviewLayoutChange();
  }

  decCustomPageHeightIn(): void {
    const next = Math.max(
      QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
      QuestionCreatorComponent.roundInches2(
        this.customPageHeightIn - QuestionCreatorComponent.CUSTOM_PAGE_STEPPER_IN
      )
    );
    if (Math.abs(next - this.customPageHeightIn) > 1e-9) {
      this.customPageHeightIn = next;
      this.onPreviewLayoutChange();
    }
  }

  incCustomPageHeightIn(): void {
    const next = Math.min(
      QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN,
      QuestionCreatorComponent.roundInches2(
        this.customPageHeightIn + QuestionCreatorComponent.CUSTOM_PAGE_STEPPER_IN
      )
    );
    if (Math.abs(next - this.customPageHeightIn) > 1e-9) {
      this.customPageHeightIn = next;
      this.onPreviewLayoutChange();
    }
  }

  onCustomPageHeightInInput(raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const c = Math.max(
      QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
      Math.min(QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN, n)
    );
    if (Math.abs(c - this.customPageHeightIn) > 1e-9) {
      this.customPageHeightIn = c;
    }
    this.onPreviewLayoutChange();
  }

  onCustomPageHeightInBlur(): void {
    const n = Number(this.customPageHeightIn);
    const fallback = QuestionCreatorComponent.a4HeightInDefault();
    this.customPageHeightIn = QuestionCreatorComponent.roundInches2(
      Math.max(
        QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
        Math.min(QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN, Number.isFinite(n) ? n : fallback)
      )
    );
    this.onPreviewLayoutChange();
  }

  /**
   * Overview scale: at most 50% of true print width; smaller if the preview stage is too narrow.
   * Hover magnifier always uses 4× this value (see {@link magnifierLensScale}).
   */
  updatePreviewFitScale(): void {
    const stage = this.previewStage?.nativeElement;
    const pw = this.previewPaperWidthPxMax;
    if (!stage || pw <= 0) {
      this.previewFitScale = this.previewMaxZoomOutScale;
      this.cdr.markForCheck();
      return;
    }
    const cs = getComputedStyle(stage);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const inner = Math.max(48, stage.clientWidth - pl - pr);
    const fit = inner / pw;
    this.previewFitScale = Math.min(this.previewMaxZoomOutScale, fit);
    this.cdr.markForCheck();
  }

  /** 4× current overview scale (1:1 print DOM → lens). */
  get magnifierLensScale(): number {
    return this.magnifierScaleMultiplier * this.previewFitScale;
  }

  /** Font size + line-height for header line index `i` (0-based). */
  headerPreviewLineTypoStyle(i: number): Record<string, string> {
    const lh = String(this.previewHeaderLineHeight);
    const px = this.headerLineFontSizes[i];
    const effective = this.clampHeaderLineFontPx(
      px != null && Number.isFinite(px) ? px : this.defaultHeaderFontPxForLineFromContent(i)
    );
    return { fontSize: `${effective}px`, lineHeight: lh };
  }

  /**
   * Synthetic MCQ band title (“বহুনির্বাচনি অভীক্ষা”) always 21px in preview — mixed layout maps that row to the
   * same font index as the subject line, which would otherwise follow ICT/subject rules.
   */
  headerPreviewMcqTitleTypoStyle(): Record<string, string> {
    const lh = String(this.previewHeaderLineHeight);
    const px = this.clampHeaderLineFontPx(QuestionCreatorComponent.HEADER_LINE3_FONT_DEFAULT_PX);
    return { fontSize: `${px}px`, lineHeight: lh };
  }

  /**
   * Font size in preview’s 1:1 coordinate space so “Page X of Y” reads ~12px on screen
   * after the stack’s `previewFitScale` transform (counteracts overview zoom for that label).
   */
  get previewPageLabelFontPx(): number {
    const s = Math.max(0.18, this.previewFitScale);
    return Math.min(28, Math.max(11, 12 / s));
  }

  singleSectionQuestionsHeightPx(pageIndex: number): number {
    const headerInsideFirstCol =
      (this.headerInFirstColumnLandscape(pageIndex) ||
        this.landscapeLeadEmptyFirstColumnForSheetPage(pageIndex)) &&
      this.paperHeaderVisibleForSheetPage(pageIndex) &&
      this.questionHeader?.trim() &&
      this.measuredHeaderHeightPx > 0;
    const headerBudget = headerInsideFirstCol
      ? 0
      : this.paperHeaderVisibleForSheetPage(pageIndex) && this.questionHeader?.trim() && this.measuredHeaderHeightPx > 0
        ? this.measuredHeaderHeightPx
        : 0;
    const innerH = this.contentInnerHeightPxForPage(pageIndex);

    return Math.max(1, innerH - headerBudget);
  }

  /** Margin below a preview block; matches column packing gaps after {@link questionList} indices. */
  questionBlockMarginBottomPx(q: { type?: unknown } | null | undefined): number {
    return this.questionIsCreativeType(q ?? {}) ? this.questionsGapCreative : this.questionsGap;
  }

  /**
   * Per-question spacing: vertical padding only (horizontal spacing from margins + column gap).
   * Uses the same px map as Playwright export (`exportPlaywrightPreviewSpacingFromFontPx`).
   */
  previewQuestionBlockStyleForQ(q: { type?: unknown }): Record<string, string> {
    const p = this.questionsPadding;
    const g = this.questionBlockMarginBottomPx(q);
    const fz = this.clampPreviewQuestionFontPx(this.previewQuestionsFontPxForQuestion(q));
    const lh = this.previewQuestionsLineHeightForQuestion(q);
    const s = QuestionCreatorComponent.exportPlaywrightPreviewSpacingFromFontPx(fz);
    return {
      fontSize: `${fz}px`,
      '--preview-question-lh': `${lh}`,
      '--preview-q-bn-paren-inset': `${s.bnParenInsetPx}px`,
      '--preview-q-subpart-pl': QuestionCreatorComponent.PREVIEW_Q_SUBPART_PL_EM,
      '--preview-q-opt-hang': `${s.optHangPx}px`,
      '--preview-q-roman-indent': `${s.romanIndentPx}px`,
      '--preview-q-opt-row-gap': `${s.optRowGapPx}px`,
      '--preview-q-opt-col-gap': `${s.optColGapPx}px`,
      '--preview-q-content-pr': `${s.contentPrPx}px`,
      '--preview-q-stem-mb': `${s.stemMbPx}px`,
      '--preview-q-subpart-mt': `${s.subpartMtPx}px`,
      '--preview-q-opt-my': `${s.optMyPx}px`,
      paddingTop: `${p}px`,
      paddingBottom: `${p}px`,
      paddingLeft: '0',
      paddingRight: '0',
      marginBottom: `${g}px`,
    };
  }

  trackSectionLineTop(index: number, _top: number): number {
    return index;
  }

  trackSection = (index: number, sec: PreviewPageItem[]) =>
    sec.length ? sec.map((x) => x.index).join('-') : `empty-${index}`;

  private scheduleLayout(): void {
    if (this.layoutTimer) clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => this.runLayout(), 0);
    this.maybeBootstrapAutoFitOverlayProgress();
    this.cdr.markForCheck();
  }

  /**
   * Wait until queued layout + auto-fit passes finish: no {@link layoutTimer} and no in-flight
   * {@link runLayout} (including nested RAF pagination/auto-fit).
   */
  private async waitForLayoutIdle(): Promise<void> {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (this.layoutTimer != null || this.layoutPassInFlight) {
        await new Promise<void>((r) => setTimeout(r, 0));
        continue;
      }
      await new Promise<void>((r) => setTimeout(r, 48));
      if (this.layoutTimer == null && !this.layoutPassInFlight) {
        return;
      }
    }
    throw new Error('Layout did not settle in time');
  }

  /** Same full-screen overlay as page load; export uses timed progress + custom message. */
  private endExportLoadingOverlay(): void {
    this.loadingService.endPdfDocxExport();
  }

  private runLayout(): void {
    this.layoutTimer = null;
    this.layoutPassInFlight = true;
    this.cdr.detectChanges();

    const { w: innerW, h: innerH } = this.effectiveInnerDimensionsForLayout();
    if (innerW <= 0 || innerH <= 0) {
      // No printable area — do not leave “suppress next” latched; next successful layout should not skip auto-fit wrongly.
      this.previewAutoFitSuppressNextLayoutRun = false;
      this.paginatedPages = [];
      this.mixedTypesSinglePageMergedHeader = false;
      this.leadEmptyFirstPageActive = false;
      this.updatePreviewFitScale();
      this.cdr.markForCheck();
      this.layoutPassInFlight = false;
      return;
    }

    const pq = this.previewQuestions;
    const blocks = this.measureBlocks?.toArray() ?? [];
    if (pq.length > 0 && blocks.length !== pq.length) {
      setTimeout(() => this.scheduleLayout(), 32);
      this.layoutPassInFlight = false;
      return;
    }

    if (pq.length === 0) {
      // Empty question list — same as zero-size path: clear one-shot suppress so a future load is not stuck.
      this.previewAutoFitSuppressNextLayoutRun = false;
      this.paginatedPages = [];
      this.mixedTypesSinglePageMergedHeader = false;
      this.leadEmptyFirstPageActive = false;
      this.updatePreviewFitScale();
      this.cdr.markForCheck();
      this.layoutPassInFlight = false;
      return;
    }

    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
        const blocksNow = this.measureBlocks?.toArray() ?? [];
        // Register image load/error listeners so late image dimensions trigger a follow-up pagination pass.
        // Do not block this pass; otherwise preview can stay empty while media is still loading.
        this.scheduleLayoutForPendingMeasureImages(blocksNow);
        const heights = blocksNow.map((ref) => {
          const el = ref.nativeElement;
          // Use the largest box metric so mixed text+image content is fully counted for pagination.
          const rendered = Math.ceil(el.getBoundingClientRect().height || 0);
          const content = Math.max(el.offsetHeight || 0, el.scrollHeight || 0, rendered);
          // Keep `heights[]` as pure content height; packing logic adds per-question gaps between stacked blocks.
          return content;
        });
        if (
          pq.length > 0 &&
          blocksNow.length === pq.length &&
          heights.every((h) => h === 0)
        ) {
          setTimeout(() => this.scheduleLayout(), 32);
          return;
        }
        const headerH =
          this.questionHeader?.trim() && this.measureHeader && this.paperHeaderVisibleForSheetPage(0)
            ? this.measureHeader.nativeElement.offsetHeight
            : 0;
        this.measuredHeaderHeightPx = headerH;

        const candidatePages = this.splitIntoPages(heights, innerH, headerH, this.pageSections, pq);
        const shouldMergeHeaderForSinglePage =
          this.paperSubjectMetaLinesEligible() &&
          this.selectionHasBothHeaderTypes() &&
          candidatePages.length <= 1;
        if (shouldMergeHeaderForSinglePage !== this.mixedTypesSinglePageMergedHeader) {
          this.mixedTypesSinglePageMergedHeader = shouldMergeHeaderForSinglePage;
          this.scheduleLayout();
          return;
        }
        const shouldLeadEmptyFirst = this.shouldUseLeadEmptyFirstColumnFromPages(candidatePages);
        if (shouldLeadEmptyFirst !== this.leadEmptyFirstPageActive) {
          this.leadEmptyFirstPageActive = shouldLeadEmptyFirst;
          this.scheduleLayout();
          return;
        }
        if (this.leadEmptyFirstPageActive) {
          this.applyLeadEmptyMoveLastPageColumnToFirstBinding(candidatePages);
        }
        // --- Auto-fit gate: only “first three” exam types auto-adjust unless Smart/Reset sets previewAutoFitForceOneLayoutChain.
        const examAllowsAutoFit = this.examTypeKeyIsFirstThreeExamOptions(this.headerExamTypeKey);
        // Default: skip all mutation helpers below when exam name is not in the auto-fit whitelist.
        let suppressAutoFit = !examAllowsAutoFit;
        if (examAllowsAutoFit && this.previewAutoFitSuppressNextLayoutRun) {
          // Manual onPreviewLayoutChange() sets this so one layout pass uses current fonts without auto mutations.
          suppressAutoFit = true;
          this.previewAutoFitSuppressNextLayoutRun = false;
        }
        if (this.previewAutoFitForceOneLayoutChain) {
          // Reset Settings / Smart path: run the full pipeline once even if exam would normally suppress.
          suppressAutoFit = false;
        }
        // Auto-fit pipeline (each helper may call scheduleLayout() and return true to defer assigning paginatedPages):
        // (1) revert invalid gap/LH bumps (2) revert invalid header LH (3) fonts (4) shared padding (5) tighten at min font
        // (6) expand MCQ/CQ gaps & body line heights (7) tentatively grow paper header line height.
        if (!suppressAutoFit) {
          if (this.maybeRevertAutoFitExpandIfInvalid(candidatePages)) {
            return;
          }
          if (this.maybeRevertAutoFitHeaderLineHeightIfInvalid(candidatePages)) {
            return;
          }
          if (this.maybeAutoFitQuestionFontsOnly(candidatePages)) {
            return;
          }
          if (this.maybeAutoFitPerKindSpacingTargets(candidatePages)) {
            return;
          }
          if (this.maybeAutoFitRegularTightenLayoutAfterMinFont(candidatePages)) {
            return;
          }
          if (this.maybeAutoFitExpandSpacingAfterFontFit(candidatePages)) {
            return;
          }
          if (this.maybeAutoFitHeaderLineHeightAfterExpand(candidatePages)) {
            return;
          }
        }
        this.paginatedPages = candidatePages;
        if (this.previewAutoFitForceOneLayoutChain) {
          // Forced chain (Reset / Smart) completed one full pagination commit — return to normal exam gating.
          this.previewAutoFitForceOneLayoutChain = false;
        }
        this.updatePreviewFitScale();
        this.cdr.markForCheck();
        } finally {
          this.layoutPassInFlight = false;
        }
      });
    });
  }

  /**
   * Layout uses a single inner width/height to measure blocks and paginate.
   * When CQ/MCQ orientations differ, we must not over-estimate
   * available space; otherwise some lines can overflow the bottom margin.
   *
   * Strategy: use the minimum printable inner W/H across the kinds present.
   */
  private effectiveInnerDimensionsForLayout(): { w: number; h: number } {
    const minW = (a: number, b: number) => (a < b ? a : b);
    const minH = (a: number, b: number) => (a < b ? a : b);

    const dimsForKind = (kind: 'creative' | 'mcq') => {
      const paper = this.paperSizeMmForKind(kind);
      const w = Math.max(0, (paper.w - this.marginLeft - this.marginRight) * QuestionCreatorComponent.MM_TO_PX);
      const bottom = this.previewBottomMarginMmForKind(kind);
      const h = Math.max(0, (paper.h - this.marginTop - bottom) * QuestionCreatorComponent.MM_TO_PX);
      return { w, h };
    };

    // If selection is empty, fall back to current global printable area (legacy).
    if (!this.previewQuestions?.length) {
      return { w: this.contentInnerWidthPx, h: this.contentInnerHeightPx };
    }

    // Determine which kinds are present (or could be present in mixed-header mode).
    const hasCreative = this.selectionHasCreativeType();
    const hasMcq = this.selectionHasMcqType();
    if (hasCreative && !hasMcq) {
      return dimsForKind('creative');
    }
    if (hasMcq && !hasCreative) {
      return dimsForKind('mcq');
    }

    // Both kinds: use the min across the two to avoid overflow in either.
    const c = dimsForKind('creative');
    const m = dimsForKind('mcq');
    return { w: minW(c.w, m.w), h: minH(c.h, m.h) };
  }

  /**
   * Returns true when any measured question block still has images loading.
   * We attach one-shot listeners and re-run layout as soon as media dimensions settle.
   */
  private scheduleLayoutForPendingMeasureImages(blocks: Array<ElementRef<HTMLElement>>): boolean {
    let pending = false;
    for (const ref of blocks) {
      const host = ref?.nativeElement;
      if (!host) continue;
      const imgs = host.querySelectorAll('img');
      for (const node of Array.from(imgs)) {
        const img = node as HTMLImageElement;
        // Measurement rail must not rely on viewport-based lazy loading; otherwise page-2+ images may never
        // contribute to measured heights until scrolled into view.
        try {
          img.loading = 'eager';
        } catch {
          // Ignore assignment errors on older engines.
        }
        if (img.complete) continue;
        pending = true;
        if (this.pendingMeasureImageListeners.has(img)) continue;
        this.pendingMeasureImageListeners.add(img);
        const rerun = () => this.scheduleLayout();
        img.addEventListener('load', rerun, { once: true });
        img.addEventListener('error', rerun, { once: true });
      }
    }
    return pending;
  }

  private clampSectionGapPx(): number {
    return Math.max(
      QuestionCreatorComponent.LAYOUT_GAP_MIN_PX,
      Math.min(QuestionCreatorComponent.LAYOUT_GAP_MAX_PX, Math.round(this.sectionGapPx))
    );
  }

  private maxSliceHeight(heights: number[], start: number, len: number): number {
    let m = 0;
    for (let i = 0; i < len && start + i < heights.length; i++) {
      m = Math.max(m, heights[start + i] ?? 0);
    }
    return m;
  }

  /** Divider lines between section bands (px from top of sheet body). */
  private computeSectionDividerTops(
    innerH: number,
    headerBudget: number,
    S: number,
    gap: number
  ): number[] {
    if (S <= 1) {
      return [];
    }
    const avail = innerH - headerBudget;
    const band = (avail - (S - 1) * gap) / S;
    if (band <= 0) {
      return [];
    }
    const out: number[] = [];
    for (let k = 1; k < S; k++) {
      out.push(headerBudget + k * band + (k - 0.5) * gap);
    }
    return out;
  }

  private splitIntoPages(
    heights: number[],
    innerH: number,
    headerH: number,
    pageSections: number,
    questionList: any[]
  ): PreviewPage[] {
    if (questionList.length === 0) {
      return [];
    }

    const S = Math.max(1, Math.floor(pageSections));
    const gap = this.clampSectionGapPx();

    if (S <= 1) {
      return this.splitIntoPagesSingleSection(heights, innerH, headerH, questionList);
    }

    return this.splitIntoPagesMultiSection(heights, innerH, headerH, S, gap, questionList);
  }

  /**
   * Fill columns top-to-bottom, then the next column (reading order 1,2,3… down col1, then col2, …).
   * `columnStacks` renders as independent flex columns (no horizontal row alignment across columns).
   */
  private packQuestionsColumnMajor(
    heights: number[],
    questionList: any[],
    startQ: number,
    cap: number,
    cols: number,
    stopBeforeIndexExclusive?: number
  ): {
    flatItems: PreviewPageItem[];
    columnStacks: PreviewPageItem[][];
    nextQ: number;
    pageHasOversized: boolean;
    usedAreaSum: number;
  } {
    const n = Math.min(
      questionList.length,
      stopBeforeIndexExclusive != null ? Math.max(startQ, stopBeforeIndexExclusive) : questionList.length
    );
    const colItems: PreviewPageItem[][] = Array.from({ length: cols }, () => []);
    const colHeights: number[] = Array(cols).fill(0);
    let q = startQ;
    let pageHasOversized = false;
    let c = 0;

    while (q < n && c < cols) {
      const hq = heights[q] ?? 0;
      if (hq > cap) {
        if (colItems[c].length === 0) {
          colItems[c].push({ q: questionList[q], index: q, previewGridCol: c + 1 });
          pageHasOversized = true;
          q++;
          c = cols;
          break;
        }
        c++;
        continue;
      }
      const lastIdx = colItems[c].length
        ? colItems[c][colItems[c].length - 1]!.index
        : -1;
      const addGap =
        lastIdx >= 0 ? this.questionBlockMarginBottomPx(questionList[lastIdx]) : 0;
      const nextH = colHeights[c] + addGap + hq;
      if (nextH <= cap) {
        colItems[c].push({ q: questionList[q], index: q, previewGridCol: c + 1 });
        colHeights[c] = nextH;
        q++;
      } else {
        c++;
      }
    }

    const columnStacks = colItems.map((col) => col.slice());
    const flatItems: PreviewPageItem[] = [];
    for (let cc = 0; cc < cols; cc++) {
      for (const it of colItems[cc]) {
        flatItems.push(it);
      }
    }
    const usedAreaSum = flatItems.reduce((s, it) => s + (heights[it.index] ?? 0), 0);
    return { flatItems, columnStacks, nextQ: q, pageHasOversized, usedAreaSum };
  }

  /** One vertical canvas: multi-column column-major fill (no horizontal page bands). */
  private splitIntoPagesSingleSection(
    heights: number[],
    innerH: number,
    headerH: number,
    questionList: any[]
  ): PreviewPage[] {
    const pages: PreviewPage[] = [];
    const n = questionList.length;
    let q = 0;
    let sheetPageIndex = 0;
    const breakAtMixedBoundary =
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasBothHeaderTypes() &&
      !this.mixedTypesSinglePageMergedHeader;
    const creativeCount = breakAtMixedBoundary
      ? questionList.filter((qq) => this.questionIsCreativeType(qq)).length
      : 0;

    const headerBudgetForPage = (startQ: number, si: number) => {
      if (!(this.questionHeader || '').trim() || headerH <= 0) {
        return 0;
      }
      if (breakAtMixedBoundary) {
        const inCreative = startQ < creativeCount;
        const show = inCreative ? si === 0 : startQ === creativeCount;
        return show ? headerH : 0;
      }
      return this.paperHeaderVisibleForSheetPage(si) ? headerH : 0;
    };

    while (q < n) {
      const pageInnerH = this.paginationInnerHeightPx(q, questionList);
      const cols = Math.max(1, Math.floor(this.layoutColumnsForPaginationPass(sheetPageIndex, q)));
      const capRaw = pageInnerH - headerBudgetForPage(q, sheetPageIndex);
      const cap = Math.max(1, capRaw);
      const mixedBoundary = breakAtMixedBoundary && q < creativeCount ? creativeCount : n;
      const packed = this.packQuestionsColumnMajor(heights, questionList, q, cap, cols, mixedBoundary);
      if (packed.flatItems.length === 0) {
        break;
      }
      q = packed.nextQ;
      const areaCap = Math.max(1, cap * cols);
      const fill = (packed.usedAreaSum / areaCap) * 100;
      const hasOversizedQuestion =
        packed.pageHasOversized || packed.flatItems.some((item) => (heights[item.index] ?? 0) > cap);
      pages.push({
        items: packed.flatItems,
        questionColumns: packed.columnStacks.map((c) => c.slice()),
        fillPercent: Math.round(fill * 10) / 10,
        hasOversizedQuestion,
      });
      sheetPageIndex++;
    }

    return pages;
  }

  /**
   * Multiple horizontal bands per page: each band uses column-major fill (same as single-section),
   * then the next band below.
   */
  private splitIntoPagesMultiSection(
    heights: number[],
    innerH: number,
    headerH: number,
    S: number,
    gap: number,
    questionList: any[]
  ): PreviewPage[] {
    const n = questionList.length;
    const pages: PreviewPage[] = [];
    let q = 0;
    const breakAtMixedBoundary =
      this.paperSubjectMetaLinesEligible() &&
      this.selectionHasBothHeaderTypes() &&
      !this.mixedTypesSinglePageMergedHeader;
    const creativeCount = breakAtMixedBoundary
      ? questionList.filter((qq) => this.questionIsCreativeType(qq)).length
      : 0;

    while (q < n) {
      const sheetPageIndex = pages.length;
      const pageInnerH = this.paginationInnerHeightPx(q, questionList);
      const C = Math.max(1, Math.floor(this.layoutColumnsForPaginationPass(sheetPageIndex, q)));
      const avail = Math.max(1, pageInnerH);
      const band = (avail - (S - 1) * gap) / S;
      const showHeaderThisPage =
        !!(this.questionHeader || '').trim() &&
        headerH > 0 &&
        (breakAtMixedBoundary
          ? q < creativeCount
            ? sheetPageIndex === 0
            : q === creativeCount
          : this.paperHeaderVisibleForSheetPage(sheetPageIndex));
      const headerPerSection = showHeaderThisPage ? headerH : 0;
      const sectionCap = Math.max(1, band - headerPerSection);

      if (band <= 0) {
        return this.splitIntoPagesSingleSection(heights, pageInnerH, headerH, questionList);
      }

      const sections: PreviewPageItem[][] = Array.from({ length: S }, () => []);
      const sectionQuestionColumns: PreviewPageItem[][][] = [];
      let pageHasOversized = false;
      let totalUsed = 0;

      for (let s = 0; s < S && q < n; s++) {
        const mixedBoundary = breakAtMixedBoundary && q < creativeCount ? creativeCount : n;
        const packed = this.packQuestionsColumnMajor(heights, questionList, q, sectionCap, C, mixedBoundary);
        sections[s] = packed.flatItems;
        sectionQuestionColumns.push(packed.columnStacks.map((c) => c.slice()));
        totalUsed += packed.usedAreaSum;
        pageHasOversized = pageHasOversized || packed.pageHasOversized;
        q = packed.nextQ;
      }

      let flat = sections.flat();
      if (flat.length === 0 && q < n) {
        const one: PreviewPageItem = { q: questionList[q], index: q, previewGridCol: 1 };
        sections[0] = [one];
        if (sectionQuestionColumns.length === 0) {
          sectionQuestionColumns.push([[one]]);
        } else {
          sectionQuestionColumns[0] = [[one]];
        }
        totalUsed += heights[q] ?? 0;
        pageHasOversized = true;
        q++;
        flat = sections.flat();
      }
      const areaCap = Math.max(1, S * sectionCap * C);
      const fillRaw = (totalUsed / areaCap) * 100;
      const fillPercent = Math.round(fillRaw * 10) / 10;
      const lineTops = this.computeSectionDividerTops(pageInnerH, 0, S, gap);
      const hasOversizedQuestion =
        pageHasOversized || flat.some((item) => (heights[item.index] ?? 0) > sectionCap);

      pages.push({
        items: flat,
        sections,
        sectionLineTopsPx: lineTops,
        sectionQuestionColumns,
        fillPercent,
        hasOversizedQuestion,
      });
    }

    return pages;
  }

  /** Paper dimensions in mm as defined for portrait (before orientation swap). */
  get paperSizeMmPortrait(): { w: number; h: number } {
    if (this.pageSize === 'Custom') {
      const wi = Math.max(
        QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
        Math.min(
          QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN,
          Number(this.customPageWidthIn) || QuestionCreatorComponent.a4WidthInDefault()
        )
      );
      const hi = Math.max(
        QuestionCreatorComponent.CUSTOM_PAGE_MIN_IN,
        Math.min(
          QuestionCreatorComponent.CUSTOM_PAGE_MAX_IN,
          Number(this.customPageHeightIn) || QuestionCreatorComponent.a4HeightInDefault()
        )
      );
      return { w: wi * QuestionCreatorComponent.INCH_TO_MM, h: hi * QuestionCreatorComponent.INCH_TO_MM };
    }
    return QuestionCreatorComponent.PAPER_MM[this.pageSize] ?? QuestionCreatorComponent.PAPER_MM['A4'];
  }

  /** Paper dimensions in mm after orientation (canvas size). */
  get paperSizeMm(): { w: number; h: number } {
    const p = this.paperSizeMmPortrait;
    if (this.pageOrientation === 'landscape') {
      return { w: p.h, h: p.w };
    }
    return { w: p.w, h: p.h };
  }

  /** Per-kind paper size (mm) based on CQ/MCQ orientation selectors. */
  private paperSizeMmForKind(kind: 'creative' | 'mcq'): { w: number; h: number } {
    const p = this.paperSizeMmPortrait;
    const o = kind === 'creative' ? this.cqPageOrientation : this.mcqPageOrientation;
    if (o === 'landscape') {
      return { w: p.h, h: p.w };
    }
    return { w: p.w, h: p.h };
  }

  /** Extra bottom “air” on MCQ preview sheets only (px). Not used for question packing or export. */
  private previewOnlyMcqExtraHeightPx(): number {
    return (
      QuestionCreatorComponent.PREVIEW_ONLY_MCQ_EXTRA_HEIGHT_IN *
      QuestionCreatorComponent.INCH_TO_MM *
      QuestionCreatorComponent.MM_TO_PX
    );
  }

  /**
   * Printable inner width (px) for CQ vs MCQ paper orientation.
   * Must match {@link contentInnerWidthPxForPage} for that kind — not {@link contentInnerWidthPx}, which uses
   * global {@link pageOrientation} only. Measuring CQ blocks at portrait width while the sheet is CQ landscape
   * inflates line wraps and breaks pagination vs preview, leaving a large empty band at the bottom.
   */
  private contentInnerWidthPxForKind(kind: 'creative' | 'mcq'): number {
    const paper = this.paperSizeMmForKind(kind);
    return Math.max(0, (paper.w - this.marginLeft - this.marginRight) * QuestionCreatorComponent.MM_TO_PX);
  }

  private clampPreviewQuestionFontPx(v: number): number {
    const n = Math.round(Number(v));
    return Math.max(
      QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MIN_PX,
      Math.min(
        QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_MAX_PX,
        Number.isFinite(n) ? n : QuestionCreatorComponent.PREVIEW_QUESTIONS_FONT_DEFAULT_PX
      )
    );
  }

  private previewQuestionsFontPxForQuestion(q: { type?: unknown } | null | undefined): number {
    if (this.questionIsCreativeType(q ?? {})) return this.previewQuestionsFontPxCreative;
    if (this.questionIsMcqType(q ?? {})) return this.previewQuestionsFontPxMcq;
    return this.previewQuestionsFontPx;
  }

  private previewQuestionsLineHeightForQuestion(q: { type?: unknown } | null | undefined): number {
    if (this.questionIsCreativeType(q ?? {})) return this.previewQuestionsLineHeightCreative;
    if (this.questionIsMcqType(q ?? {})) return this.previewQuestionsLineHeightMcq;
    return this.previewQuestionsLineHeight;
  }

  private paginationInnerHeightPx(startQ: number, questionList: any[]): number {
    if (startQ < 0 || startQ >= questionList.length) {
      return Math.max(1, this.contentInnerHeightPx);
    }

    const kind = this.questionIsCreativeType(questionList[startQ]) ? 'creative' : 'mcq';

    const paper = this.paperSizeMmForKind(kind);
    const bottom = this.previewBottomMarginMmForKind(kind);
    const h = Math.max(
      0,
      (paper.h - this.marginTop - bottom) * QuestionCreatorComponent.MM_TO_PX
    );
    return Math.max(1, h);
  }

  paperWidthPxForPage(pageIndex: number): number {
    const kind = this.previewKindForSheetPage(pageIndex);
    return this.paperSizeMmForKind(kind).w * QuestionCreatorComponent.MM_TO_PX;
  }

  paperHeightPxForPage(pageIndex: number): number {
    const kind = this.previewKindForSheetPage(pageIndex);
    const base = this.paperSizeMmForKind(kind).h * QuestionCreatorComponent.MM_TO_PX;
    return kind === 'mcq' ? base + this.previewOnlyMcqExtraHeightPx() : base;
  }

  marginTopPxForPage(pageIndex: number): number {
    return this.marginTopPx;
  }

  marginRightPxForPage(pageIndex: number): number {
    return this.marginRightPx;
  }

  marginBottomPxForPage(pageIndex: number): number {
    const kind = this.previewKindForSheetPage(pageIndex);
    const base = this.previewBottomMarginMmForKind(kind) * QuestionCreatorComponent.MM_TO_PX;
    return kind === 'mcq' ? base + this.previewOnlyMcqExtraHeightPx() : base;
  }

  marginLeftPxForPage(pageIndex: number): number {
    return this.marginLeftPx;
  }

  contentInnerWidthPxForPage(pageIndex: number): number {
    const kind = this.previewKindForSheetPage(pageIndex);
    const paper = this.paperSizeMmForKind(kind);
    return Math.max(0, (paper.w - this.marginLeft - this.marginRight) * QuestionCreatorComponent.MM_TO_PX);
  }

  contentInnerHeightPxForPage(pageIndex: number): number {
    const kind = this.previewKindForSheetPage(pageIndex);
    const paper = this.paperSizeMmForKind(kind);
    const bottom = this.previewBottomMarginMmForKind(kind);
    return Math.max(
      0,
      (paper.h - this.marginTop - bottom) * QuestionCreatorComponent.MM_TO_PX
    );
  }

  /** Scale-wrap width: max sheet width when pages differ (landscape vs portrait). */
  get previewPaperWidthPxMax(): number {
    if (this.paginatedPages.length === 0) {
      return this.paperWidthPx;
    }
    return Math.max(...this.paginatedPages.map((_, pi) => this.paperWidthPxForPage(pi)));
  }

  /** Measurement rail container width so CQ vs MCQ blocks can use different column widths. */
  get measureRailInnerWidthPx(): number {
    if (this.paginatedPages.length === 0) {
      return this.contentInnerWidthPx;
    }
    return Math.max(...this.paginatedPages.map((_, pi) => this.contentInnerWidthPxForPage(pi)));
  }

  get paperWidthPx(): number {
    return this.paperSizeMm.w * QuestionCreatorComponent.MM_TO_PX;
  }

  get paperHeightPx(): number {
    return this.paperSizeMm.h * QuestionCreatorComponent.MM_TO_PX;
  }

  get marginTopPx(): number {
    return this.marginTop * QuestionCreatorComponent.MM_TO_PX;
  }
  get marginRightPx(): number {
    return this.marginRight * QuestionCreatorComponent.MM_TO_PX;
  }
  get marginBottomPx(): number {
    return this.marginBottom * QuestionCreatorComponent.MM_TO_PX;
  }
  get marginLeftPx(): number {
    return this.marginLeft * QuestionCreatorComponent.MM_TO_PX;
  }

  /** Printable area width inside margins (px). */
  get contentInnerWidthPx(): number {
    const { w } = this.paperSizeMm;
    return Math.max(0, (w - this.marginLeft - this.marginRight) * QuestionCreatorComponent.MM_TO_PX);
  }

  /** Printable area height inside margins (px). */
  get contentInnerHeightPx(): number {
    const { h } = this.paperSizeMm;
    const bottom = this.marginBottom;
    return Math.max(0, (h - this.marginTop - bottom) * QuestionCreatorComponent.MM_TO_PX);
  }

  /** Total height under #scaleWrap at 1:1 px (toolbars + fixed-height pages + gaps; for magnifier). */
  get previewStackHeightPx(): number {
    const n = this.paginatedPages.length;
    if (n === 0) {
      return this.paperHeightPx;
    }
    const toolbarPx = 40; /* toolbar row + margin-bottom; keep loosely in sync with CSS */
    const gapBetweenPagesPx = 12;
    // Use per-page height in all modes (Regular can now have CQ/MCQ with different orientations).
    let sum = 0;
    for (let pi = 0; pi < n; pi++) {
      sum += this.paperHeightPxForPage(pi) + toolbarPx;
    }
    return sum + (n - 1) * gapBetweenPagesPx;
  }

  trackPage = (_: number, p: PreviewPage) =>
    p.sections?.length
      ? p.sections.map((sec) => sec.map((x) => x.index).join('-')).join('|')
      : p.items.map((x) => x.index).join('-');

  trackItem = (_: number, row: PreviewPageItem) => row.index;

  trackColumn = (index: number, _col: PreviewPageItem[]) => index;

  trackPreviewQuestion(_index: number, q: { qid?: string | number }): string | number {
    return q?.qid != null ? q.qid : _index;
  }

  /**
   * Magnifier while pointer is over question copy (`.preview-questions`) or the page toolbar (when shown).
   * Attached to `.preview-live-stage` so movement across the full preview area is tracked.
   */
  onPreviewStageMouseMove(event: MouseEvent): void {
    if (!this.paginatedPages.length || !this.scaleWrap?.nativeElement) {
      return;
    }
    const t = event.target as HTMLElement | null;
    if (!t?.closest('.preview-questions, .preview-sheet-toolbar, .preview-header')) {
      this.onMagnifierLeave();
      return;
    }
    this.magnifierActive = true;
    this.runMagnifierPosition(event);
  }

  onMagnifierLeave(): void {
    this.magnifierActive = false;
    if (this.magnifierRaf) {
      cancelAnimationFrame(this.magnifierRaf);
      this.magnifierRaf = 0;
    }
    this.cdr.markForCheck();
  }

  private runMagnifierPosition(event: MouseEvent): void {
    if (!this.scaleWrap?.nativeElement) {
      return;
    }
    if (this.magnifierRaf) cancelAnimationFrame(this.magnifierRaf);
    const clientX = event.clientX;
    const clientY = event.clientY;
    this.magnifierRaf = requestAnimationFrame(() => {
      this.magnifierRaf = 0;
      const scaleEl = this.scaleWrap!.nativeElement;
      const sr = scaleEl.getBoundingClientRect();

      const mx = clientX - sr.left;
      const my = clientY - sr.top;
      const overview = this.previewFitScale;
      const lens = this.magnifierLensScale;
      let ux = mx / overview;
      let uy = my / overview;
      ux = Math.max(0, Math.min(ux, this.previewPaperWidthPxMax));
      uy = Math.max(0, Math.min(uy, this.previewStackHeightPx));

      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const colEl = this.previewCol?.nativeElement;
      if (colEl) {
        const cr = colEl.getBoundingClientRect();
        this.lensW = Math.max(120, Math.round(cr.width));
        this.lensFixedLeft = Math.round(cr.left);
        this.lensH = Math.min(280, Math.max(140, Math.round(this.lensW * 0.22)));
      } else {
        this.lensW = this.lensSizePx;
        this.lensH = this.lensSizePx;
        this.lensFixedLeft = Math.max(pad, Math.min(clientX - this.lensW / 2, vw - this.lensW - pad));
      }

      if (this.lensFixedLeft + this.lensW > vw - pad) {
        this.lensFixedLeft = Math.max(pad, vw - pad - this.lensW);
      }
      if (this.lensFixedLeft < pad) {
        this.lensFixedLeft = pad;
      }

      this.lensFixedTop = clientY - this.lensH / 2;
      this.lensFixedTop = Math.max(pad, Math.min(this.lensFixedTop, vh - this.lensH - pad));

      const cursorInLensX = clientX - this.lensFixedLeft;
      const cursorInLensY = clientY - this.lensFixedTop;
      this.magnifierTransform = `translate(${cursorInLensX - lens * ux}px, ${cursorInLensY - lens * uy}px) scale(${lens})`;

      this.cdr.markForCheck();
    });
  }

  removeQuestion(qid: number | string): void {
    this.questions = this.questions.filter((q) => q.qid !== qid);
    this.clearMcqPersistedOrders();
    this.scheduleLayout();
    this.schedulePersistCreatorStateToLocalStorage();
  }

  goBack(): void {
    this.router.navigate(['/question']);
  }

  /** Auto-fit preview, then same Save flow as the toolbar (no Save when the draft is empty). */
  onSmartQuestionCreator(): void {
    this.syncPageOrientationForQTypeFilter();
    this.schedulePersistCreatorStateToLocalStorage();
    this.cdr.markForCheck();
    if (this.questions.length === 0) {
      this.onPreviewLayoutChange({ suppressAutoFit: false });
      return;
    }
    void this.runAutoFitThenSave();
  }

  onMarginPresetChange(): void {
    if (this.marginPreset === 'narrow') {
      this.marginTop = this.marginRight = this.marginBottom = this.marginLeft = 12.7;
    } else if (this.marginPreset === 'standard') {
      this.marginTop = this.marginRight = this.marginBottom = this.marginLeft = 25.4;
    } else if (this.marginPreset === 'wide') {
      this.marginTop = this.marginRight = this.marginBottom = this.marginLeft = 38.1;
    }
    // Do not auto-fit on manual margin tweaks; it can silently shrink fonts that PDF later uses verbatim.
    this.onPreviewLayoutChange();
  }

  /** Display inch value for a given margin side while storing mm internally. */
  marginIn(side: 'top' | 'right' | 'bottom' | 'left'): number {
    const mm =
      side === 'top'
        ? this.marginTop
        : side === 'right'
          ? this.marginRight
          : side === 'bottom'
            ? this.marginBottom
            : this.marginLeft;
    return QuestionCreatorComponent.roundInches2(mm / QuestionCreatorComponent.INCH_TO_MM);
  }

  onCustomMarginInInput(side: 'top' | 'right' | 'bottom' | 'left', raw: string | number): void {
    const empty = raw === '' || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const mm = Math.max(0, n * QuestionCreatorComponent.INCH_TO_MM);
    if (side === 'top') this.marginTop = mm;
    else if (side === 'right') this.marginRight = mm;
    else if (side === 'bottom') this.marginBottom = mm;
    else this.marginLeft = mm;
    this.onPreviewLayoutChange();
  }

  onCustomMarginInBlur(side: 'top' | 'right' | 'bottom' | 'left'): void {
    const inVal = this.marginIn(side);
    const mm = Math.max(0, inVal * QuestionCreatorComponent.INCH_TO_MM);
    if (side === 'top') this.marginTop = mm;
    else if (side === 'right') this.marginRight = mm;
    else if (side === 'bottom') this.marginBottom = mm;
    else this.marginLeft = mm;
    this.onPreviewLayoutChange();
  }

  get defaultFileNameBase(): string {
    const parts: string[] = [];
    if (this.context.subject_tr) parts.push(this.context.subject_tr.replace(/\s+/g, '_'));
    if (this.context.chapter) parts.push('Chapter_' + String(this.context.chapter).replace(/\s+/g, '_'));
    const tp = (this.context.topic ?? '').trim();
    if (tp && !/^\d+$/.test(tp)) {
      parts.push(String(this.context.topic).replace(/\s+/g, '_'));
    }
    return parts.length ? parts.join('_') : 'questions';
  }

  get defaultPdfName(): string {
    return this.exportFileNameBase + '.pdf';
  }

  get defaultDocxName(): string {
    return this.exportFileNameBase + '.docx';
  }

  /** Snapshot of layout options stored with the created set and mirrored on re-export. */
  private buildLayoutSettingsForPersist(): Record<string, unknown> {
    const previewSerialByIndex: Record<string, number> = {};
    for (let i = 0; i < this.previewQuestions.length; i++) {
      const serial = this.previewQuestionDisplaySerialOneBased(i, this.previewQuestions[i]!);
      previewSerialByIndex[String(i)] = serial;
    }
    const exportPreviewPagePlan =
      this.pageSections <= 1
        ? this.paginatedPages.map((page, pi) => ({
            // Sheet content kind (CQ vs MCQ): must match pagination/preview margins and column basis.
            kind: this.previewKindForSheetPage(pi),
            // Header block variant (creative vs MCQ styling): can differ from kind when meta lines are off, etc.
            headerKind: this.headerVariantForPage(pi),
            leadEmpty: this.landscapeLeadEmptyFirstColumnForSheetPage(pi),
            headerVisible: this.paperHeaderVisibleForSheetPage(pi),
            headerInFirstColumn: this.headerInFirstColumnLandscape(pi),
            questionColumnIndexes: (page.questionColumns ?? [page.items]).map((col) =>
              col.map((it) => it.index)
            ),
            leadBindingIndexes: (page.leadBindingItems ?? []).map((it) => it.index),
          }))
        : [];
    const leadBindingItemIndexes =
      this.leadEmptyFirstPageActive && this.paginatedPages?.length
        ? (this.paginatedPages[0]?.leadBindingItems ?? [])
            .map((it) => Number(it?.index))
            .filter((n) => Number.isFinite(n) && n >= 0)
        : [];
    return {
      pageSize: this.pageSize,
      pageOrientation: this.pageOrientation,
      cqPageOrientation: this.cqPageOrientation,
      mcqPageOrientation: this.mcqPageOrientation,
      customPageWidthIn: this.customPageWidthIn,
      customPageHeightIn: this.customPageHeightIn,
      marginPreset: this.marginPreset,
      marginTop: this.marginTop,
      marginRight: this.marginRight,
      marginBottom: this.marginBottom,
      marginLeft: this.marginLeft,
      questionsPadding: this.questionsPadding,
      questionsGap: this.questionsGap,
      questionsGapCreative: this.questionsGapCreative,
      previewQuestionsFontPx: this.previewQuestionsFontPx,
      previewQuestionsFontPxCreative: this.previewQuestionsFontPxCreative,
      previewQuestionsFontPxMcq: this.previewQuestionsFontPxMcq,
      layoutColumns: this.layoutColumns,
      layoutColumnsCreative: this.layoutColumnsCreative,
      layoutColumnGapPx: this.layoutColumnGapPx,
      showColumnDivider: this.showColumnDivider,
      optionsColumns: this.optionsColumns,
      previewHeaderLineHeight: this.previewHeaderLineHeight,
      previewQuestionsLineHeight: this.previewQuestionsLineHeight,
      previewQuestionsLineHeightCreative: this.previewQuestionsLineHeightCreative,
      previewQuestionsLineHeightMcq: this.previewQuestionsLineHeightMcq,
      pageSections: this.pageSections,
      sectionGapPx: this.sectionGapPx,
      leadEmptyFirstPageActive: this.leadEmptyFirstPageActive,
      ...(leadBindingItemIndexes.length > 0 ? { leadBindingItemIndexes } : {}),
      previewSerialByIndex,
      ...(exportPreviewPagePlan.length > 0 ? { exportPreviewPagePlan } : {}),
      mixedTypesSinglePageMergedHeader: this.mixedTypesSinglePageMergedHeader,
      headerEiin: this.headerEiin,
      headerInstitute: this.headerInstitute,
      headerExamTypeKey: this.headerExamTypeKey,
      headerUseLegacyQuestionHeader: this.headerUseLegacyQuestionHeader,
      headerManualEditSinceRebuild: this.headerManualEditSinceRebuild,
      headerLineFontSizes: [...this.headerLineFontSizes],
      mcqSetLetter: this.selectedMcqSetLetter,
      ...(Object.keys(this.persistedMcqOrderBySet).length > 0
        ? { mcqOrderBySet: { ...this.persistedMcqOrderBySet } }
        : {}),
      ...(Object.keys(this.questionHeaderByMcqSet).length > 0
        ? { questionHeaderByMcqSet: { ...this.questionHeaderByMcqSet } }
        : {}),
      /** Same order as PDF export (`previewQuestions`); draft `questions` may differ. */
      exportPreviewQuestionQids: this.previewQuestions.map((q) => q.qid),
    };
  }

  save(): void {
    if (!this.apiService.isLoggedIn()) {
      // Preserve full rows for post-login return, so preview isn't forced to rely on immediate API hydration.
      sessionStorage.setItem(
        QUESTION_CREATOR_STATE_KEY,
        JSON.stringify({ ...this.buildPersistPayload(), questions: this.questions })
      );
      localStorage.setItem('returnUrl', '/question/create');
      this.router.navigate(['/login']);
      return;
    }

    this.apiService.getCustomerSettings().subscribe({
      next: (res) => {
        const format = res.settings?.['export_format'] as ExportFormat | undefined;
        if (format === 'both' || format === 'pdf' || format === 'docx') {
          this.doSave(format);
        } else {
          this.showExportFormatDialog = true;
        }
      },
      error: () => {
        this.showExportFormatDialog = true;
      },
    });
  }

  confirmExportFormat(): void {
    const chosen = this.exportFormat;
    // Do not block export on settings API latency/failure.
    this.showExportFormatDialog = false;
    this.doSave(chosen);
    this.apiService.updateCustomerSettings({ export_format: chosen }).subscribe({
      next: () => {},
      error: () => {},
    });
  }

  private doSave(format: ExportFormat): void {
    void this.doSaveAsync(format);
  }

  private async doSaveAsync(format: ExportFormat): Promise<void> {
    this.saving = true;
    this.saveSuccessMessage = '';
    this.loadingService.beginPdfDocxExport(format);
    try {
      await this.runDoSaveExportFlow(format);
    } catch {
      this.saveSuccessMessage = 'Failed to prepare export. Please try again.';
    } finally {
      this.saving = false;
      this.endExportLoadingOverlay();
    }
  }

  private async runDoSaveExportFlow(format: ExportFormat): Promise<void> {
    const toRequest: ('pdf' | 'docx')[] = [];
    if (format === 'both' || format === 'pdf') toRequest.push('pdf');
    if (format === 'both' || format === 'docx') toRequest.push('docx');

    const multiMcq = this.shouldExportFourMcqSetFiles();
    if (multiMcq) {
      const letters = [...QuestionCreatorComponent.MCQ_SET_LETTERS];
      const orderSnap: typeof this.persistedMcqOrderBySet = {};
      const headerSnap: typeof this.questionHeaderByMcqSet = {};
      for (const L of letters) {
        const ordered = this.buildQuestionsOrderedForMcqSet(L);
        orderSnap[L] = ordered.map((q) => q.qid);
        headerSnap[L] = this.buildQuestionHeaderForPersist(L);
      }
      this.persistedMcqOrderBySet = orderSnap;
      this.questionHeaderByMcqSet = headerSnap;
      this.mcqOrdersFrozen = true;
    } else {
      this.clearMcqPersistedOrders();
    }

    const perSetLayout: Partial<
      Record<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number], Record<string, unknown>>
    > = {};
    let layoutSettingsForCreate: Record<string, unknown>;
    if (multiMcq) {
      const prevLetter = this.selectedMcqSetLetter;
      for (const L of QuestionCreatorComponent.MCQ_SET_LETTERS) {
        this.selectedMcqSetLetter = L;
        this.onPreviewLayoutChange({ suppressAutoFit: true });
        await this.waitForLayoutIdle();
        perSetLayout[L] = this.buildLayoutSettingsForPersist();
      }
      this.selectedMcqSetLetter = prevLetter;
      this.onPreviewLayoutChange({ suppressAutoFit: true });
      await this.waitForLayoutIdle();
      layoutSettingsForCreate = this.buildLayoutSettingsForPersist();
    } else {
      if (this.selectionHasMcqType() && this.selectedMcqSetLetter != null) {
        this.onPreviewLayoutChange({ suppressAutoFit: true });
        await this.waitForLayoutIdle();
      }
      layoutSettingsForCreate = this.buildLayoutSettingsForPersist();
    }

    const basePayload = {
      questions: this.previewQuestions,
      pageSize: this.pageSize,
      pageOrientation: this.pageOrientation,
      cqPageOrientation: this.cqPageOrientation,
      mcqPageOrientation: this.mcqPageOrientation,
      customPageWidthIn: this.customPageWidthIn,
      customPageHeightIn: this.customPageHeightIn,
      marginTop: this.marginTop,
      marginRight: this.marginRight,
      marginBottom: this.marginBottom,
      marginLeft: this.marginLeft,
      questionsPadding: this.questionsPadding,
      questionsGap: this.questionsGap,
      questionsGapCreative: this.questionsGapCreative,
      previewQuestionsFontPx: this.previewQuestionsFontPx,
      previewQuestionsFontPxCreative: this.previewQuestionsFontPxCreative,
      previewQuestionsFontPxMcq: this.previewQuestionsFontPxMcq,
      previewHeaderLineHeight: this.previewHeaderLineHeight,
      previewQuestionsLineHeight: this.previewQuestionsLineHeight,
      previewQuestionsLineHeightCreative: this.previewQuestionsLineHeightCreative,
      previewQuestionsLineHeightMcq: this.previewQuestionsLineHeightMcq,
      layoutColumns: this.layoutColumns,
      layoutColumnsCreative: this.layoutColumnsCreative,
      layoutColumnGapPx: this.layoutColumnGapPx,
      showColumnDivider: this.showColumnDivider,
      optionsColumns: this.optionsColumns,
      pageSections: this.pageSections,
      sectionGapPx: this.sectionGapPx,
      headerLineFontSizes: [...this.headerLineFontSizes],
      headerEiin: this.headerEiin,
      headerInstitute: this.headerInstitute,
      layout_settings: layoutSettingsForCreate,
    };

    const setVariants: Array<(typeof QuestionCreatorComponent.MCQ_SET_LETTERS)[number] | null> = multiMcq
      ? [...QuestionCreatorComponent.MCQ_SET_LETTERS]
      : [null];

    const requests: ReturnType<ApiService['exportQuestions']>[] = [];
    const downloadNames: string[] = [];
    /** Persist first computed split headers (mixed CQ+MCQ) for Created Questions re-download. */
    let persistedExportSplitHeaders: {
      exportQuestionHeaderCreative?: string;
      exportQuestionHeaderMcq?: string;
      headerLineFontSizesPdfCreative?: number[];
      headerLineFontSizesPdfMcq?: number[];
    } = {};
    for (const setLetter of setVariants) {
      if (multiMcq && setLetter != null) {
        this.applyLayoutAndHeaderFromParsed(perSetLayout[setLetter] as Record<string, unknown>, {
          trustSavedHeader: true,
        });
        this.onPreviewLayoutChange({ suppressAutoFit: true });
        await this.waitForLayoutIdle();
      }
      const fname =
        setLetter != null ? `${this.exportFileNameBase}-${setLetter}` : this.exportFileNameBase;
      const header =
        setLetter != null
          ? (this.questionHeaderByMcqSet[setLetter] ?? this.buildQuestionHeaderForPersist(setLetter))
          : this.buildQuestionHeaderForPersist();
      const questionsForFile =
        setLetter != null
          ? this.reorderQuestionsFromQidList(this.persistedMcqOrderBySet[setLetter])
          : this.previewQuestions;

      // Export-only: send per-kind header strings so PDF header matches preview exactly in mixed mode.
      const canSplitHeaderByKind =
        !this.headerUseLegacyQuestionHeader &&
        this.paperSubjectMetaLinesEligible() &&
        this.selectionHasBothHeaderTypes() &&
        !this.mixedTypesSinglePageMergedHeader;
      const buildHeaderForPdfKind = (kind: 'creative' | 'mcq'): string => {
        if (!canSplitHeaderByKind) {
          return header;
        }
        const setL = setLetter !== null ? setLetter : this.selectedMcqSetLetter;
        const firstPageIndexForVariant = (v: 'creative' | 'mcq'): number => {
          // Use the same decision logic as preview (important when pagination differs).
          const n = Array.isArray(this.paginatedPages) ? this.paginatedPages.length : 0;
          for (let i = 0; i < n; i++) {
            if (this.headerVariantForPage(i) === v) {
              return i;
            }
          }
          return 0;
        };
        const ensureCodeLine = (raw: string | null | undefined, fallback: string): string => {
          const s = (raw ?? '').trim();
          return s.length ? s : fallback;
        };
        if (kind === 'creative') {
          const piCq = firstPageIndexForVariant('creative');
          const topLines = this.creativeHeaderTopLinesPadded().flatMap((ln, i) => {
            if (this.creativeShowSqSplitTopRow(i, ln)) {
              return [this.creativeSqSplitLineFirst(ln), this.creativeSqSplitLineSecond(ln)];
            }
            return [ln ?? ''];
          });
          const band = this.creativeHeaderBandLeftLines();
          const codeLine = ensureCodeLine(
            this.mixedUnifiedCodeGridPlainLine(),
            this.paperHeaderLine4Plain(piCq, setL)
          );
          // Backend turns first "বিষয় কোড" line into the code grid; keep exactly one such line here.
          return (band.length
            ? [...topLines, band[0] ?? '', codeLine, ...band.slice(1)]
            : [...topLines, codeLine]
          )
            .join('\n')
            .trimEnd();
        }

        const piMcq = firstPageIndexForVariant('mcq');
        const slots = this.mcqHeaderUpperLineSlots(piMcq);
        const upper: string[] = [];
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i]!;
          let txt = '';
          if (s.kind === 'text') txt = s.text ?? '';
          else if (s.kind === 'mcqTitle') txt = 'বহুনির্বাচনি অভীক্ষা';
          else if (s.kind === 'mcqSubject') txt = this.creatorSubjectLabel || '';
          if (this.mcqShowSqSplitMcqBandRow(piMcq, i, s as any)) {
            upper.push(this.mcqSqSplitLineFirst(txt), this.mcqSqSplitLineSecond(txt));
          } else {
            upper.push(txt);
          }
        }
        const codeLine = this.paperHeaderLine4Plain(piMcq, setL);
        const lower = this.mcqHeaderLowerLines();
        return [...upper, codeLine, ...lower].join('\n').trimEnd();
      };
      const headerCreative = canSplitHeaderByKind ? buildHeaderForPdfKind('creative') : undefined;
      const headerMcq = canSplitHeaderByKind ? buildHeaderForPdfKind('mcq') : undefined;
      let pdfHeaderLineFontPxCreative = canSplitHeaderByKind
        ? this.buildPdfHeaderLineFontPxListForSplitExport('creative', setLetter)
        : [];
      let pdfHeaderLineFontPxMcq = canSplitHeaderByKind
        ? this.buildPdfHeaderLineFontPxListForSplitExport('mcq', setLetter)
        : [];
      const alignPdfHeaderFontsToNewlineCount = (hdr: string | undefined, px: number[]): number[] => {
        if (!hdr || !px.length) return px;
        const n = hdr.replace(/\r\n/g, '\n').split('\n').length;
        if (px.length === n) return px;
        if (px.length > n) return px.slice(0, n);
        const last = px[px.length - 1] ?? 14;
        const out = px.slice();
        while (out.length < n) out.push(last);
        return out;
      };
      pdfHeaderLineFontPxCreative = alignPdfHeaderFontsToNewlineCount(headerCreative, pdfHeaderLineFontPxCreative);
      pdfHeaderLineFontPxMcq = alignPdfHeaderFontsToNewlineCount(headerMcq, pdfHeaderLineFontPxMcq);
      if (
        headerCreative &&
        headerMcq &&
        persistedExportSplitHeaders.exportQuestionHeaderCreative === undefined
      ) {
        persistedExportSplitHeaders = {
          exportQuestionHeaderCreative: headerCreative,
          exportQuestionHeaderMcq: headerMcq,
          ...(pdfHeaderLineFontPxCreative.length ? { headerLineFontSizesPdfCreative: pdfHeaderLineFontPxCreative } : {}),
          ...(pdfHeaderLineFontPxMcq.length ? { headerLineFontSizesPdfMcq: pdfHeaderLineFontPxMcq } : {}),
        };
      }

      for (const fmt of toRequest) {
        const layoutForVariant =
          multiMcq && setLetter != null ? perSetLayout[setLetter] : layoutSettingsForCreate;
        requests.push(
          this.apiService.exportQuestions({
            ...basePayload,
            layout_settings: layoutForVariant ?? layoutSettingsForCreate,
            questions: questionsForFile,
            questionHeader: header,
            ...(headerCreative ? { questionHeaderCreative: headerCreative } : {}),
            ...(headerMcq ? { questionHeaderMcq: headerMcq } : {}),
            ...(pdfHeaderLineFontPxCreative.length ? { headerLineFontSizesPdfCreative: pdfHeaderLineFontPxCreative } : {}),
            ...(pdfHeaderLineFontPxMcq.length ? { headerLineFontSizesPdfMcq: pdfHeaderLineFontPxMcq } : {}),
            filename: fname,
            format: fmt,
          } as any)
        );
        downloadNames.push(fmt === 'pdf' ? `${fname}.pdf` : `${fname}.docx`);
      }
    }

    if (multiMcq) {
      this.applyLayoutAndHeaderFromParsed(layoutSettingsForCreate as Record<string, unknown>, {
        trustSavedHeader: true,
      });
      this.onPreviewLayoutChange({ suppressAutoFit: true });
      await this.waitForLayoutIdle();
    }

    let blobs: Blob[];
    try {
      blobs = await firstValueFrom(forkJoin(requests));
    } catch {
      this.saveSuccessMessage = 'Failed to generate files. Please try again.';
      return;
    }

    for (let i = 0; i < blobs.length; i++) {
      this.downloadBlob(blobs[i]!, downloadNames[i]!);
      if (i < blobs.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const listed = downloadNames.join(', ');
    this.saveSuccessMessage = multiMcq
      ? `Created and downloaded (${setVariants.length} sets × formats): ${listed}. Saved to Created Questions.`
      : `Created and downloaded: ${listed}. Saved to Created Questions.`;
    this.cdr.markForCheck();

    try {
      const created = await firstValueFrom(
        this.apiService.createQuestionSet({
          name: this.createdQuestionSetName,
          question_header: multiMcq
            ? (this.questionHeaderByMcqSet['ক'] ?? this.buildQuestionHeaderForPersist('ক'))
            : this.buildQuestionHeaderForPersist(),
          questions: this.questions,
          layout_settings: {
            ...layoutSettingsForCreate,
            ...persistedExportSplitHeaders,
          },
        })
      );
      this.commitExamSerialAfterSave();
      try {
        if (created?.id != null) {
          localStorage.setItem(CREATED_QUESTIONS_LAST_SAVED_SET_ID_KEY, String(created.id));
        }
      } catch (_) {
        /* quota */
      }
      const highlightId = created?.id != null ? String(created.id) : '';
      this.ngZone.run(() => {
        void this.router.navigate(['/created-questions'], { queryParams: { highlight: highlightId } });
      });
    } catch {
      this.saveSuccessMessage =
        'Files downloaded but saving the set failed. You can try Save again or open Created Questions.';
      this.cdr.markForCheck();
    }
  }

  /**
   * In-browser save (blob URL). Append to DOM + delayed revoke so download managers / Chromium finish
   * reading the blob; immediate revoke can cancel the transfer and block navigation after multi-file export.
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
  }
}
