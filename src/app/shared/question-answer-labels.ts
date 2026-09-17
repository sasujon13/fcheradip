/** English-subject answer content keeps English headings; every other subject uses Bengali. */
export function subjectUsesEnglishAnswerLabels(subjectName: unknown): boolean {
  const name = String(subjectName ?? '').trim().toLowerCase();
  return name.includes('english') || name.includes('ইংরেজি');
}

