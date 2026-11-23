// Use an invented plan and revoke it in finally. Keep both capability URLs and keys out of logs.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {feedId} from './worker.mjs';

const endpoint='https://alongside-calendar.alongside-waicy-demo.workers.dev';
const scheduled=[
  {id:'breakfast',time:'08:00',name:'Breakfast'},
  {id:'morning',time:'10:30',name:'Morning snack',snack:true},
  {id:'lunch',time:'12:30',name:'Lunch'},
  {id:'afternoon',time:'15:30',name:'Afternoon snack',snack:true},
  {id:'dinner',time:'18:30',name:'Dinner'},
  {id:'evening',time:'20:30',name:'Evening snack',snack:true}
];

function verifyEvents(ics, slots, discreet) {
  // Our test plan uses Riyadh (UTC+3, no DST); all six slots are on the same local and UTC date.
  const expected=new Map(slots.map(slot=>{
    const [hours,minutes]=slot.time.split(':').map(Number);
    const utc=String(hours-3).padStart(2,'0')+String(minutes).padStart(2,'0')+'00Z';
    return [utc,slot];
  }));
  const events=new Map(),dates=new Set(),uids=new Set();
  for (const match of ics.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT\r\n/g)) {
    const fields=Object.fromEntries(match[1].split('\r\n').map(line=>{
      const colon=line.indexOf(':');return [line.slice(0,colon),line.slice(colon+1)];
    }));
    const [day,time]=fields.DTSTART.split('T'),slot=expected.get(time);
    assert.ok(slot,'Unexpected reminder time');
    assert.equal(fields.SUMMARY,discreet?'Reminder':slot.name,'Wrong reminder title');
    assert.ok(fields.UID && !uids.has(fields.UID),'Missing or duplicate event identifier');
    const occurrence=day+'/'+slot.id;
    assert.ok(!events.has(occurrence),'Duplicate reminder on a date');
    events.set(occurrence,fields.UID);uids.add(fields.UID);dates.add(day);
  }
  assert.equal(dates.size,28,'The complete four-week feed is present');
  for(const day of dates)for(const {id} of slots)assert.ok(events.has(day+'/'+id),'Missing reminder on a date');
  return {events,dates,uids};
}

export async function checkCalendarService(fetcher=fetch) {
  const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const url=endpoint+'/v1/plans/'+await feedId(key);
  const headers={'Origin':'https://hintofhala21.github.io','Authorization':'Bearer '+key,'Content-Type':'application/json'};
  const plan={discreet:true,timeZone:'Asia/Riyadh',slots:scheduled.map(({id,time})=>({id,time}))};
  async function request(method,read=false,extra={}) {
    try {return await fetcher(url+(read?'.ics':''),{method,signal:AbortSignal.timeout(15000),
      headers:read?{}:{...headers,...extra},body:method==='PUT'?JSON.stringify(plan):undefined});}
    catch {throw Error('Calendar network request failed');}
  }
  let attempted=false;
  try {
    assert.equal((await request('GET',true)).status,404,'unshared calendar');
    attempted=true;
    assert.equal((await request('PUT',false,{'If-None-Match':'*'})).status,200,'creation');
    const before=await request('GET',true);assert.equal(before.status,200,'calendar download');
    const initial=verifyEvents(await before.text(),scheduled,true);
    const meals=scheduled.filter(slot=>!slot.snack).map(slot=>slot.id==='breakfast'?{...slot,time:'09:00'}:slot);
    plan.slots=meals.map(({id,time})=>({id,time}));plan.discreet=false;
    assert.equal((await request('PUT')).status,200,'sync after switching snacks off');
    const after=await request('GET',true);assert.equal(after.status,200,'updated calendar download');
    const updated=verifyEvents(await after.text(),meals,false);
    const sharedDays=[...initial.dates].filter(day=>updated.dates.has(day));
    assert.ok(sharedDays.length>=27,'Expected date overlap, including a possible rollover at midnight');
    for(const day of sharedDays){
      for(const {id,snack} of scheduled){
        const occurrence=day+'/'+id,uid=initial.events.get(occurrence);
        if(snack)assert.ok(!updated.uids.has(uid),'A removed snack still appears with its earlier identifier');
        else assert.ok(updated.events.get(occurrence)===uid,'A retained meal changed event identity');
      }
    }
    return {days:updated.dates.size,meals:updated.events.size,snacks:initial.events.size-updated.events.size};
  } finally {
    if(attempted){
      assert.equal((await request('DELETE')).status,204,'revocation');
      assert.equal((await request('GET',true)).status,404,'access after revocation');
    }
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await checkCalendarService();
  console.log('Live calendar verified: '+report.snacks+' snack reminders removed; '+report.meals+' meal reminders retained across '+report.days+' days; stable meal identifiers and access revoked.');
}
