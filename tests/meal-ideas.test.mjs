import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../site/assets/meal-ideas.js',import.meta.url),'utf8');
const context={};runInNewContext(source,context);
const {request,nutrients}=context.AlongsideMeals;
test('meal picker responds to invitations and leaves disclosures and refusals in chat',()=>{
  for(const q of ['Meal ideas','Any meal ideas for calcium?','Can you suggest a meal for low iron?'])assert.equal(request(q),true,q);
  for(const q of ['Lunch was hard','I have low iron','No meal ideas please','Can you suggest a meal for weight loss?','Please just listen.'])assert.equal(request(q),false,q);
});
test('optional nutrient choices cover vitamins and minerals and retain the earlier profile keys',()=>{
  for(const key of ['iron','vitaminD','zinc','VitaminB12','Folate','Calcium','Iodine','Magnesium'])assert.ok(nutrients[key]);
});
