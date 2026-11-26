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

test('approving a weekly check-in moves one date, supports undo and rolls back a failed save',async()=>{
  const app=await readFile(new URL('../site/assets/app.js',import.meta.url),'utf8');
  const extract=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));
  const date='2026-11-26', other='2026-11-27', plan={checkinTime:'16:00'};
  const context={profile:{id:'demo'},record:()=>plan,weekDates:()=>[date,other],zone:()=>'UTC',
    byId:()=>({}),formatTime:t=>t,renderWeek(){},renderDailyPrompt(){},renderDueReminders(){},persist:()=>true};
  const api=vm.runInNewContext(extract('function checkinAt(', 'function openWeek(')+
    extract('function saveWeekDate(', "byId('week-busy-form').onsubmit")+';({checkinAt,saveWeekDate})',context);
  const [choice]=compare([{id:'checkin',time:plan.checkinTime}],
    [{start:+utc(date,'16:00'),end:+utc(date,'16:30')}],date,'UTC',utc,+utc(date,'08:00'));
  assert.equal(choice.later,'16:30');
  api.saveWeekDate(date,choice.later);
  assert.equal(api.checkinAt(plan,date),'16:30');
  assert.equal(api.checkinAt(plan,other),'16:00');
  context.persist=()=>false;
  api.saveWeekDate(date,null);
  assert.equal(api.checkinAt(plan,date),'16:30');
  context.persist=()=>true;
  api.saveWeekDate(date,null);
  assert.equal(api.checkinAt(plan,date),'16:00');
});

test('a meal suggestion fits the whole half hour before an eight o’clock calendar block',()=>{
  const date='2026-11-27';
  const slot={id:'breakfast',time:'08:00',minutes:30};
  const ranges=[{start:+utc(date,'08:00'),end:+utc(date,'09:00')}];
  const [conflict]=compare([slot],ranges,date,'UTC',utc,+utc(date,'06:00'));
  assert.equal(conflict.earlier,'07:30');
  assert.equal(conflict.later,'09:00');
  assert.equal(conflict.busy.end,+utc(date,'09:00'));
});
