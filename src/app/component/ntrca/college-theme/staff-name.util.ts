const BENGALI = /[\u0980-\u09FF]/;
const LATIN = /[A-Za-z]/;
const REPEATED_LATIN = /([A-Za-z])\1{2,}/i;
const REPEATED_BENGALI = /([\u0980-\u09FF])\1{2,}/;
const PLACEHOLDER = /^(?:unknown|not\s+available|n\/?a|none|null|test|dummy)$/i;

function tidy(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function titleCaseEnglish(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\b[a-z]/g, letter => letter.toLocaleUpperCase('en'));
}

/** Prefer a credible English name, then Bengali; never invent a spelling. */
export function chooseStaffName(name: unknown, nameBn: unknown): string {
  const values = [tidy(name), tidy(nameBn)].filter(Boolean);
  const english = values.filter(value => LATIN.test(value) && !BENGALI.test(value)
    && !REPEATED_LATIN.test(value) && !PLACEHOLDER.test(value));
  const bengali = [tidy(nameBn), tidy(name)].filter(value => BENGALI.test(value)
    && !REPEATED_BENGALI.test(value));
  const completeEnglish = english.find(value => (value.match(/[A-Za-z]/g) || []).length > 3);
  if (completeEnglish) return titleCaseEnglish(completeEnglish);
  const completeBengali = bengali.find(value => (value.match(/[\u0980-\u09FF]/g) || []).length > 3);
  if (completeBengali) return completeBengali;
  if (english.length) return titleCaseEnglish(english[0]);
  if (bengali.length) return bengali[0];
  return 'Name unavailable';
}
