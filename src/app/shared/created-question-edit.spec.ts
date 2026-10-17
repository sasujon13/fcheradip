import { savedQuestionEditPayload } from './created-question-edit';
import { QuestionCreatorComponent } from '../component/question/question-creator/question-creator.component';

describe('saved-question editing', () => {
  const saved = () => ({id: 552, name: 'Renamed exam', counter: 1, file_name_base: 'Exam',
    question_header: 'Exported header', questions: [{qid: '1', type: 'mcq', question: 'Question', option_1: 'One'}],
    layout_settings: {
      creatorQuestionHeader: 'My renamed institute\nMy custom exam\nThird line',
      creatorContext: {subject_tr: 'Physics', level_tr: 'Higher Secondary', class_level: '11-12'},
      headerEiin: '100002', headerInstitute: {instituteName: 'Renamed Institute'},
      headerLineFontSizes: [18, 16, 12], optionsColumns: 4, optionsColumnsManualOverride: true,
      previewOptionsLayoutByQid: {'1': '1row'}, marginTopMcq: 7, mcqPageOrientation: 'portrait',
    }});

  it('preserves exact creator header, institute, context and manual options without sharing mutable records', () => {
    const set = saved();
    const payload = savedQuestionEditPayload(set as any) as any;
    expect(payload.questionHeader).toBe(set.layout_settings.creatorQuestionHeader);
    expect(payload.headerInstitute.instituteName).toBe('Renamed Institute');
    expect(payload.headerEiin).toBe('100002');
    expect(payload.context.class_level).toBe('11-12');
    expect(payload.optionsColumnsManualOverride).toBeTrue();
    expect(payload.optionsColumns).toBe(4);
    expect(payload.headerLineFontSizes).toEqual([18, 16, 12]);
    payload.questions[0].question = 'Changed';
    payload.headerInstitute.instituteName = 'Changed';
    expect(set.questions[0].question).toBe('Question');
    expect(set.layout_settings.headerInstitute.instituteName).toBe('Renamed Institute');
  });

  it('supports older records with only an exported header and subject metadata', () => {
    const payload = savedQuestionEditPayload({id: 1, question_header: 'Existing institute',
      questions: [{qid: 1, level_tr: 'Secondary', subject_tr: 'English'}], layout_settings: {optionsColumns: 2}} as any) as any;
    expect(payload.questionHeader).toBe('Existing institute');
    expect(payload.context.subject_tr).toBe('English');
    expect(payload.questionQids).toEqual([1]);
  });
  it('recovers a legacy truncated header from its complete export backup', () => {
    const backup = 'Institute\n' + 'Complete notice '.repeat(25);
    const payload = savedQuestionEditPayload({id: 1, questions: [], question_header: backup.slice(0, 255),
      layout_settings: {previewKindFocus: 'mcq', exportQuestionHeaderMcq: backup, headerLineFontSizesPdfMcq: [18, 12]}} as any) as any;
    expect(payload.questionHeader).toBe(backup);
    expect(payload.headerLineFontSizes).toEqual([18, 12]);
  });

  it('restores manual values and never overwrites a saved institute through the initial lookup', () => {
    const creator = new QuestionCreatorComponent({} as any, {getToken: () => null} as any,
      {} as any, {} as any, {markForCheck: () => {}} as any, {} as any) as any;
    creator.editingSavedSetId = 552;
    creator.applyFullCreatorPayloadFromParsed(savedQuestionEditPayload(saved() as any), {trustSavedHeader: true});
    expect(creator.questionHeader).toContain('My renamed institute');
    expect(creator.headerEiin).toBe('100002');
    expect(creator.optionsColumnsManualOverride).toBeTrue();
    expect(creator.optionsColumns).toBe(4);
    expect(creator.previewOptionsLayoutByQid).toEqual({'1': '1row'});
    const lookup = spyOn(creator.eiinSearchSubject, 'next');
    creator.flushInitialEiinLookup();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('uses fitting without a factory reset or clearing manual option-column sizes', async () => {
    const creator = new QuestionCreatorComponent({} as any, {} as any,
      {} as any, {} as any, {markForCheck: () => {}} as any, {} as any) as any;
    creator.questions = [{qid: 1, question: 'A saved question'}];
    creator.beginAutoFitProgressSession = creator.endAutoFitProgressSession = () => {};
    creator.waitForLayoutIdle = async () => {};
    creator.runForcedPreviewAutoFitOnly = jasmine.createSpy().and.resolveTo();
    creator.resetCreatorSettings = jasmine.createSpy();
    await creator.fitSavedSetPreservingSettings();
    expect(creator.runForcedPreviewAutoFitOnly).toHaveBeenCalledWith({preserveOptions: true});
    expect(creator.resetCreatorSettings).not.toHaveBeenCalled();
  });
  it('does not discard real MCQ text merely because source choices are missing', () => {
    const creator = Object.create(QuestionCreatorComponent.prototype) as any;
    expect(creator.questionsLookLikeQidPlaceholders([{qid: '01_1_0042', type: 'বহুনির্বাচনি প্রশ্ন',
      question: 'A real question', option_1: null, option_2: null, option_3: null, option_4: null}])).toBeFalse();
    expect(creator.questionsLookLikeQidPlaceholders([{qid: '01_1_0042', question: '— (01_1_0042)'}])).toBeTrue();
  });
});
