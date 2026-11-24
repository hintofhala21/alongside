import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import worker,{CalendarPlan,feedId} from '../calendar/worker.mjs';
import {calendarFeed,normalizePlan,DAY} from '../calendar/feed.mjs';
import {checkCalendarService} from '../calendar/smoke.mjs';

const base='https://calendar.example', origin='https://site.example';
const plan={timeZone:'Asia/Riyadh',discreet:true,slots:[{id:'breakfast',time:'08:00'},{id:'lunch',time:'12:30'}]};
const key='a'.repeat(64),id=await feedId(key);
function service() {
  const objects=new Map();
  const env={ALLOWED_ORIGIN:origin,CALENDARS:{idFromName:x=>x,get(x){
    if(!objects.has(x)){
      const memory=new Map();
      const storage={get:k=>memory.get(k),put:(k,v)=>memory.set(k,v),delete:k=>memory.delete(k),deleteAll:()=>memory.clear(),setAlarm(){}};
      objects.set(x,new CalendarPlan({storage,blockConcurrencyWhile:fn=>fn()}));
    }
    return objects.get(x);
  }}};
  return {env,request:(path,options={})=>worker.fetch(new Request(base+path,options),env)};
}
const path='/v1/plans/'+id;
function write(method,data,headers={}) {return {method,body:data && JSON.stringify(data),
  headers:{Authorization:'Bearer '+key,Origin:origin,'Content-Type':'application/json',...headers}};}
test('private calendar requires an owner key to publish or revoke; read links cannot write',async()=>{
 const {request}=service();
 assert.equal((await request(path+'.ics')).status,404);
 assert.equal((await request(path,write('PUT',plan,{Origin:'https://other.example'}))).status,403);
 assert.equal((await request(path,write('PUT',plan,{Authorization:'Bearer '+id}))).status,403);
 assert.equal((await request(path,write('PUT',plan))).status,410);
 const created=await request(path,write('PUT',plan,{'If-None-Match':'*'}));assert.equal(created.status,200);
 assert.equal(created.headers.get('Access-Control-Allow-Origin'),origin);
 const feed=await request(path+'.ics');assert.match(feed.headers.get('Content-Type'),/text\/calendar/);
 const text=await feed.text();assert.match(text,/SUMMARY:Reminder\r\n/);assert.doesNotMatch(text,/SUMMARY:Breakfast|Asia\/Riyadh/);
 assert.equal((text.match(/BEGIN:VEVENT/g)||[]).length,56);
 const changed={...plan,discreet:false,slots:[{id:'breakfast',time:'09:00'}]};
 assert.equal((await request(path,write('PUT',changed))).status,200);
 const updated=await (await request(path+'.ics')).text();assert.match(updated,/SUMMARY:Breakfast/);assert.doesNotMatch(updated,/SUMMARY:Lunch/);
 assert.equal(text.split('UID:')[1].split('\r')[0],updated.split('UID:')[1].split('\r')[0]);
 assert.equal((await request(path,write('DELETE'))).status,204);
 assert.equal((await request(path+'.ics')).status,404);
 assert.equal((await request(path,write('PUT',plan,{'If-None-Match':'*'}))).status,410);
 assert.equal((await request(path,write('DELETE'))).status,204);
});
test('switching off snacks removes every snack while preserving breakfast, lunch and dinner on the existing calendar',async()=>{
  const {env}=service();env.ALLOWED_ORIGIN='https://hintofhala21.github.io';
  const result=await checkCalendarService((url,options)=>worker.fetch(new Request(url,options),env));
  assert.deepEqual(result,{days:28,meals:84,snacks:84});
});
test('validation excludes personal information, unknown slots, bad time zones, malformed/oversized data and rate-limited updates',async()=>{
 const {request,env}=service();
 for (const invalid of [{...plan,name:'Alice'},{...plan,timeZone:'Mars/Moon'},{...plan,slots:[{id:'custom',time:'08:00'}]},
   {...plan,slots:[{id:'lunch',time:'24:00'}]},{...plan,slots:[...plan.slots,plan.slots[0]]},{...plan,notes:'x'.repeat(4096)}]){
    assert.equal((await request(path,write('PUT',invalid,{'If-None-Match':'*'}))).status,400);
 }
 env.WRITE_LIMIT={limit:async()=>({success:false})};
 assert.equal((await request(path,write('PUT',plan,{'If-None-Match':'*'}))).status,429);
 assert.equal((await request(path+'.ics')).status,404);
});
function fixture(day,time,zone) {
 const now=Date.parse(day+'T12:00:00Z');
 const events=calendarFeed(normalizePlan({timeZone:zone,discreet:false,slots:[{id:'breakfast',time}]}),
   {uid:'test',sequence:1,revised:now,expires:now+90*DAY},now);
 assert.ok(events.endsWith('END:VCALENDAR\r\n'));return events;
}
test('wall times follow DST, including missing, repeated, fractional-hour and midnight transitions',()=>{
 assert.match(fixture('2026-03-07','08:00','America/New_York'),/DTSTART:20260308T120000Z/);
 assert.match(fixture('2026-03-07','02:30','America/New_York'),/DTSTART:20260308T073000Z/);
 assert.match(fixture('2026-10-31','01:30','America/New_York'),/DTSTART:20261101T053000Z/);
 assert.match(fixture('2026-10-03','02:15','Australia/Lord_Howe'),/DTSTART:20261003T154500Z/);
 assert.match(fixture('2026-11-01','00:00','Asia/Kathmandu'),/DTSTART:20261031T181500Z/);
});
test('calendar expiration removes access after the retention period',async()=>{
 const old=Date.now;
 try{
 const {request}=service();const now=old();Date.now=()=>now;
 await request(path,write('PUT',plan,{'If-None-Match':'*'}));Date.now=()=>now+91*DAY;
 assert.equal((await request(path+'.ics')).status,404);
 } finally {Date.now=old;}
});

