/* Shared catalog ordering and bilingual suggestion matching; no generated topics. */
(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[০-৯]/g, n => '০১২৩৪৫৬৭৮৯'.indexOf(n));
  const compare = (a, b) => normalize(a).localeCompare(normalize(b), 'bn', { numeric: true });
  const serial = value => Number(String(value ?? '').match(/\d+/)?.[0] || Infinity);
  function sortSubjects(items) {
    return [...items].sort((a, b) => (serial(a.sq) - serial(b.sq)) ||
      (serial(a.subject_code) - serial(b.subject_code)) || compare(a.name, b.name));
  }
  function sortChapters(items) {
    return [...items].sort((a, b) => (serial(normalize(a.chapter_no)) - serial(normalize(b.chapter_no))) || compare(a.name, b.name));
  }
  function defaultChapter(items) { return items.find(c => serial(normalize(c.chapter_no)) === 5) || items[0]; }
  function defaultSubject(items) { return items.find(s => /\bict\b|information.*communication|তথ্য.*যোগাযোগ/i.test(s.subject_tr + ' ' + s.name)) || items[0]; }
  const key = topic => [topic.subject?.level_tr, topic.subject?.class_level, topic.subject?.subject_tr,
    topic.chapter?.chapter_no || topic.chapter?.name, topic.name].join('|');
  function discussionPrompt(value) {
    const prefixes = ['Discuss Details on ', 'বিস্তারিত আলোচনা করুন: ', '请详细讨论：', '詳しく説明してください：',
      '자세히 설명해 주세요: ', 'विस्तार से चर्चा करें: ', 'تفصیل سے وضاحت کریں: ', 'ناقش بالتفصيل: ',
      'Объясните подробно: ', 'Поясніть докладно: ', 'อธิบายโดยละเอียด: ', 'Développez en détail : ',
      'Explica en detalle: ', 'Erkläre ausführlich: ', 'Spiega in dettaglio: ', 'Explique em detalhes: '];
    let text = String(value || '').trim();
    // Re-evaluate original input when editing a prompt; prefixes must not make
    // Bengali-only text appear mixed, and must never stack up on re-send.
    let found;
    do { found = prefixes.find(prefix => text.toLowerCase().startsWith(prefix.trimEnd().toLowerCase()));
      if (found) text = text.slice(found.trimEnd().length).trim(); } while (found);
    if (!text) return text;
    const prose = text;
    if (/\p{Script=Bengali}/u.test(prose)) return prefixes[1] + text;
    if (/\b(?:ami|tumi|apni|amar|amake|bujhte|bujhi|bujhao|parchi|kivabe|kibhabe|keno|korbo|korun|bolun|banglay|bangla)\b/i.test(prose)) return prefixes[1] + text;
    if (/[\u3040-\u30ff]/u.test(prose)) return '詳しく説明してください：' + text;
    if (/\p{Script=Hangul}/u.test(prose)) return '자세히 설명해 주세요: ' + text;
    if (/\p{Script=Han}/u.test(prose)) return '请详细讨论：' + text;
    if (/\p{Script=Devanagari}/u.test(prose) && /है|क्या|कैसे|में|करें|हिंदी/u.test(prose)) return 'विस्तार से चर्चा करें: ' + text;
    if (/[ٹڈڑںھہے]/u.test(prose)) return 'تفصیل سے وضاحت کریں: ' + text;
    if (/\p{Script=Arabic}/u.test(prose) && !/[پچژگ]/u.test(prose)) return 'ناقش بالتفصيل: ' + text;
    if (/[іїєґ]/iu.test(prose)) return 'Поясніть докладно: ' + text;
    if (/\p{Script=Cyrillic}/u.test(prose) && /[ыэёъ]/iu.test(prose)) return 'Объясните подробно: ' + text;
    if (/\p{Script=Thai}/u.test(prose)) return 'อธิบายโดยละเอียด: ' + text;
    if (/[^\p{Script=Latin}\p{M}\p{N}\p{P}\p{Z}\p{S}\s]/u.test(prose)) return text;
    if (/\b(?:bonjour|expliquez|pourquoi|comment|la|le|les|une)\b|photosynthèse/iu.test(prose)) return 'Développez en détail : ' + text;
    if (/[¿¡]|\b(?:hola|explica|una|qué|cómo)\b/iu.test(prose)) return 'Explica en detalle: ' + text;
    if (/\b(?:erkläre|bitte|warum|wie|ist)\b/iu.test(prose)) return 'Erkläre ausführlich: ' + text;
    if (/\b(?:spiega|perché|ciao)\b/iu.test(prose)) return 'Spiega in dettaglio: ' + text;
    if (/\b(?:olá|explique|português)\b|[ãõ]/iu.test(prose)) return 'Explique em detalhes: ' + text;
    return /\p{Script=Latin}/u.test(prose) ? prefixes[1] + text : text;
  }
  const stop = new Set(('the a an is are of to in on for and or with what how why explain discuss details about please ' +
    'this that can you me my it be do does from as by use used using give write tell show example examples sentence sentences paragraph paragraphs brief briefly short answer summary one two three ' +
    'এর কি কী এবং বা ও একটি এই যে কিভাবে কীভাবে সম্পর্কে বিস্তারিত আলোচনা কর করুন বলুন এক দুই তিন বাক্য বাক্যে সংক্ষেপে').split(' '));
  const aliases = [['table','টেবিল','সারণি'], ['database','ডেটাবেজ','ডাটাবেজ'], ['programming','প্রোগ্রামিং'],
    ['network','নেটওয়ার্ক','নেটওয়ার্ক'], ['algorithm','অ্যালগরিদম','এলগরিদম'], ['html','এইচটিএমএল'],
    ['number','সংখ্যা'], ['binary','বাইনারি'], ['computer','কম্পিউটার'], ['internet','ইন্টারনেট']];
  function words(text) {
    const tokens = new Set((normalize(text).match(/[\p{L}\p{M}\p{N}]+/gu) || []).filter(w => w.length > 1 && !stop.has(w)));
    for (const word of [...tokens]) if (/^[a-z]{3,}s$/.test(word) && !word.endsWith('ss')) tokens.add(word.slice(0, -1));
    for (const group of aliases) if (group.some(w => tokens.has(w))) group.forEach(w => tokens.add(w));
    return tokens;
  }
  function rankTopics(items, query, answer, selected, limit = 6) {
    const queryWords = words(query), answerWords = words(answer);
    const unique = new Map();
    for (const item of items) {
      if (!item.name || /^all topics$/i.test(item.name) || (selected && key(item) === key(selected))) continue;
      if (!unique.has(key(item))) unique.set(key(item), item);
    }
    return [...unique.values()].map(item => {
      const topicWords = words(item.name);
      const match = set => [...topicWords].filter(word => set.has(word)).length;
      let score = match(queryWords) * 12 + match(answerWords) * 2;
      if (selected && item.subject?.subject_tr === selected.subject?.subject_tr &&
          item.subject?.level_tr === selected.subject?.level_tr && item.subject?.class_level === selected.subject?.class_level &&
          String(item.chapter?.chapter_no || item.chapter?.name) === String(selected.chapter?.chapter_no || selected.chapter?.name)) score += 5;
      return { item, score };
    }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || compare(a.item.topic_no, b.item.topic_no) || compare(a.item.name, b.item.name))
      .slice(0, limit).map(result => result.item);
  }
  const api = { sortSubjects, sortChapters, defaultSubject, defaultChapter, rankTopics, key, discussionPrompt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TutorCurriculum = api;
})(typeof window === 'undefined' ? globalThis : window);
