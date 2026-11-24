import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const js=await readFile(new URL('../site/assets/apple-calendar.js',import.meta.url),'utf8');
const {parseFragment,compare}=vm.runInNewContext(js+';AlongsideAppleCalendar');
const utc=(date,time)=>new Date(date+'T'+time+':00Z');
test('Apple time-only import checks future meals, respects exact boundaries and offers ordered options',()=>{
  const date='2026-11-24',now=+utc(date,'09:00');
  const ranges=parseFragment('#apple-busy='+encodeURIComponent('2026-11-24T13:30:00Z|2026-11-24T14:30:00Z'));
  const slots=[{id:'breakfast',time:'08:00'},{id:'lunch',time:'14:00'},{id:'afternoon',time:'14:30'}];
  const choices=compare(slots,ranges,date,'UTC',utc,now);
  assert.equal(choices.length,1);assert.equal(choices[0].id,'lunch');
  assert.equal(choices[0].earlier,'13:25');assert.equal(choices[0].later,'');
  assert.equal(compare(slots.slice(0,2),ranges,date,'UTC',utc,now)[0].later,'14:30');
  assert.equal(parseFragment('#apple-busy=').length,0);assert.throws(()=>parseFragment('#apple-busy=meeting-title'));
});
