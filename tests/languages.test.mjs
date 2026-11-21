import test from 'node:test';
import assert from 'node:assert/strict';
import {languagePacks, languageNames, supportedLanguage} from '../shared/languages.mjs';
import {renderPlan} from '../api/agent.mjs';
import library from '../shared/library.json' with {type:'json'};

test('all nine interface choices resolve regional codes and preserve cited translations', () => {
  assert.deepEqual(Object.keys(languageNames).sort(), ['ar','de','en','es','fr','hi','ja','pt','zh']);
  for (const [requested, expected] of Object.entries({'cmn':'zh','zh-Hans-CN':'zh','hi-IN':'hi','de-AT':'de','pt-BR':'pt','ja-JP':'ja','ar-SA':'ar'})) {
    assert.equal(supportedLanguage(requested), expected);
  }
  assert.equal(supportedLanguage('es-MX'), 'es');
  assert.equal(supportedLanguage('fr-CA'), 'fr');
  assert.equal(supportedLanguage('unknown'), 'en');
  for (const [language, pack] of Object.entries(languagePacks)) {
    for (const [id, answer] of Object.entries(library.medicalAnswers)) {
      assert.ok(pack[answer.title], 'Missing translated title: ' + id);
      assert.ok(pack[answer.text], 'Missing translated summary: ' + id);
      if (id === 'plan') continue;
      const reply = renderPlan({acknowledgement:'hard', followup:'team', information:id, action:'care'}, language);
      assert.ok(reply.text.includes(pack[answer.text]));
      assert.deepEqual(reply.sources, answer.sources);
    }
  }
});

test('each translation contains every interface string and preserves variable names', () => {
  const reference = Object.keys(languagePacks.fr).sort();
  const slots = text => (text.match(/\{\w+\}/g) || []).sort();
  for (const [code, pack] of Object.entries(languagePacks)) {
    assert.deepEqual(Object.keys(pack).sort(), reference, code);
    for (const [key, value] of Object.entries(pack)) {
      assert.ok(typeof value === 'string' && value.trim(), code + ' / ' + key);
      assert.deepEqual(slots(value), slots(key), code + ' / ' + key);
    }
  }
});