const client=await readFile(new URL('../site/assets/calendar.js',import.meta.url),'utf8');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.textContent='';}
 append(...nodes){this.children.push(...nodes);} replaceChildren(){this.children=[];}
 addEventListener(name,fn){this.handlers[name]=fn;} setAttribute(){}
 find(predicate){if(predicate(this))return this;for(const child of this.children){const result=child.find(predicate);if(result)return result;}}
}
test('calendar consent, owner confirmation, retries, updates, disconnect and age eligibility through browser controls',async()=>{
 const {request}=service();const calls=[];const memory=new Map();const container=new Element('div');
 const {AlongsideCalendar}=runInNewContext(client+';globalThis',{crypto,TextEncoder,AbortSignal,fetch,
   document:{createElement:tag=>new Element(tag),documentElement:{lang:'en'}},navigator:{}});
 let shared=true,meals=structuredClone(plan),online=true;
 const controller=AlongsideCalendar.mount({container,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
   getProfileId:()=>'localProfile',getPlan:()=>meals,canShare:()=>shared,base,fetcher:async(url,opts)=>{
     calls.push(opts.method);if(!online)throw Error();return request(new URL(url).pathname,{...opts,headers:{...opts.headers,Origin:origin}});
   }});
 const button=name=>container.find(el=>el.tag==='button'&&el.textContent===name);
 const click=label=>{const el=button(label);assert.ok(el,label);return el.handlers.click();};
 await controller.refresh();assert.deepEqual(calls,[]);
 click('Review calendar connection');click('Cancel');assert.deepEqual(calls,[]);
 click('Review calendar connection');online=false;await click('Allow calendar sharing');assert.equal(memory.size,1);
 online=true;await click('Allow calendar sharing');assert.equal(calls.length,2);
 const link=container.find(el=>el.tag==='a'&&el.textContent==='Open calendar app');assert.match(link.href,/^webcal:/);
 click('Use Google Calendar or Outlook');
 const google=container.find(el=>el.tag==='a'&&el.textContent==='Google Calendar');
 assert.equal(google.href,'https://calendar.google.com/calendar/u/0/r/settings/addbyurl');
 const outlook=container.find(el=>el.tag==='a'&&el.textContent==='Outlook');
 assert.equal(outlook.href,'https://outlook.live.com/calendar/');
 await controller.refresh();assert.equal(calls.length,2);
 meals.slots=[{id:'breakfast',time:'09:20'}];await controller.refresh();assert.equal(calls.length,3);
 const feed=await request(new URL(link.href).pathname);assert.match(await feed.text(),/T062000Z/);
 online=false;await assert.rejects(controller.disconnect());assert.equal(memory.size,1);
 online=true;await controller.disconnect();assert.equal(memory.size,0);
 assert.equal((await request(new URL(link.href).pathname)).status,404);
 shared=false;await controller.refresh();assert.equal(container.hidden,true);assert.equal(button('Review calendar connection'),undefined);
});

test('a dated edit moves one event on its original UID, omits busy details and cannot activate another feed',async t=>{
  const now=Date.parse('2026-11-24T06:00:00Z'); t.mock.method(Date,'now',()=>now);
  const {request,env}=service();
  const response=await request(path,write('PUT',plan,{'If-None-Match':'*'}));
  assert.equal((await response.json()).personalAlertsAvailable,false);
  const get=async()=> (await request(path+'.ics')).text();
  const event=(feed,date)=>feed.split('BEGIN:VEVENT').find(e=>e.includes('-'+date+'-2@alongside'));
  const old=event(await get(),'20261124');const uid=old.match(/UID:[^\r]+/)[0];
  const change={date:'2026-11-24',id:'lunch',time:'14:30'};
  const changed={...plan,overrides:[change],conflicts:[change]};
  assert.equal((await request(path,write('PUT',changed))).status,200);
  const feed=await get();
  assert.ok(event(feed,'20261124').includes(uid));assert.match(event(feed,'20261124'),/DTSTART:20261124T113000Z/);
  assert.match(event(feed,'20261125'),/DTSTART:20261125T093000Z/);
  assert.doesNotMatch(feed,/overlap|conflict|busy/i);
  assert.equal((await env.CALENDARS.get(id).store.get('plan')).plan.conflicts,undefined);
  for (const invalid of [{...change,title:'Private meeting'},{...change,date:'2026-02-30'},{...change,id:'unknown'}])
    assert.equal((await request(path,write('PUT',{...plan,overrides:[invalid]}))).status,400);
  assert.equal((await request(path,write('PUT',plan))).status,200);
  assert.match(event(await get(),'20261124'),/DTSTART:20261124T093000Z/);
});
