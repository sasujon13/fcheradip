import { filterExportLayoutForKind } from './question-answer-sheet-export';

describe('split question export geometry', () => {
  it('preserves empty columns, remaps serials and never leaves old binding indices', () => {
    const rows = [{qid: 'cq', type: 'সৃজনশীল প্রশ্ন'},
      {qid: 'm1', type: 'বহুনির্বাচনি প্রশ্ন'}, {qid: 'm2', type: 'বহুনির্বাচনি প্রশ্ন'}];
    const layout = filterExportLayoutForKind({
      previewSerialByIndex: {'0': 99, '1': 1, '2': 2},
      exportPreviewPagePlan: [{kind: 'mcq', headerInFirstColumn: false,
        questionColumnIndexes: [[1, 2], []], leadBindingIndexes: [0]}],
    }, rows, 'mcq');
    expect(layout['previewSerialByIndex']).toEqual({'0': 1, '1': 2});
    expect((layout['exportPreviewPagePlan'] as any[])[0].questionColumnIndexes).toEqual([[0, 1], []]);
    expect((layout['exportPreviewPagePlan'] as any[])[0].leadBindingIndexes).toEqual([]);
  });
});
