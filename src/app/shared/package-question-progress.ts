/** Display-only progress; never changes package allowances or renewal behavior. */
export function packageQuestionProgress(subscription: { questionLimit?: unknown; questionsUsed?: unknown }) {
  const quota = Number(subscription?.questionLimit);
  const usage = Number(subscription?.questionsUsed);
  const total = Number.isFinite(quota) ? Math.max(0, Math.floor(quota)) : 0;
  const completed = Number.isFinite(usage) ? Math.min(total, Math.max(0, Math.floor(usage))) : 0;
  return { total, completed, remaining: total - completed, percent: total ? completed * 100 / total : 0 };
}
