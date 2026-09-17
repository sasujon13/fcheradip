import {
  buildAnswerExplanationExportQuestion,
  splitAnswerExportQuestionIntoMeasureRows,
  subjectUsesEnglishAnswerLabels,
} from './question-creator-answer-export';

const formatOption = (raw: string) => raw;
const isMcqType = (q: unknown) => (q as { type?: string })?.type === 'বহুনির্বাচনি';

describe('question creator answer export labels', () => {
  it('uses Bengali answer and explanation labels for non-English subjects', () => {
    const result = buildAnswerExplanationExportQuestion(
      {
        qid: '1',
        type: 'বহুনির্বাচনি',
        question: 'Question',
        option_1: 'One',
        option_2: 'Two',
        answer: 'Two',
        explanation: 'Because',
      },
      {
        formatOption,
        isMcqType,
        displayStem: 'Question',
        subjectName: 'পদার্থবিজ্ঞান',
      }
    );

    expect(result['question']).toBe('Question\n\nউত্তর: Two\n\nব্যাখ্যা: Because');
    expect(result['answerSheetCorrectOptionIndex']).toBe(1);
    expect(result['answerSheetCorrectOptionLabel']).toBe('খ');
  });

  it('keeps English labels when the subject name contains English', () => {
    const result = buildAnswerExplanationExportQuestion(
      {
        type: 'বহুনির্বাচনি',
        question: 'Question',
        option_1: 'One',
        answer: 'a',
        explanation: 'Because',
      },
      {
        formatOption,
        isMcqType,
        displayStem: 'Question',
        subjectName: 'HSC English First Paper',
      }
    );

    expect(result['question']).toBe('Question\n\nAnswer: One\n\nExplanation: Because');
    expect(result['answerSheetCorrectOptionLabel']).toBe('ক');
  });

  it('recognizes the Bengali English-subject name and tags answer/explanation rows', () => {
    expect(subjectUsesEnglishAnswerLabels('ইংরেজি ২য় পত্র')).toBeTrue();

    const answerQuestion = buildAnswerExplanationExportQuestion(
      {
        qid: '3',
        type: 'বহুনির্বাচনি',
        question: 'Question',
        option_3: 'Three',
        answer: 'গ',
        explanation: 'Because',
      },
      {
        formatOption,
        isMcqType,
        displayStem: 'Question',
        subjectName: 'ইংরেজি ২য় পত্র',
      }
    );
    const rows = splitAnswerExportQuestionIntoMeasureRows(answerQuestion, 0, {
      isCreativeType: () => false,
      parseStructure: (q) => ({ intro: String(q.question ?? ''), parts: [] }),
      formatOption,
    });

    expect(rows.map((row) => row['answerSheetTailKind'])).toEqual([
      undefined,
      'answer',
      'explanation',
    ]);
  });
});
