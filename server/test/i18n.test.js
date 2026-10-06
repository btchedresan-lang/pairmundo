import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT, pickLang, t } from '../server/i18n.js';

test('i18n: Swedish is picked from the browser and every server text has it', () => {
  assert.equal(pickLang('sv-SE,sv;q=0.9,en;q=0.8'), 'sv');
  assert.match(t('sv', 'Speaks {languages}', { languages: 'tyska' }), /tyska/);
  for (const [en, langs] of Object.entries(DICT)) assert.ok(langs.sv, `missing Swedish for: ${en}`);
});
