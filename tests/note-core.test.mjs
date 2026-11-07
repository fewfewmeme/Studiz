import test from 'node:test'; import assert from 'node:assert/strict';
import { looksLikeMarkdown, plainToHtml, cleanStyle, titleFromText, countWordsHtml, buildNoteDoc } from '../js/note-core.js';
test('markdown detection', () => {
  assert.ok(looksLikeMarkdown('Это **важно** слово'));
  assert.ok(looksLikeMarkdown('## Заголовок\nтекст'));
  assert.ok(looksLikeMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'));
  assert.ok(looksLikeMarkdown('- один\n- два'));
  assert.ok(!looksLikeMarkdown('Просто текст без разметки.\nВторая строка.'));
  assert.ok(!looksLikeMarkdown('2 * 3 = 6 и 5 * 4 = 20'));
});
test('plain text -> paragraphs and line breaks, html is escaped', () => { assert.equal(plainToHtml('a\nb\n\n<c>'), '<p>a<br>b</p>\n<p>&lt;c&gt;</p>'); });
test('style whitelist keeps safe declarations only', () => {
  assert.equal(cleanStyle('color:#c0392b; font-size: 24px; position:fixed; background:url(x)'), 'color:#c0392b;font-size:24px');
  assert.equal(cleanStyle('float:left;width:40%;transform:rotate(-15deg)'), 'float:left;width:40%;transform:rotate(-15deg)');
  assert.equal(cleanStyle('transform:scale(9);font-family:url(javascript:1)'), '');
  assert.equal(cleanStyle('color:expression(alert(1))'), '');
});
test('title / words / document wrapper', () => {
  assert.equal(titleFromText('<h2>Сердце</h2><p>x</p>'), 'Сердце'); assert.equal(titleFromText('', 'Текст'), 'Текст');
  assert.equal(countWordsHtml('<p>раз два <img src="x"> три</p>'), 3);
  const d = buildNoteDoc('<p>x</p>', 'T', (b, o) => `<html><head><style>p{}</style></head><body>${b}${o.title}</body></html>`);
  assert.ok(d.includes('data-wrap="left"'));
});
