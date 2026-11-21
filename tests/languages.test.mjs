import test from 'node:test';
import assert from 'node:assert/strict';
import {languagePacks, supportedLanguage} from '../shared/languages.mjs';
import {renderPlan} from '../api/agent.mjs';
import library from '../shared/library.json' with {type:'json'};

test('regional Spanish and French use their translated libraries and preserve citations', () => {
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
