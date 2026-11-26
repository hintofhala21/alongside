import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import mealTerms from '../shared/meal-terms.json' with {type:'json'};
const ctx={AlongsideLibrary:{mealTerms}};
runInNewContext(await readFile(new URL('../site/assets/meal-ideas.js',import.meta.url),'utf8'),ctx);
test('guided meal requests preview only recognized food preferences',()=>{
  assert.deepEqual([...ctx.AlongsideMeals.parse('strawberries and yoghurt, soft')],['Strawberries','Yogurt','Soft']);
  assert.equal(ctx.AlongsideMeals.parse('chicken, a private note'),null);
  assert.ok(ctx.AlongsideMeals.request('give me a meal with rice'));
  assert.equal(ctx.AlongsideMeals.request('No meal ideas please'),false);
  assert.ok(ctx.AlongsideMeals.nutrients.VitaminB12);
});
