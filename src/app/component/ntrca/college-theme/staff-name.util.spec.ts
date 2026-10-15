import { chooseStaffName } from './staff-name.util';

describe('chooseStaffName', () => {
  it('prefers a complete English name and title-cases each part', () => {
    expect(chooseStaffName('BISWAJIT KARMAKER', 'বিশ্বজিৎ কর্মকার'))
      .toBe('Biswajit Karmaker');
  });

  it('uses a complete Bengali name when the English field is only a few letters', () => {
    expect(chooseStaffName('abc', 'বিশ্বজিৎ কর্মকার'))
      .toBe('বিশ্বজিৎ কর্মকার');
  });

  it('rejects repeated-letter typos and uses the Bengali name', () => {
    expect(chooseStaffName('erttt', 'বিশ্বজিৎ কর্মকার'))
      .toBe('বিশ্বজিৎ কর্মকার');
  });

  it('uses title-cased English when both fields are too short or malformed', () => {
    expect(chooseStaffName('d', 'প'))
      .toBe('D');
    expect(chooseStaffName('ert', 'erttt'))
      .toBe('Ert');
  });

  it('does not display a malformed source value when neither is usable', () => {
    expect(chooseStaffName('ttt', '¿¿¿'))
      .toBe('Name unavailable');
  });
});
