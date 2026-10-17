import { CreatedQuestionSet } from '../service/api.service';

/** Restore saved data, not the last unrelated creator draft or current defaults. */
export function savedQuestionEditPayload(set: CreatedQuestionSet): Record<string, unknown> {
  const layout = set.layout_settings && typeof set.layout_settings === 'object' ? set.layout_settings : {};
  const first = set.questions?.[0] ?? {};
  const context: Record<string, unknown> = {};
  for (const key of ['level_tr', 'class_level', 'group', 'subject_tr', 'subject_name', 'subject_code', 'chapter', 'topic', 'sq']) {
    if (first[key] != null) context[key] = first[key];
  }
  if (!context['subject_tr'] && typeof layout['subjectName'] === 'string') context['subject_tr'] = layout['subjectName'];
  const savedContext = layout['creatorContext'] ?? layout['context'];
  if (savedContext && typeof savedContext === 'object' && !Array.isArray(savedContext)) Object.assign(context, savedContext);
  let header = typeof layout['creatorQuestionHeader'] === 'string' ? layout['creatorQuestionHeader'] : (set.question_header ?? '');
  let headerFonts = layout['headerLineFontSizes'];
  // The legacy database column is limited to 255 characters. Older exports
  // often kept a complete per-paper header in JSON even when that column was cut.
  if (typeof layout['creatorQuestionHeader'] !== 'string' && header.length >= 255) {
    const order = layout['previewKindFocus'] === 'creative' ? ['Creative', 'Mcq'] : ['Mcq', 'Creative'];
    for (const kind of order) {
      const backup = layout[`exportQuestionHeader${kind}`];
      if (typeof backup === 'string' && backup.length > header.length) {
        header = backup;
        headerFonts = layout[`headerLineFontSizesPdf${kind}`] ?? headerFonts;
        break;
      }
    }
  }
  return structuredClone({
    ...layout,
    v: 2,
    sourceCreatedSetId: set.id,
    sourceCreatedSetName: set.name,
    context,
    questions: set.questions ?? [],
    questionQids: (set.questions ?? []).map(q => q?.qid).filter(qid => qid != null),
    questionHeader: header,
    headerLineFontSizes: headerFonts,
    // Preserve saved wording, including manually renamed institute/exam lines.
    headerManualEditSinceRebuild: true,
  });
}
