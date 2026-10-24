import {localContact,PhoneDisplayPipe} from './phone-display.pipe';
describe('Bangladesh contact presentation',()=>{
  it('adds the local zero only when the country prefix is absent',()=>{
    expect(localContact('1722710298')).toBe('01722710298');
    expect(new PhoneDisplayPipe().transform('1722710298','+880')).toBe('01722710298');
    expect(localContact('01722710298')).toBe('01722710298');
    expect(localContact('+8801722710298')).toBe('+8801722710298');
  });
  it('preserves international numbers and non-phone identifiers',()=>{
    expect(localContact('1722710298','US')).toBe('1722710298');
    expect(localContact('teacher@example.com')).toBe('teacher@example.com');
    expect(localContact('admin')).toBe('admin');expect(localContact(null)).toBe('');
  });
});
