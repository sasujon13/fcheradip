import { QuestionCreatorComponent } from './question-creator.component';
import { of, throwError } from 'rxjs';

describe('creator minimum-page automatic fitting', () => {
  for (const type of ['সৃজনশীল', 'সৃজনশীল প্রশ্ন']) {
    it(`packs the ${type} stem and four parts independently across columns`, () => {
      const creator = Object.create(QuestionCreatorComponent.prototype) as any;
      const q = { qid: 'cq', type, question: 'Stem (ক) Part A (খ) Part B (গ) Part C (ঘ) Part D' };
      const rows = creator.expandQuestionsIntoLayoutSegments([q]);
      expect(rows.length).toBe(5);
      expect(rows.map((r: any) => r.answerSheetSegmentKind)).toEqual(['intro', 'part', 'part', 'part', 'part']);
      expect(rows.slice(1).map((r: any) => r.answerSheetPartIndex)).toEqual([0, 1, 2, 3]);
      creator.questionBlockMarginBottomPx = () => 0;
      const packed = creator.packQuestionsColumnMajor([40, 20, 20, 20, 20], rows, 0, 80, 2);
      expect(packed.columnStacks.map((c: any[]) => c.map(it => it.index))).toEqual([[0, 1, 2], [3, 4]]);
      expect(packed.nextQ).toBe(5);
      expect(packed.pageHasOversized).toBeFalse();
    });
  }
  it('recognizes imported CQ markers with missing parentheses or internal spaces', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    const rows = creator.expandQuestionsIntoLayoutSegments([{
      type: 'সৃজনশীল', question: 'Stem। ক) A (খ) B ( গ) C ( ঘ ) D',
    }]);
    expect(rows.length).toBe(5);
    expect(rows.slice(1).map((r: any) => r.question)).toEqual(['(ক) A', '(খ) B', '(গ) C', '(ঘ) D']);
  });
  it('counts CQ child content that extends beyond its wrapper height', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    const element = {
      offsetHeight: 20, scrollHeight: 20,
      getBoundingClientRect: () => ({ top: 100, height: 20 }),
      querySelectorAll: () => [{ getBoundingClientRect: () => ({ bottom: 155 }) }],
    };
    expect(creator.measureBlockHeightForPagination(element)).toBe(55);
  });
  it('rejects a clipped CQ descendant even if the question wrapper fits', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.previewStage = { nativeElement: { querySelectorAll: () => [{
      getBoundingClientRect: () => ({ height: 100, bottom: 200 }),
      querySelectorAll: () => [
        { getBoundingClientRect: () => ({ bottom: 190 }) },
        { getBoundingClientRect: () => ({ bottom: 220 }) },
      ],
    }] } };
    expect(creator.previewContentClipsIntoBottomMargin()).toBeTrue();
  });
  it('waits for recreated image nodes before scheduling each fitting trial', async () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    let release!: () => void;
    creator.cdr = { detectChanges: () => {} };
    creator.waitForMeasureRailImagesBeforeExport = () => new Promise<void>(resolve => { release = resolve; });
    creator.scheduleLayout = jasmine.createSpy('measure');
    creator.waitForLayoutIdle = async () => {};
    creator.rememberSettledPreview = () => {};
    const fitting = creator.settleAutoFitTrial();
    expect(creator.scheduleLayout).not.toHaveBeenCalled();
    release();
    await fitting;
    expect(creator.scheduleLayout).toHaveBeenCalledTimes(1);
  });

  for (const deferred of [true, false]) {
    it(`sizes ${deferred ? 'deferred' : 'cached'} images before measuring their heights`, () => {
      const creator = Object.create(QuestionCreatorComponent.prototype) as any;
      creator.pendingMeasureImageListeners = new WeakSet();
      creator.scheduleLayout = jasmine.createSpy('relayout');
      const host = document.createElement('div');
      host.className = 'preview-q-content';
      host.style.width = '500px';
      const image = document.createElement('img');
      image.className = 'q-rich-img';
      image.style.fontSize = '10px';
      image.setAttribute('data-q-img-src', '/example.png');
      let loaded = !deferred;
      Object.defineProperties(image, {
        complete: { get: () => true },
        naturalWidth: { get: () => loaded ? 488 : 0 },
        naturalHeight: { get: () => loaded ? 200 : 0 },
      });
      host.appendChild(image);
      document.body.appendChild(host);
      try {
        expect(creator.scheduleLayoutForPendingMeasureImages([{ nativeElement: host }])).toBe(deferred);
        if (deferred) {
          loaded = true;
          image.dispatchEvent(new Event('load'));
          expect(creator.scheduleLayout).toHaveBeenCalledTimes(1);
        }
        expect(image.style.width).toBe('300px');
        expect(image.style.height).toBe('123px');
      } finally { host.remove(); }
    });
  }

  it('releases the busy latch if rendering fails before layout frames can start', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.cdr = { detectChanges: () => { throw new Error('Rendering failed'); } };
    expect(() => creator.runLayout()).toThrowError('Rendering failed');
    expect(creator.layoutPassInFlight).toBeFalse();
    expect(creator.layoutTimer).toBeNull();
  });
  const fitter = (pageCountAt: (font: number) => number) => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    let value = 8;
    creator.paginatedPages = Array.from({ length: pageCountAt(value) }, () => ({}));
    creator.settleAutoFitTrial = async () => {
      creator.paginatedPages = Array.from({ length: pageCountAt(value) }, () => ({}));
    };
    creator.previewContentClipsIntoBottomMargin = () => false;
    return { creator, get: () => value, set: (next: number) => { value = next; } };
  };

  it('preserves the one-page budget found at 8px', async () => {
    const f = fitter((font) => font <= 10 ? 1 : 2);
    await f.creator.maximizeAutoFitParameter(f.get, f.set, 12, 1);
    expect(f.get()).toBe(10);
    expect(f.creator.paginatedPages.length).toBe(1);
  });

  it('keeps the required three pages when 8px cannot fit on one or two', async () => {
    const f = fitter((font) => font <= 11 ? 3 : 4);
    await f.creator.maximizeAutoFitParameter(f.get, f.set, 12, 3);
    expect(f.get()).toBe(11);
    expect(f.creator.paginatedPages.length).toBe(3);
  });

  it('stops at 12px even when there is still blank space', async () => {
    const f = fitter(() => 1);
    await f.creator.maximizeAutoFitParameter(f.get, f.set, 12, 1);
    expect(f.get()).toBe(12);
    expect(f.creator.autoFitQuestionFontCeiling('creative')).toBe(12);
    expect(f.creator.autoFitQuestionFontCeiling('mcq')).toBe(12);
  });

  it('rejects clipping even if the page count has not increased', async () => {
    const f = fitter(() => 2);
    f.creator.previewContentClipsIntoBottomMargin = () => f.get() > 10;
    await f.creator.maximizeAutoFitParameter(f.get, f.set, 12, 2);
    expect(f.get()).toBe(10);
  });

  it('restores the last safe setting if a trial cannot settle', async () => {
    const f = fitter(() => 2);
    f.creator.settleAutoFitTrial = async () => {
      if (f.get() > 8) throw new Error('Layout timeout');
    };
    await expectAsync(f.creator.maximizeAutoFitParameter(f.get, f.set, 12, 2))
      .toBeRejectedWithError('Layout timeout');
    expect(f.get()).toBe(8);
  });

  for (const kind of ['creative']) {
    it(`places ${kind} first on the right and the ending content on the first left column`, () => {
      const creator = Object.create(QuestionCreatorComponent.prototype) as any;
      creator.commonLayoutKind = () => kind;
      creator.questionIsMcqType = (q: any) => q.kind === 'mcq';
      creator.questionUsesCreativeSheet = (q: any) => q.kind !== 'mcq';
      creator.leadEmptyFirstPageActive = true;
      creator.pageSections = 1;
      creator.layoutColumns = creator.layoutColumnsCreative = 2;
      const items = [0, 1, 2, 3].map((index) => ({
        index, q: { kind: kind === 'creative' && index === 3 ? 'other' : kind },
      }));
      const pages = [
        { items: items.slice(0, 2), questionColumns: [[items[0]], [items[1]]] },
        { items: items.slice(2), questionColumns: [[items[2]], [items[3]]] },
      ] as any[];
      creator.applyLeadEmptyTreatFirstColumnAsLast(pages);
      expect(pages[0].questionColumns[0][0].index).toBe(0);
      expect(pages[1].questionColumns.map((c: any[]) => c[0].index)).toEqual([1, 2]);
      expect(pages[0].leadBindingItems[0].index).toBe(3);
      expect(pages.flatMap((p) => p.items.map((i: any) => i.index)).sort()).toEqual([0, 1, 2, 3]);
    });
  }

  it('never applies booklet rotation to MCQ, even when an old saved flag is set', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.commonLayoutKind = () => 'mcq';
    creator.pageSections = 1;
    creator.layoutColumns = 2;
    creator.mcqPageOrientation = 'portrait';
    creator.questionIsMcqType = () => true;
    const page = { items: [{ q: {} }] };
    creator.splitIntoPages = () => [page, page];
    creator.resolveLeadEmptyFirstPageActiveFromProbe([], 100, 0, 0, []);
    expect(creator.leadEmptyFirstPageActive).toBeFalse();
    creator.splitIntoPages = () => [page];
    creator.resolveLeadEmptyFirstPageActiveFromProbe([], 100, 0, 0, []);
    expect(creator.leadEmptyFirstPageActive).toBeFalse();
  });

  it('keeps an ending in the first left column when only three columns contain content', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.commonLayoutKind = () => 'creative';
    creator.questionUsesCreativeSheet = () => true;
    creator.leadEmptyFirstPageActive = true;
    creator.pageSections = 1;
    creator.layoutColumnsCreative = 2;
    const items = [0, 1, 2].map((index) => ({ index, q: {} }));
    const pages = [
      { items: items.slice(0, 2), questionColumns: [[items[0]], [items[1]]] },
      { items: items.slice(2), questionColumns: [[items[2]], []] },
    ] as any[];
    creator.applyLeadEmptyTreatFirstColumnAsLast(pages);
    expect(pages[0].questionColumns[0][0].index).toBe(0);
    expect(pages[1].questionColumns[0][0].index).toBe(1);
    expect(pages[1].questionColumns[1]).toEqual([]);
    expect(pages[0].leadBindingItems[0].index).toBe(2);
  });

  it('detects bottom clipping even when the sheet is above the viewport', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.previewStage = { nativeElement: { querySelectorAll: () => [{
      getBoundingClientRect: () => ({ height: 100, bottom: -20 }),
      querySelectorAll: () => [{ getBoundingClientRect: () => ({ bottom: -10 }) }],
    }] } };
    expect(creator.previewContentClipsIntoBottomMargin()).toBeTrue();
  });

  it('measures CQ landscape and MCQ portrait independently in a mixed draft', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    Object.defineProperty(creator, 'previewQuestions', { value: [{}] });
    creator.previewKindSliderVisible = () => true;
    creator.paperSizeMmForKind = (kind: string) => kind === 'creative'
      ? { w: 297, h: 210 } : { w: 210, h: 297 };
    creator.marginLeftForKind = creator.marginRightForKind =
      creator.marginTopForKind = creator.previewBottomMarginMmForKind = () => 10;
    creator.previewKindFocus = 'creative';
    const cq = creator.effectiveInnerDimensionsForLayout();
    creator.previewKindFocus = 'mcq';
    const mcq = creator.effectiveInnerDimensionsForLayout();
    expect(cq.w).toBeGreaterThan(cq.h);
    expect(mcq.h).toBeGreaterThan(mcq.w);
    expect(cq.w).toBeCloseTo(mcq.h, 4);
    expect(cq.h).toBeCloseTo(mcq.w, 4);
  });

  it('keeps companion sections on CQ typography when MCQ settings change', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.questionIsMcqType = () => false;
    creator.questionIsCreativeType = () => false;
    creator.previewQuestionsFontPx = creator.previewQuestionsFontPxMcq = 8;
    creator.previewQuestionsFontPxCreative = 12;
    creator.previewQuestionsLineHeight = creator.previewQuestionsLineHeightMcq = 1.1;
    creator.previewQuestionsLineHeightCreative = 1.4;
    creator.questionsPaddingForKind = (kind: string) => kind === 'creative' ? 2 : 9;
    creator.questionsGap = 20;
    creator.questionsGapCreative = 3;
    expect(creator.previewQuestionsFontPxForQuestion({})).toBe(12);
    expect(creator.previewQuestionsLineHeightForQuestion({})).toBe(1.4);
    expect(creator.previewQuestionBlockPaddingPx({})).toEqual({ top: 2, bottom: 2 });
    expect(creator.questionBlockMarginBottomPx({})).toBe(3);
  });

  it('sizes segmented CQ rows by their type instead of an out-of-range original question index', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.questionIsMcqType = (q: any) => q.type === 'mcq';
    creator.contentInnerWidthPxForKind = (kind: string) => kind === 'creative' ? 1000 : 600;
    creator.layoutColumnsCreative = creator.layoutColumns = 2;
    Object.defineProperty(creator, 'layoutColumnGapPx', { value: 20 });
    expect(creator.columnMeasureWidthPxForLayoutRow(99, { type: 'cq' })).toBe(490);
    expect(creator.columnMeasureWidthPxForLayoutRow(99, { type: 'mcq' })).toBe(290);
  });

  it('does not inherit measurement width or page type from the previously focused paper', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.previewKindSliderVisible = () => true;
    creator.contentInnerWidthPxForKind = (kind: string) => kind === 'creative' ? 1000 : 600;
    creator.previewKindFocus = 'creative';
    creator.paginatedPages = [{ items: [{ q: { type: 'other' } }] }];
    expect(creator.measureRailInnerWidthPx).toBe(1000);
    expect(creator.sheetPreviewKindKey(0)).toBe('creative');
    creator.previewKindFocus = 'mcq';
    expect(creator.measureRailInnerWidthPx).toBe(600);
    expect(creator.sheetPreviewKindKey(0)).toBe('mcq');
  });

  it('does not add phantom row pixels from fractional viewport rounding', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    const element = {
      offsetHeight: 29, scrollHeight: 29,
      getBoundingClientRect: () => ({ height: 29.000004 }),
    };
    expect(creator.measureBlockHeightForPagination(element)).toBe(29);
    element.getBoundingClientRect = () => ({ height: 29.2 });
    expect(creator.measureBlockHeightForPagination(element)).toBe(30);
  });

  it('exports the target paper snapshot instead of the currently focused tab values', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    const layout = { exportLayoutVersion: 1, marginTop: 0, questionsPadding: 7,
      previewQuestionsFontPxMcq: 10, headerLineFontSizes: [12, 14],
      exportPreviewPagePlan: [{kind: 'mcq', questionColumnIndexes: [[0]]}] };
    const payload = creator.mergeExportPayloadWithLayoutSettings(
      {marginTop: 25, questionsPadding: 2, previewQuestionsFontPxMcq: 8}, layout,
      {format: 'docx', questionHeader: 'Keep header'});
    expect(payload.marginTop).toBe(0);
    expect(payload.questionsPadding).toBe(7);
    expect(payload.previewQuestionsFontPxMcq).toBe(10);
    expect(payload.headerLineFontSizes).toEqual([12, 14]);
    expect(payload.format).toBe('docx');
    layout.headerLineFontSizes[0] = 20;
    layout.exportPreviewPagePlan[0].questionColumnIndexes[0].push(1);
    expect(payload.layout_settings.headerLineFontSizes).toEqual([12, 14]);
    expect(payload.layout_settings.exportPreviewPagePlan[0].questionColumnIndexes).toEqual([[0]]);
  });

  it('does not replace manual header sizes that happen to equal legacy defaults', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    Object.defineProperty(creator, 'headerPreviewLines', {value: ['Notice']});
    creator.paperSubjectMetaLinesEligible = () => false;
    creator.headerLineFontSizes = [12];
    creator.syncHeaderFontSizesToLineCount();
    expect(creator.headerLineFontSizes).toEqual([12]);
  });

  it('keeps MCQ full-width headers and left-first columns on one or many pages', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    creator.sheetPreviewKindKey = creator.commonLayoutKind = () => 'mcq';
    creator.questionIsMcqType = () => true;
    creator.leadEmptyFirstPageActive = true;
    creator.pageSections = 1;
    const pages = [{items: [{index: 0}], questionColumns: [[0], [1]]},
      {items: [{index: 2}], questionColumns: [[2], [3]]}];
    const before = JSON.stringify(pages);
    creator.applyLeadEmptyTreatFirstColumnAsLast(pages);
    expect(JSON.stringify(pages)).toBe(before);
    for (const pageIndex of [0, 1, 2]) {
      expect(creator.headerInFirstColumnLandscape(pageIndex)).toBeFalse();
      expect(creator.landscapeLeadEmptyFirstColumnForSheetPage(pageIndex)).toBeFalse();
      expect(creator.paginationHeaderInFirstColumn(pageIndex, 0, 2, 50, 0, false, [], [{}], 900)).toBeFalse();
    }
  });

  it('keeps explicit per-file page plans in the authoritative snapshot', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    const plan = [{kind: 'mcq', headerInFirstColumn: false, questionColumnIndexes: [[0], [1]]}];
    const result = creator.mergeExportPayloadWithLayoutSettings({},
      {exportLayoutVersion: 1, exportPreviewPagePlan: []}, {exportPreviewPagePlan: plan});
    expect(result.layout_settings.exportPreviewPagePlan).toEqual(plan);
    expect(result.exportPreviewPagePlan).toEqual(plan);
  });

  it('measures headers at their displayed width before fitting or Save', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    Object.defineProperty(creator, 'measureRailInnerWidthPx', {value: 700});
    Object.defineProperty(creator, 'layoutColumnGapPx', {value: 12});
    creator.layoutColumnsCreative = 2;
    creator.commonLayoutKind = () => 'creative';
    expect(creator.measureHeaderPrintableWidthPx()).toBe(344);
    creator.commonLayoutKind = () => 'mcq';
    expect(creator.measureHeaderPrintableWidthPx()).toBe(700);
  });

  function saveFixture(failSecond = false): any {
    const creator = new QuestionCreatorComponent({navigate: () => Promise.resolve(true)} as any,
      {} as any, {} as any, {} as any, {markForCheck: () => {}} as any,
      {run: (fn: () => void) => fn()} as any) as any;
    creator.questions = [{qid: '1', question: 'Sample question'}];
    const layout = {exportLayoutVersion: 1, exportPreviewPagePlan: [{kind: 'mcq', questionColumnIndexes: [[0], []]}]};
    creator.shouldExportFourMcqSetFiles = creator.shouldExportSplitCreativeAndMcqFiles = () => false;
    creator.prepareExportLayoutSnapshot = async () => {};
    creator.clearMcqPersistedOrders = () => {};
    creator.buildLayoutSettingsForPersist = () => layout;
    creator.marginBottomMmForPersistAndExportPayload = () => 12;
    Object.defineProperty(creator, 'exportFileNameBase', {value: 'paper'});
    Object.defineProperty(creator, 'previewQuestions', {value: creator.questions});
    creator.buildSaveExportTargets = () => ({targets: [{setLetter: null, layout,
      filenameStem: 'paper', canonicalQuestions: creator.questions, exportKind: 'combined'}], splitPersist: {}});
    creator.buildQuestionHeaderForPersist = () => 'Exam';
    creator.expandQuestionsIntoLayoutSegments = creator.attachMcqOptionsColumnsForExport = (rows: any) => rows;
    creator.headerUseLegacyQuestionHeader = true;
    creator.paperSubjectMetaLinesEligible = creator.selectionHasMcqType = creator.selectionHasCreativeType = () => false;
    creator.appendPostSaveAnswerSheetExportRequests = async () => ({});
    let exports = 0;
    creator.apiService = {
      exportQuestions: () => ++exports === 2 && failSecond ? throwError(() => new Error('Render failed')) : of(new Blob(['file'])),
      createQuestionSet: jasmine.createSpy('create').and.returnValue(of({id: null})),
    };
    creator.downloadBlob = jasmine.createSpy('download');
    creator.exportFiles.saveBlob = jasmine.createSpy('browserDownload');
    creator.applySaveCoinDebitFromResponse = creator.commitExamSerialAfterSave = () => {};
    return creator;
  }

  function cachedPreviewFixture(): any {
    const creator = saveFixture();
    creator.cdr.detectChanges = () => {};
    creator.previewContentClipsIntoBottomMargin = () => false;
    creator.updatePreviewFitScale = () => {};
    creator.cacheFocusExportPagePlanFromPages = () => {};
    creator.waitForMeasureRailImagesBeforeExport = async () => {};
    creator.commonLayoutKind = () => creator.previewKindFocus;
    creator.paginatedPages = [{items: [{index: 0, q: creator.questions[0]}]}];
    return creator;
  }

  it('reuses settled pages only while the paper content and settings are unchanged', () => {
    const creator = cachedPreviewFixture();
    creator.rememberSettledPreview();
    const pages = creator.paginatedPages;
    creator.paginatedPages = [];
    expect(creator.restoreSettledPreview()).toBeTrue();
    expect(creator.paginatedPages).toBe(pages);
    creator.previewQuestionsFontPxCreative++;
    expect(creator.restoreSettledPreview()).toBeFalse();
    creator.previewQuestionsFontPxCreative--;
    creator.questions[0].question = 'Changed question';
    expect(creator.restoreSettledPreview()).toBeFalse();
  });

  it('switches fitted CQ/MCQ without treating the tab as a settings edit or reshuffling sets', async () => {
    const creator = cachedPreviewFixture();
    creator.previewKindFocus = 'mcq';
    creator.rememberSettledPreview();
    creator.previewKindFocus = 'creative';
    creator.rememberSettledPreview();
    creator.waitForLayoutIdle = async () => {};
    creator.runHeaderTextareaSyncs = creator.syncHeaderFontSizesToLineCount =
      creator.schedulePersistCreatorStateToLocalStorage = () => {};
    creator.onPreviewLayoutChange = jasmine.createSpy('settingsEdit');
    creator.settleAutoFitTrial = jasmine.createSpy('refit').and.resolveTo();
    creator.scheduleLayout = jasmine.createSpy('queuedLayout');
    creator.cdr.detectChanges = () => creator.onMeasureBlocksChanged();
    creator.persistedMcqOrderBySet = {};
    await creator.setPreviewKindFocus('mcq');
    expect(creator.previewKindFocus).toBe('mcq');
    expect(creator.onPreviewLayoutChange).not.toHaveBeenCalled();
    expect(creator.settleAutoFitTrial).not.toHaveBeenCalled();
    expect(creator.scheduleLayout).not.toHaveBeenCalled();
  });

  it('Save prepares all formats before allowance/debit and automatically downloads ZIP', async () => {
    const creator = saveFixture();
    await creator.runDoSaveExportFlowCore('both');
    expect(creator.apiService.createQuestionSet).toHaveBeenCalledTimes(1);
    expect(creator.downloadBlob).not.toHaveBeenCalled();
    expect(creator.exportFiles.files.map((f: any) => f.name)).toEqual(['paper.pdf', 'paper.docx']);
    expect(creator.exportFiles.zipDownloaded()).toBeTrue();
    expect(creator.exportFiles.saveBlob.calls.mostRecent().args[1]).toBe('paper.zip');
  });

  it('Save never consumes allowance or wallet balance when any export fails', async () => {
    const creator = saveFixture(true);
    await creator.runDoSaveExportFlowCore('both');
    expect(creator.apiService.createQuestionSet).not.toHaveBeenCalled();
    expect(creator.downloadBlob).not.toHaveBeenCalled();
    expect(creator.saveSuccessMessage).toContain('Failed to generate');
  });
});
