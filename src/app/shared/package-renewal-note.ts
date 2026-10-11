import { packageQuestionProgress } from './package-question-progress';

/** Contextual details for the existing site-wide tooltip, not visible card copy. */
export function packageRenewalNote(subscription: any): string {
  const capitalize = (value: unknown) => String(value || '').replace(/\b\w/g, character => character.toUpperCase());
  const date = (value: unknown) => {
    if (!value) return '';
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const progress = packageQuestionProgress(subscription);
  const notes = [
    `Package: ${subscription?.planName || 'Package'}`,
    `Audience: ${capitalize(subscription?.audience) || 'Not specified'}`,
    `Track: ${capitalize(subscription?.track) || 'Not specified'}`,
    `Status: ${capitalize(subscription?.status) || 'Not specified'}`,
  ];
  if (progress.total) notes.push(`Questions: ${progress.completed} completed, ${progress.remaining} remaining, ${progress.total} total`);
  for (const [label, value] of [
    ['Activated', subscription?.startsAt], ['Current period ends', subscription?.endsAt],
    ['Next renewal', subscription?.nextRenewalAt || subscription?.endsAt], ['Grace period ends', subscription?.graceEndsAt],
  ]) {
    const formatted = date(value);
    if (formatted) notes.push(`${label}: ${formatted}`);
  }
  if (typeof subscription?.autoRenew === 'boolean') notes.push(`Automatic renewal: ${subscription.autoRenew ? 'Enabled' : 'Disabled'}`);
  if (subscription?.payableAmount != null && Number.isFinite(Number(subscription.payableAmount))) {
    notes.push(`Last payable amount: Tk ${Number(subscription.payableAmount).toFixed(2)}`);
  }
  if (subscription?.orderNumber) notes.push(`Order ID: ${subscription.orderNumber}`);
  notes.push('Renew confirms the existing plan. If its current period is still active, payment remains scheduled for the renewal date under your package rules.');
  return notes.join('. ');
}
