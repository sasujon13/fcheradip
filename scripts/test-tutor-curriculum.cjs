const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/assets/tutor/tutor-curriculum.js');
const subject = { level_tr: 'Higher Secondary', class_level: '11-12', subject_tr: 'ICT', name: 'ICT' };
const topic = (name, number, chapter = 5) => ({ name, topic_no: String(number), subject, chapter: { chapter_no: String(chapter), name: 'Chapter ' + chapter } });
test('Bengali and mixed Bengali-English get Bengali prefixes', () => {
  assert.equal(catalog.discussionPrompt('টেবিল'), 'বিস্তারিত আলোচনা করুন: টেবিল');
  assert.equal(catalog.discussionPrompt('HTML টেবিল কী?'), 'বিস্তারিত আলোচনা করুন: HTML টেবিল কী?');
  assert.equal(catalog.discussionPrompt('বিস্তারিত আলোচনা করুন: HTML টেবিল কী?'), 'বিস্তারিত আলোচনা করুন: HTML টেবিল কী?');
  assert.equal(catalog.discussionPrompt('Discuss Details on টেবিল'), 'বিস্তারিত আলোচনা করুন: টেবিল');
  const prompt = catalog.discussionPrompt('টেবিল');
  assert.equal(catalog.discussionPrompt(prompt), prompt);
});
test('English and romanized Bengali get Bengali prefixes while other languages retain localized prefixes', () => {
  assert.equal(catalog.discussionPrompt('Explain HTML tables'), 'বিস্তারিত আলোচনা করুন: Explain HTML tables');
  assert.equal(catalog.discussionPrompt('Discuss Details on HTML'), 'বিস্তারিত আলোচনা করুন: HTML');
  assert.equal(catalog.discussionPrompt('ami HTML bujhte parchi na :('), 'বিস্তারিত আলোচনা করুন: ami HTML bujhte parchi na :(');
  assert.equal(catalog.discussionPrompt('জীববিজ্ঞান'), 'বিস্তারিত আলোচনা করুন: জীববিজ্ঞান');
  assert.equal(catalog.discussionPrompt('مرحبا بالعالم'), 'ناقش بالتفصيل: مرحبا بالعالم');
  assert.equal(catalog.discussionPrompt('Explique la photosynthèse'), 'Développez en détail : Explique la photosynthèse');
  assert.equal(catalog.discussionPrompt('Photosynthesis'), 'বিস্তারিত আলোচনা করুন: Photosynthesis');
  assert.equal(catalog.discussionPrompt('テーブル'), '詳しく説明してください：テーブル');
  assert.equal(catalog.discussionPrompt(''), '');
});
test('subjects use ascending serial then numeric subject code, without mutating the catalog', () => {
  const rows = [{ name: 'ICT', sq: 30, subject_code: 'H275' }, { name: 'English', sq: 30, subject_code: 'H107' }, { name: 'Bangla', sq: 1, subject_code: 'H101' }];
  assert.deepEqual(catalog.sortSubjects(rows).map(s => s.name), ['Bangla', 'English', 'ICT']);
  assert.equal(rows[0].name, 'ICT');
});
test('ICT and chapter five are preferred; unavailable defaults use the first actual entry', () => {
  const rows = [{ name: 'Math', subject_tr: 'Math' }, subject];
  assert.equal(catalog.defaultSubject(rows), subject);
  const chapters = [{ chapter_no: '১০', name: 'ten' }, { chapter_no: '৫', name: 'five' }, { chapter_no: '২', name: 'two' }];
  assert.deepEqual(catalog.sortChapters(chapters).map(c => c.name), ['two', 'five', 'ten']);
  assert.equal(catalog.defaultChapter(chapters).name, 'five');
  assert.equal(catalog.defaultChapter(chapters.slice(2)).name, 'two');
  assert.equal(catalog.defaultChapter([]), undefined);
});
test('English free-text queries can match Bengali catalog topics and reject unrelated names', () => {
  const table = topic('টেবিল', 1), binary = topic('বাইনারি', 2);
  assert.deepEqual(catalog.rankTopics([table, binary], 'Explain table', ''), [table]);
  assert.deepEqual(catalog.rankTopics([table, binary], 'Tell me about volcanoes', ''), []);
});
test('formatting instructions do not suggest grammar topics instead of HTML tables', () => {
  const table = topic('টেবিল', 1), grammar = topic('Changing sentences', 2), punctuation = topic('Use of punctuation', 3);
  assert.deepEqual(catalog.rankTopics([table, grammar, punctuation], 'Explain tables briefly. Use two sentences', ''), [table]);
});
test('clicked topics suggest siblings, exclude the clicked topic and deduplicate', () => {
  const selected = topic('লুপ', 1), sibling = topic('অ্যারে', 2), unrelated = topic('বাইনারি', 3, 3);
  assert.deepEqual(catalog.rankTopics([selected, sibling, sibling, unrelated], 'লুপ', '', selected), [sibling]);
});
test('same-named topics retain distinct chapter context and query matches outrank answer matches', () => {
  const first = topic('টেবিল', 1, 4), second = topic('টেবিল', 1, 5), binary = topic('বাইনারি', 2);
  assert.equal(catalog.rankTopics([binary, first, second], 'table', 'binary')[0], first);
  assert.equal(catalog.rankTopics([first, second], 'টেবিল', '').length, 2);
});
