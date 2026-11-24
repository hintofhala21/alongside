import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarFeed} from '../calendar/feed.mjs';
import {nextPersonalMeal} from '../reminders/personal-meals.mjs';

test('personal meal times follow the calendar across edits and ignore other reminder categories',()=>{
  const now=Date.parse('2026-11-24T08:00:00Z');
  const end=now+10*86400000;
  const plan={timeZone:'Asia/Riyadh',discreet:true,slots:[
    {id:'dinner',time:'19:00'},{id:'afternoon',time:'11:05'},{id:'water',time:'11:15'},
    {id:'lunch',time:'13:00'},{id:'breakfast',time:'08:00'}]};
  const record={plan,expires:end,uid:'example',revised:now,sequence:1};
  assert.equal(nextPersonalMeal(record,now,end).start,Date.parse('2026-11-24T10:00:00Z'));
  plan.slots.find(slot=>slot.id==='lunch').time='14:30';
  const next=nextPersonalMeal(record,now,end);
  assert.equal(next.start,Date.parse('2026-11-24T11:30:00Z'));
  assert.match(calendarFeed(plan,record,now),/DTSTART:20261124T113000Z/);
  assert.equal(nextPersonalMeal(record,now,end,[next.key]).meal,'dinner');
  assert.equal(nextPersonalMeal(record,now,next.start),null);
  assert.equal(nextPersonalMeal({...record,expires:now},now,end),null);
  assert.equal(nextPersonalMeal(null,now,end),null);
});

test('only the selected subscription sends one Breeze alert per meal, respecting the time zone, discreet setting and trial stop',async t=>{
  const {CalendarPlan}=await import('../calendar/worker.mjs');
  const now=Date.parse('2026-11-24T09:59:00Z');
  const due=now+60000;
  let clock=now;
  t.mock.method(Date,'now',()=>clock);
  const env={PERSONAL_FEED_ID:'selected',PERSONAL_STOP_AT:new Date(now+86400000).toISOString(),
    PERSONAL_ZAPIER_URL:'https://mcp.zapier.com/api/v1/connect',CALENDARS:{idFromName:x=>x}};
  const values=new Map();
  const storage={get:key=>values.get(key),put:(key,v)=>values.set(key,v),delete:key=>values.delete(key),setAlarm:at=>values.set('alarm',at)};
  const plan={timeZone:'Asia/Riyadh',discreet:false,slots:[{id:'lunch',time:'13:00'}]};
  const calendar=new CalendarPlan({id:{equals:()=>true},storage,blockConcurrencyWhile:fn=>fn()},env);
  const other=new CalendarPlan({id:{equals:()=>false},storage,blockConcurrencyWhile:fn=>fn()},env);
  const record={plan,expires:now+7*86400000};
  values.set('plan',record);
  await other.schedule(record,now);
  assert.equal(values.get('alarm'),record.expires);
  await calendar.schedule(record,now);
  assert.equal(values.get('alarm'),due);
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const body=JSON.parse(options.body);
    if (body.method==='notifications/initialized')return new Response(null,{status:202});
    if (body.method==='tools/call')calls.push(body.params.arguments.params.dynamic_properties);
    return Response.json({id:body.id,result:{protocolVersion:'2025-03-26'}});
  });
  clock=due;
  await calendar.alarm();
  await calendar.alarm();
  assert.equal(calls.length,1);
  assert.equal(calls[0].event_name,'A little reminder from Breeze: it’s lunchtime 🌿');
  assert.match(calls[0].date_and_time,/1:00\sPM/);
  assert.equal(values.get('personalDue'),undefined);
  plan.discreet=true;
  plan.slots=[{id:'dinner',time:'13:10'}];
  await calendar.schedule(record,clock);
  clock+=600000;
  await calendar.alarm();
  assert.equal(calls[1].event_name,'A little reminder from Breeze 🌿');
});
