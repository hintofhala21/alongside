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
  assert.equal(nextPersonalMeal(record,now,end).meal,'afternoon');
  plan.slots=plan.slots.filter(slot=>slot.id!=='afternoon');
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

test('an opted-in conflict alert goes once, omits event details, and is withdrawn on keep or date-only reschedule',async t=>{
  const {CalendarPlan}=await import('../calendar/worker.mjs');
  let now=Date.parse('2026-11-24T08:00:00Z'); t.mock.method(Date,'now',()=>now);
  const env={PERSONAL_FEED_ID:'owner',PERSONAL_STOP_AT:'2026-12-01T00:00:00Z',
    PERSONAL_ZAPIER_URL:'https://mcp.zapier.com/api/v1/connect',CALENDARS:{idFromName:x=>x}};
  const values=new Map(),sends=[];
  const storage={get:k=>values.get(k),put:(k,v)=>values.set(k,v),delete:k=>values.delete(k),setAlarm:at=>values.set('alarm',at)};
  const service=new CalendarPlan({id:{equals:v=>v==='owner'},storage,blockConcurrencyWhile:fn=>fn()},env);
  const mark={date:'2026-11-24',id:'lunch',time:'14:00'};
  const mark2={date:'2026-11-24',id:'dinner',time:'19:00'};
  const base={timeZone:'Asia/Riyadh',discreet:true,slots:[{id:'lunch',time:'14:00'},{id:'dinner',time:'19:00'}]};
  const save=async changes=>{
    const reply=await service.fetch(new Request('https://calendar.example',{method:'PUT',headers:{
      'Content-Type':'application/json',...(!values.has('plan')?{'If-None-Match':'*'}:{})},body:JSON.stringify({...base,...changes})}));
    assert.equal((await reply.json()).personalAlertsAvailable,true);
  };
  let onInitialize;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const body=JSON.parse(options.body);
    if(body.method==='initialize' && onInitialize)await onInitialize();
    if(body.method==='notifications/initialized')return new Response(null,{status:202});
    if(body.method==='tools/call')sends.push(body.params.arguments.params.dynamic_properties);
    return Response.json({id:body.id,result:{protocolVersion:'2025-03-26'}});
  });
  await save({conflicts:[mark]});const alertTime=values.get('alarm');now+=300;
  await save({conflicts:[mark]});assert.equal(values.get('alarm'),alertTime);
  await save({conflicts:[]});assert.equal(values.get('personalDue').kind,undefined);
  now=alertTime;await service.alarm();assert.equal(sends.length,0);
  await save({conflicts:[mark]});now=values.get('alarm');await service.alarm();
  assert.match(sends[0].event_name,/overlaps.*keep the time or choose another time for today/);
  assert.doesNotMatch(sends[0].event_name,/lunch|conference/);
  await save({conflicts:[mark]});await service.alarm();assert.equal(sends.length,1);
  await save({conflicts:[mark2]});now=values.get('alarm');
  onInitialize=async()=>{onInitialize=null;await save({overrides:[{...mark2,time:'19:30'}]});};
  await service.alarm();assert.equal(sends.length,1);
  assert.equal(values.get('personalDue').start,Date.parse('2026-11-24T11:00:00Z'));
});
