import { packageRenewalNote } from './package-renewal-note';

describe('Package renewal hover details', () => {
  it('includes the hidden audience and track together with quota, dates, payment and order', () => {
    const note = packageRenewalNote({ planName: 'Adv. 2', audience: 'student', track: 'academic', status: 'active',
      questionLimit: 360, questionsUsed: 40, startsAt: '2026-10-07', nextRenewalAt: '2028-10-07',
      autoRenew: true, payableAmount: 200, orderNumber: 'PKG-123' });
    for (const text of ['Package: Adv. 2', 'Audience: Student', 'Track: Academic', 'Status: Active',
      '40 completed, 320 remaining, 360 total', 'Next renewal:', 'Automatic renewal: Enabled',
      'Last payable amount: Tk 200.00', 'Order ID: PKG-123', 'Renew confirms the existing plan']) {
      expect(note).toContain(text);
    }
  });
  it('omits missing dates, payment and order rather than showing invalid data', () => {
    const note = packageRenewalNote({ endsAt: 'invalid', payableAmount: 'invalid' });
    expect(note).not.toContain('Invalid Date');
    expect(note).not.toContain('Next renewal:');
    expect(note).not.toContain('Last payable amount:');
    expect(note).not.toContain('Order ID:');
  });
});
