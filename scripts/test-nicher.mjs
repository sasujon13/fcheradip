// Inline the logic for quick verification
const GLUED = '(?:কোনটি|সঠিক)';
const LINE_BREAK = '(?:\\s*(?:<br\\s*\\/?>|[\\r\\n]+)\\s*)+';

function normalizeGlued(text) {
  let s = String(text ?? '');
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(
      new RegExp(`([\\u0980-\\u09FF]+)(ন)(নিচের)${LINE_BREAK}(${GLUED}[\\s\\S]*)`, 'gi'),
      '$1\nনিচের $4'
    );
    s = s.replace(
      new RegExp(`([\\u0980-\\u09FF]+)(নিচের)${LINE_BREAK}(${GLUED}[\\s\\S]*)`, 'gi'),
      '$1\nনিচের $3'
    );
    s = s.replace(
      new RegExp(`([\\u0980-\\u09FF]+)(ন)(নিচের)\\s+(${GLUED}[\\s\\S]*)`, 'gi'),
      '$1\nনিচের $4'
    );
    s = s.replace(
      new RegExp(`([\\u0980-\\u09FF]+)(নিচের)\\s+(${GLUED}[\\s\\S]*)`, 'gi'),
      '$1\nনিচের $3'
    );
  }
  return s;
}

const cases = [
  'বাণিজ্যেনিচের\nকোনটি সঠিক?',
  'বাণিজ্যেনিচের<br>কোনটি সঠিক?',
  'বাণিজ্যেনিচের<br />কোনটি সঠিক?',
  'ii. ফিঙ্গার প্রিন্টনিচের\nকোনটি সঠিক?',
  'ফিঙ্গার প্রিন্ট\nনিচের\nকোনটি সঠিক?',
];
for (const c of cases) {
  console.log('IN:', JSON.stringify(c));
  console.log('OUT:', JSON.stringify(normalizeGlued(c)));
  console.log('---');
}
