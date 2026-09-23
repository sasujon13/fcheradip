const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../src/assets/tutor/tutor-format.js');

test('Bengali headings, numbered steps and inline code are readable', () => {
  const html = format('## টেবিল\n1. **শিরোনাম**\n2. Use `<table>`');
  assert.match(html, /<h3>টেবিল<\/h3>/);
  assert.match(html, /<ol><li><strong>শিরোনাম<\/strong><\/li>/);
  assert.match(html, /<code>&lt;table&gt;<\/code>/);
});
test('model output cannot inject HTML or event handlers', () => {
  const html = format('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
});
test('switching list kinds and paragraphs produces balanced lists', () => {
  assert.equal(format('- one\n- two\n\n1. three\nend'), '<ul><li>one</li><li>two</li></ul><ol><li>three</li></ol><p>end</p>');
});
