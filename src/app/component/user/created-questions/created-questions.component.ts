import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ApiService, CreatedQuestionSet } from '../../../service/api.service';
import { LoadingService } from 'src/app/service/loading.service';
import {
  buildAnswerSheetExportItems,
  hasPersistedFourMcqVariants,
  parseMcqOrderBySet,
  parseQuestionHeaderByMcqSet,
  reorderQuestionsByQids,
} from '../../../shared/question-answer-sheet-export';

@Component({
  selector: 'app-created-questions',
  templateUrl: './created-questions.component.html',
  styleUrls: ['./created-questions.component.css']
})
export class CreatedQuestionsComponent implements OnInit, AfterViewInit {
  private static readonly MCQ_SET_LETTERS = ['ক', 'খ', 'গ', 'ঘ'] as const;

  sets: CreatedQuestionSet[] = [];
  loading = true;
  error = '';
  renamingId: number | null = null;
  renameValue = '';
  selectedSubject = '';
  selectedChapter = '';
  downloadingAllPdf = false;
  /** Row IDs selected for bulk delete (subset of currently visible filtered rows when filters change). */
  selectedIds: number[] = [];
  deletingBulk = false;
  /** From `?highlight=` after saving from question creator. */
  highlightSetId: number | null = null;

  constructor(
    private apiService: ApiService,
    private loadingService: LoadingService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    const h = this.route.snapshot.queryParamMap.get('highlight');
    if (h) {
      const n = parseInt(h, 10);
      if (Number.isFinite(n)) {
        this.highlightSetId = n;
      }
    }
    this.load();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  /** Parse name like "Subject_Chapter_No_Topics..." into subject and chapter keys for filtering. */
  getParsed(name: string): { subjectKey: string; chapterKey: string } {
    if (!name || !name.trim()) return { subjectKey: '', chapterKey: '' };
    const n = name.trim();
    const idx = n.search(/_Chapter_/i);
    if (idx < 0) return { subjectKey: n, chapterKey: '' };
    const subjectKey = n.slice(0, idx);
    const after = n.slice(idx + '_Chapter_'.length);
    const chapterKey = after.split('_')[0]?.trim() || '';
    return { subjectKey, chapterKey };
  }

  /** Unique subject keys (for filter dropdown) from current sets. */
  get subjectOptions(): { value: string; label: string }[] {
    const keys = new Set<string>();
    this.sets.forEach(s => {
      const { subjectKey } = this.getParsed(s.name);
      if (subjectKey) keys.add(subjectKey);
    });
    return [{ value: '', label: 'All subjects' }, ...Array.from(keys).sort().map(k => ({ value: k, label: k.replace(/_/g, ' ') }))];
  }

  /** Chapter options: all chapters, or only chapters for selected subject. */
  get chapterOptions(): { value: string; label: string }[] {
    const keys = new Set<string>();
    this.sets.forEach(s => {
      const { subjectKey, chapterKey } = this.getParsed(s.name);
      if (this.selectedSubject && subjectKey !== this.selectedSubject) return;
      if (chapterKey) keys.add(chapterKey);
    });
    return [{ value: '', label: 'All chapters' }, ...Array.from(keys).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b)).map(k => ({ value: k, label: k }))];
  }

  /** Sets filtered by selected subject and chapter. */
  get filteredSets(): CreatedQuestionSet[] {
    if (!this.selectedSubject && !this.selectedChapter) return this.sets;
    return this.sets.filter(s => {
      const { subjectKey, chapterKey } = this.getParsed(s.name);
      if (this.selectedSubject && subjectKey !== this.selectedSubject) return false;
      if (this.selectedChapter && chapterKey !== this.selectedChapter) return false;
      return true;
    });
  }

  /** True when every visible filtered row is selected. */
  get allFilteredSelected(): boolean {
    const f = this.filteredSets;
    return f.length > 0 && f.every((s) => this.selectedIds.includes(s.id));
  }

  /** True when the bulk action should read “Delete All” (all visible rows selected). */
  get isBulkDeleteAllLabel(): boolean {
    return this.allFilteredSelected;
  }

  onSubjectFilterChange(): void {
    this.selectedChapter = '';
    this.pruneSelectionToFiltered();
  }

  pruneSelectionToFiltered(): void {
    const allowed = new Set(this.filteredSets.map((s) => s.id));
    this.selectedIds = this.selectedIds.filter((id) => allowed.has(id));
  }

  isRowSelected(id: number): boolean {
    return this.selectedIds.includes(id);
  }

  toggleRowSelection(id: number): void {
    const i = this.selectedIds.indexOf(id);
    if (i >= 0) {
      this.selectedIds = this.selectedIds.filter((x) => x !== id);
    } else {
      this.selectedIds = [...this.selectedIds, id];
    }
  }

  toggleSelectAllFiltered(checked: boolean): void {
    const ids = this.filteredSets.map((s) => s.id);
    const idSet = new Set(ids);
    if (checked) {
      this.selectedIds = [...new Set([...this.selectedIds, ...ids])];
    } else {
      this.selectedIds = this.selectedIds.filter((id) => !idSet.has(id));
    }
  }

  /** Toggle selection when clicking the row (title, SL, meta); ignore clicks on checkboxes and controls. */
  onRowClick(ev: MouseEvent, id: number): void {
    const el = ev.target as HTMLElement | null;
    if (!el) return;
    if (el.closest('button, a, input, textarea, select, label')) return;
    this.toggleRowSelection(id);
  }

  deleteSelectedSets(): void {
    const ids = [...this.selectedIds];
    if (!ids.length || this.deletingBulk) return;
    const allLabel = this.isBulkDeleteAllLabel;
    const msg = allLabel
      ? `Delete all ${ids.length} question set(s) shown in the list?`
      : `Delete ${ids.length} selected question set(s)?`;
    if (!confirm(msg)) return;
    this.deletingBulk = true;
    const reqs = ids.map((id) => this.apiService.deleteQuestionSet(id));
    forkJoin(reqs)
      .pipe(finalize(() => (this.deletingBulk = false)))
      .subscribe({
        next: () => {
          this.selectedIds = [];
          this.load();
        },
        error: () => {},
      });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.apiService.getCreatedQuestionSets().subscribe({
      next: (list) => {
        this.sets = list || [];
        this.loading = false;
        this.pruneSelectionToFiltered();
        this.scrollHighlightRowIntoView();
      },
      error: () => {
        this.error = 'Failed to load created questions.';
        this.loading = false;
      }
    });
  }

  private scrollHighlightRowIntoView(): void {
    if (this.highlightSetId == null) {
      return;
    }
    const id = this.highlightSetId;
    setTimeout(() => {
      const el = document.querySelector(`[data-created-set-id="${id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  startRename(set: CreatedQuestionSet): void {
    this.renamingId = set.id;
    this.renameValue = set.name;
  }

  cancelRename(): void {
    this.renamingId = null;
    this.renameValue = '';
  }

  saveRename(): void {
    if (this.renamingId == null) return;
    const name = this.renameValue.trim() || 'questions';
    this.apiService.renameQuestionSet(this.renamingId, name).subscribe({
      next: () => {
        const s = this.sets.find(x => x.id === this.renamingId);
        if (s) {
          s.name = name;
          s.file_name_base = name.replace(/\s+/g, '_') + '_' + s.counter;
        }
        this.cancelRename();
      },
      error: () => {}
    });
  }

  deleteSet(set: CreatedQuestionSet): void {
    if (!confirm('Delete this saved question set?')) return;
    this.apiService.deleteQuestionSet(set.id).subscribe({
      next: () => this.load(),
      error: () => {}
    });
  }

  private layoutRecord(set: CreatedQuestionSet): Record<string, unknown> | undefined {
    const ls = set.layout_settings;
    return ls && typeof ls === 'object' && !Array.isArray(ls) ? (ls as Record<string, unknown>) : undefined;
  }

  private numFromLayout(ls: Record<string, unknown> | undefined, key: string, fallback: number): number {
    if (!ls) return fallback;
    const n = Number(ls[key]);
    return Number.isFinite(n) ? n : fallback;
  }

  private strFromLayout(ls: Record<string, unknown> | undefined, key: string, fallback: string): string {
    if (!ls) return fallback;
    const v = ls[key];
    if (typeof v === 'string' && v.trim()) return v;
    return fallback;
  }

  private intClampedLayout(
    ls: Record<string, unknown> | undefined,
    key: string,
    fallback: number,
    min: number,
    max: number
  ): number {
    const n = Math.round(this.numFromLayout(ls, key, fallback));
    return Math.max(min, Math.min(max, n));
  }

  private boolFromLayout(ls: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
    if (!ls || !(key in ls)) return fallback;
    const v = ls[key];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
    return Boolean(v);
  }

  /**
   * Export / download filename stem: saved `name` (same convention as question-creator), spaces → underscores.
   * Falls back to legacy `file_name_base` when `name` is empty.
   */
  private exportFilenameStem(set: CreatedQuestionSet): string {
    const n = (set.name ?? '').trim();
    if (n) {
      return n.replace(/\s+/g, '_');
    }
    const fb = (set.file_name_base ?? '').trim();
    return fb || 'questions';
  }

  /** Same top-level export fields + full `layout_settings` as Save in question-creator (serials, fonts, page plan, MCQ order). */
  private exportPayloadFromSavedSet(set: CreatedQuestionSet): Record<string, unknown> {
    const ls = this.layoutRecord(set) ?? {};
    const qids = ls['exportPreviewQuestionQids'];
    const questionsOrdered =
      Array.isArray(qids) && qids.length > 0
        ? reorderQuestionsByQids(set.questions, qids as (string | number)[])
        : set.questions;
    const orient = this.strFromLayout(ls, 'pageOrientation', 'portrait');
    const pageOrientation = orient === 'landscape' ? 'landscape' : 'portrait';
    let headerLineFontSizes: number[] = [];
    const rawH = ls['headerLineFontSizes'];
    if (Array.isArray(rawH)) {
      headerLineFontSizes = rawH.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    }
    const splitCreative = ls['exportQuestionHeaderCreative'];
    const splitMcq = ls['exportQuestionHeaderMcq'];
    const out: Record<string, unknown> = {
      questions: questionsOrdered,
      questionHeader: set.question_header || '',
      filename: this.exportFilenameStem(set),
      layout_settings: ls,
      pageSize: this.strFromLayout(ls, 'pageSize', 'A4'),
      pageOrientation,
      cqPageOrientation: this.strFromLayout(ls, 'cqPageOrientation', pageOrientation),
      mcqPageOrientation: this.strFromLayout(ls, 'mcqPageOrientation', pageOrientation),
      customPageWidthIn: this.numFromLayout(ls, 'customPageWidthIn', 8.5),
      customPageHeightIn: this.numFromLayout(ls, 'customPageHeightIn', 11),
      marginTop: this.numFromLayout(ls, 'marginTop', 25.4),
      marginRight: this.numFromLayout(ls, 'marginRight', 25.4),
      marginBottom: this.numFromLayout(ls, 'marginBottom', 25.4),
      marginLeft: this.numFromLayout(ls, 'marginLeft', 25.4),
      questionsPadding: this.numFromLayout(ls, 'questionsPadding', 2),
      questionsGap: this.numFromLayout(ls, 'questionsGap', 2),
      questionsGapCreative: this.numFromLayout(ls, 'questionsGapCreative', 4),
      previewQuestionsFontPx: this.numFromLayout(ls, 'previewQuestionsFontPx', 10),
      previewQuestionsFontPxCreative: this.numFromLayout(ls, 'previewQuestionsFontPxCreative', 10),
      previewQuestionsFontPxMcq: this.numFromLayout(ls, 'previewQuestionsFontPxMcq', 10),
      previewHeaderLineHeight: this.numFromLayout(ls, 'previewHeaderLineHeight', 1.25),
      previewQuestionsLineHeight: this.numFromLayout(ls, 'previewQuestionsLineHeight', 1.25),
      previewQuestionsLineHeightCreative: this.numFromLayout(ls, 'previewQuestionsLineHeightCreative', 1.25),
      previewQuestionsLineHeightMcq: this.numFromLayout(ls, 'previewQuestionsLineHeightMcq', 1.25),
      layoutColumns: this.intClampedLayout(ls, 'layoutColumns', 2, 1, 10),
      layoutColumnsCreative: this.intClampedLayout(ls, 'layoutColumnsCreative', 2, 1, 10),
      layoutColumnGapPx: this.intClampedLayout(ls, 'layoutColumnGapPx', 14, 1, 100),
      showColumnDivider: this.boolFromLayout(ls, 'showColumnDivider', true),
      optionsColumns: this.intClampedLayout(ls, 'optionsColumns', 2, 1, 5),
      pageSections: this.intClampedLayout(ls, 'pageSections', 1, 1, 10),
      sectionGapPx: this.intClampedLayout(ls, 'sectionGapPx', 24, 1, 100),
      headerLineFontSizes,
      headerEiin: this.strFromLayout(ls, 'headerEiin', ''),
      headerInstitute: this.strFromLayout(ls, 'headerInstitute', ''),
    };
    if (typeof splitCreative === 'string' && splitCreative.trim()) {
      out['questionHeaderCreative'] = splitCreative;
    }
    if (typeof splitMcq === 'string' && splitMcq.trim()) {
      out['questionHeaderMcq'] = splitMcq;
    }
    return out;
  }

  private downloadBlobsSequentially(
    blobs: Blob[],
    filenames: string[],
    gapMs = 400
  ): void {
    const run = async () => {
      for (let i = 0; i < blobs.length; i++) {
        const url = URL.createObjectURL(blobs[i]!);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenames[i]!;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
        if (i < blobs.length - 1) {
          await new Promise((r) => setTimeout(r, gapMs));
        }
      }
    };
    void run();
  }

  /** Question PDF/DOCX items plus `-answers` and `-mcq-answers` (same as Save from question creator). */
  private buildAllExportItemsForSet(
    set: CreatedQuestionSet,
    format: 'pdf' | 'docx'
  ): Array<{ filename: string; payload: Parameters<ApiService['exportQuestions']>[0] }> {
    const ls = this.layoutRecord(set) ?? {};
    const stem = this.exportFilenameStem(set);
    const base = this.exportPayloadFromSavedSet(set);
    const items: Array<{ filename: string; payload: Parameters<ApiService['exportQuestions']>[0] }> = [];

    if (hasPersistedFourMcqVariants(ls)) {
      const orderMap = parseMcqOrderBySet(ls['mcqOrderBySet']);
      const headerMap = parseQuestionHeaderByMcqSet(ls['questionHeaderByMcqSet']);
      for (const L of CreatedQuestionsComponent.MCQ_SET_LETTERS) {
        items.push({
          filename: `${stem}-${L}`,
          payload: {
            ...base,
            questions: reorderQuestionsByQids(set.questions, orderMap[L] ?? []),
            questionHeader: (headerMap[L] || (base['questionHeader'] as string)) as string,
            filename: `${stem}-${L}`,
            format,
          } as Parameters<ApiService['exportQuestions']>[0],
        });
      }
    } else {
      items.push({
        filename: stem,
        payload: { ...base, format } as Parameters<ApiService['exportQuestions']>[0],
      });
    }

    for (const ans of buildAnswerSheetExportItems({
      questions: set.questions,
      questionHeader: set.question_header || '',
      layoutSettings: ls,
      filenameStem: stem,
      format,
      baseExportPayload: base,
    })) {
      items.push({
        filename: ans.filename,
        payload: {
          ...ans.payload,
          format: ans.format,
          filename: ans.filename,
        } as Parameters<ApiService['exportQuestions']>[0],
      });
    }

    return items;
  }

  downloadSet(set: CreatedQuestionSet, format: 'pdf' | 'docx'): void {
    const items = this.buildAllExportItemsForSet(set, format);
    const ext = format === 'pdf' ? '.pdf' : '.docx';
    forkJoin(items.map((item) => this.apiService.exportQuestions(item.payload))).subscribe({
      next: (blobs) => {
        this.downloadBlobsSequentially(
          blobs,
          items.map((item) => `${item.filename}${ext}`)
        );
      },
      error: () => {},
    });
  }

  /** Download all filtered sets as a single ZIP (one click, one save prompt). */
  downloadAllPdf(): void {
    const list = this.filteredSets;
    if (!list.length) return;
    this.downloadingAllPdf = true;
    const items = list.flatMap((set) => {
      const exportItems = this.buildAllExportItemsForSet(set, 'pdf');
      return exportItems.map((item) => {
        const { format: _f, filename, ...rest } = item.payload;
        return { ...rest, filename };
      });
    });
    this.apiService.exportQuestionsBulk(items as Parameters<ApiService['exportQuestionsBulk']>[0]).pipe(
      finalize(() => { this.downloadingAllPdf = false; })
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'created_questions_all.zip';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {}
    });
  }
}
