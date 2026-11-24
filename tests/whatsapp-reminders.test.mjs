import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import worker,{ReminderStore,sendReminder} from '../reminders/worker.mjs';
import {day,nextSlot,readSchedule} from '../reminders/schedule.mjs';

const origin='https://example.test';
const phone='+12025550142';
const good={phone,timeZone:'Asia/Riyadh',times:['08:00','16:00'],consent:true};

function fixture() {
  const env={WA_ACCESS_TOKEN:'fixture',WA_APP_SECRET:'fixture',WA_VERIFY_TOKEN:'fixture',
    WA_PHONE_NUMBER_ID:'1234',WA_BUSINESS_NUMBER:'12025550100',WA_TEMPLATE_NAME:'daily_reminder',
    WA_TEMPLATE_LANGUAGE:'en_US',WA_GRAPH_VERSION:'v25.0',ALLOWED_ORIGIN:origin};
  const stores=new Map();
  env.REMINDERS={
    idFromName:name=>createHash('sha256').update(name).digest('hex'),idFromString:id=>id,
    get(id) {
      if (!stores.has(id)) {
        const map=new Map();
        const storage={async get(k){return structuredClone(map.get(k));}, async put(k,v){map.set(k,structuredClone(v));},
          async delete(k){map.delete(k);},async setAlarm(t){map.set('alarm',t);},async deleteAlarm(){map.delete('alarm');},
          async transaction(fn){return fn();}};
        stores.set(id,new ReminderStore({storage},env));
      }
      const store=stores.get(id);
      return {fetch:(url,opts)=>store.fetch(new Request(url,opts))};
    }
  };
  async function req(path,method='GET',body=null,token='',customOrigin=origin) {
    return worker.fetch(new Request('https://api.example'+path,{method,headers:{
      Origin:customOrigin,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      ...(body && {body:JSON.stringify(body)})}),env);
  }
  async function hook({from=phone,text,signature='valid',to='1234',receipt,timestamp=Date.now()}={}) {
    const payload=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
      metadata:{phone_number_id:to},...(receipt?{statuses:[receipt]}:{messages:[{from:from.slice(1),timestamp:Math.floor(timestamp/1000),text:{body:text}}]})}}]}]});
    const mac=signature==='valid' ? createHmac('sha256',env.WA_APP_SECRET).update(payload).digest('hex') : signature;
    return worker.fetch(new Request('https://api.example/webhook',{method:'POST',body:payload,headers:{'X-Hub-Signature-256':'sha256='+mac}}),env);
  }
  async function enroll(plan=good) {
    const r=await req('/subscriptions','POST',plan);assert.equal(r.status,201);
    const subscription=await r.json();
    const command=new URL(subscription.activationUrl).searchParams.get('text');
    return {...subscription,command,store:stores.get(subscription.id),
      manage:(method='GET',data,token=subscription.token)=>req('/subscriptions/'+subscription.id,method,data,token)};
  }
  return {env,req,hook,enroll};
}

test('opt-in endpoint checks sender configuration, consent, phone, zone, wall times, and website origin',async()=>{
  const {env,req}=fixture();
  assert.equal((await req('/status').then(r=>r.json())).available,true);
  for(const invalid of [{consent:false},{phone:'12345'},{phone:[phone]},{timeZone:'unknown-zone'},{times:['24:00']},{times:[]}]){
    assert.equal((await req('/subscriptions','POST',{...good,...invalid})).status,400);
  }
  assert.equal((await req('/subscriptions','POST',good,'','https://unrelated.example')).status,403);
  delete env.WA_APP_SECRET;
  assert.equal((await req('/status').then(r=>r.json())).available,false);
  assert.equal((await req('/subscriptions','POST',good)).status,503);
});

test('Meta challenge, sender signature and business phone number must match; only correct inbound number activates',async()=>{
  const {env,req,hook,enroll}=fixture();
  const challenge='?hub.mode=subscribe&hub.verify_token=fixture&hub.challenge=demo-test';
  assert.equal(await (await req('/webhook'+challenge)).text(),'demo-test');
  assert.equal((await req('/webhook'+challenge.replace('fixture','wrong'))).status,403);
  const e=await enroll();
  assert.equal((await e.manage().then(r=>r.json())).status,'pending');
  assert.equal((await e.manage('PATCH',good)).status,409);
  assert.equal((await hook({text:e.command,signature:'00'.repeat(32)})).status,403);
  await hook({text:e.command,to:'9999'});
  await hook({text:e.command,from:'+12025550144'});
  assert.equal((await e.manage().then(r=>r.json())).status,'pending');
  await hook({text:e.command});
  assert.equal((await e.manage().then(r=>r.json())).status,'active');
  assert.equal((await e.manage('DELETE',null,'0'.repeat(64))).status,404);
  const changed={...good,times:['09:00','09:00'],timeZone:'Europe/Paris'};
  assert.deepEqual((await e.manage('PATCH',changed).then(r=>r.json())).times,['09:00']);
  delete env.WA_ACCESS_TOKEN;
  await hook({text:'STOP'});
  assert.equal((await e.manage()).status,404);
  await hook({text:e.command});
  assert.equal((await e.manage()).status,404);
});

test('a stranger cannot replace a schedule, activation expires, and deletion/expiry clear phone and alarms',async()=>{
  const {enroll,hook}=fixture();
  const owner=await enroll();
  await hook({text:owner.command});
  const other=await enroll();
  assert.equal((await other.manage().then(r=>r.json())).status,'pending');
  assert.equal((await other.manage('PATCH',good)).status,409);
  assert.equal((await other.manage('DELETE')).status,200);
  assert.equal((await owner.manage().then(r=>r.json())).status,'active');
  const waiting=await enroll();
  await waiting.store.onAlarm(Date.now()+16*60_000);
  await hook({text:waiting.command});
  assert.equal((await waiting.manage()).status,404);
  assert.equal((await owner.manage().then(r=>r.json())).status,'active');
  await owner.store.onAlarm(Date.now()+31*day);
  assert.equal(await owner.store.storage.get('state'),undefined);
  assert.equal(await owner.store.storage.get('alarm'),undefined);
  const e=await enroll();
  await hook({text:e.command});
  assert.equal((await e.manage('DELETE')).status,200);
  assert.equal(await e.store.storage.get('state'),undefined);
});

test('disabling snacks replaces the persisted alarm and only meal and water slots send on subsequent days',async t=>{
  const {enroll,hook,env}=fixture();
  const meals=['08:00','13:00','19:00'], water=['09:00','14:00'], snacks=['10:30','16:00','21:00'];
  const retained=[...meals,...water].sort(), original=[...retained,...snacks].sort();
  const localTime=(date,time)=>Date.parse(date+'T'+time+':00+03:00');
  let now=localTime('2026-11-21','07:30');
  t.mock.method(Date,'now',()=>now);
  const attempts=[];
  t.mock.method(globalThis,'fetch',async()=>{
    attempts.push(now);
    return Response.json({messages:[{id:'wamid.'+now}]});
  });
  const e=await enroll({...good,times:original});
  await hook({text:e.command});
  const fire=async (store,date,time)=>{
    now=localTime(date,time);
    // The runtime may deliver an old alarm again after the plan changes.
    await store.alarm();
    await store.alarm();
  };
  for (const time of original) await fire(e.store,'2026-11-21',time);
  assert.deepEqual(attempts,original.map(time=>localTime('2026-11-21',time)));
  attempts.length=0;
  await fire(e.store,'2026-11-22','08:00');
  await fire(e.store,'2026-11-22','09:00');
  const oldAlarm=localTime('2026-11-22','10:30');
  assert.equal(await e.store.storage.get('alarm'),oldAlarm);

  // Commit the user's edit immediately before the old snack alarm is due.
  now=oldAlarm-1;
  const response=await e.manage('PATCH',{retainTimes:retained});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).times,retained);
  assert.equal(await e.store.storage.get('alarm'),localTime('2026-11-22','13:00'));

  // A fresh instance (as after eviction) must honor the saved edit as well.
  const resumed=new ReminderStore({storage:e.store.storage},env);
  for (const time of original.filter(time=>time>='10:30')) await fire(resumed,'2026-11-22',time);
  for (const time of original) await fire(resumed,'2026-11-23',time);
  assert.deepEqual(attempts,['2026-11-22','2026-11-23'].flatMap(date=>retained.map(time=>localTime(date,time))));
});

test('a snack opt-out during a due meal preserves that meal and invalidates obsolete activation links',async t=>{
  const {enroll,hook}=fixture();
  let now=Date.parse('2026-11-21T07:59:50+03:00');
  t.mock.method(Date,'now',()=>now);
  const sender=t.mock.method(globalThis,'fetch',async()=>Response.json({messages:[{id:'wamid.breakfast'}]}));
  const e=await enroll({...good,times:['08:00','10:30','13:00']});
  await hook({text:e.command});
  const stale=await enroll({...good,times:['08:00','10:30','13:00']});
  const due=await e.store.storage.get('alarm');
  now=due;
  const response=await e.manage('PATCH',{retainTimes:['08:00','13:00']});
  assert.equal(response.status,200);
  assert.equal(await e.store.storage.get('alarm'),due);
  await e.store.alarm();
  assert.equal(sender.mock.callCount(),1);
  await hook({text:stale.command});
  assert.equal((await stale.manage()).status,404);
  assert.deepEqual((await e.manage().then(r=>r.json())).times,['08:00','13:00']);
  now=Date.parse('2026-11-21T10:30:00+03:00');
  await e.store.alarm();
  assert.equal(sender.mock.callCount(),1);

  const intentional=await enroll({...good,times:['08:00','10:30','13:00']});
  await hook({text:intentional.command});
  assert.deepEqual((await intentional.manage().then(r=>r.json())).times,['08:00','10:30','13:00']);
  assert.equal((await e.manage()).status,404);
});

test('scheduling observes local time, repeated and skipped daylight-saving hours and fractional zones',()=>{
  const slot=(timeZone,times,iso)=>new Date(nextSlot({timeZone,times},Date.parse(iso)).at).toISOString();
  assert.deepEqual(readSchedule({...good,times:['16:00','08:00','16:00']}).times,['08:00','16:00']);
  assert.equal(slot('Asia/Kathmandu',['08:00'],'2026-05-02T00:00Z'),'2026-05-02T02:15:00.000Z');
  assert.equal(slot('America/New_York',['02:15','08:00'],'2026-03-08T05:00Z'),'2026-03-08T12:00:00.000Z');
  assert.equal(slot('America/New_York',['01:30'],'2026-11-01T04:00Z'),'2026-11-01T05:30:00.000Z');
  assert.equal(slot('America/New_York',['01:30'],'2026-11-01T05:40Z'),'2026-11-02T06:30:00.000Z');
});

test('a due alarm sends exactly one approved neutral template; signed receipts distinguish accepted from delivered',async(t)=>{
  const {enroll,hook}=fixture();
  const e=await enroll();
  await hook({text:e.command});
  const due=(await e.store.storage.get('state')).active.next.at;
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,payload:JSON.parse(options.body),headers:options.headers});
    return Response.json({messages:[{id:'wamid.demo'}]});
  });
  await e.store.onAlarm(due-1);
  assert.equal(calls.length,0);
  await e.store.onAlarm(due);await e.store.onAlarm(due);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://graph.facebook.com/v25.0/1234/messages');
  assert.deepEqual(calls[0].payload,{messaging_product:'whatsapp',to:phone.slice(1),type:'template',template:{name:'daily_reminder',language:{code:'en_US'}}});
  assert.equal((await e.manage().then(r=>r.json())).lastDelivery,'accepted');
  await hook({receipt:{recipient_id:phone.slice(1),id:'wrong-id',status:'delivered'}});
  assert.equal((await e.manage().then(r=>r.json())).lastDelivery,'accepted');
  await hook({receipt:{recipient_id:phone.slice(1),id:'wamid.demo',status:'failed'}});
  await hook({receipt:{recipient_id:phone.slice(1),id:'wamid.demo',status:'sent'}});
  assert.equal((await e.manage().then(r=>r.json())).lastDelivery,'failed');
  await hook({receipt:{recipient_id:phone.slice(1),id:'wamid.demo',status:'delivered'}});
  await hook({receipt:{recipient_id:phone.slice(1),id:'wamid.demo',status:'sent'}});
  assert.equal((await e.manage().then(r=>r.json())).lastDelivery,'delivered');
  await hook({text:'STOP'});
  await e.store.onAlarm(due+day);
  assert.equal(calls.length,1);
});

test('a missed slot does not trigger late catch-up; ambiguity does not cause duplicate dispatch',async(t)=>{
  const {enroll,hook,env}=fixture();
  const e=await enroll();await hook({text:e.command});
  const due=(await e.store.storage.get('state')).active.next.at;
  const sender=t.mock.method(globalThis,'fetch',async()=>{throw new Error('timeout');});
  await e.store.onAlarm(due+20*60_000);
  assert.equal(sender.mock.callCount(),0);
  const next=(await e.store.storage.get('state')).active.next.at;
  await e.store.onAlarm(next);await e.store.onAlarm(next);
  assert.equal(sender.mock.callCount(),1);
  assert.equal((await e.manage().then(r=>r.json())).lastDelivery,'unknown');
  assert.equal((await sendReminder(env,phone,async()=>new Response(null,{status:401}))).status,'failed');
});

test('per-number pending capacity and per-client enrollment limits prevent unbounded pending schedules',async()=>{
  const {req}=fixture();
  for (let i=0;i<6;i++) assert.equal((await req('/subscriptions','POST',good)).status,201);
  assert.equal((await req('/subscriptions','POST',good)).status,429);
  for(let i=0;i<5;i++) assert.equal((await req('/subscriptions','POST',{...good,phone:'+1202555015'+i})).status,201);
  assert.equal((await req('/subscriptions','POST',{...good,phone:'+12025550161'})).status,429);
});

test('retaining times only removes existing permissions, preserves expiry and rejects ambiguous requests',async()=>{
  const {enroll,hook}=fixture();
  const enrolled=await enroll();await hook({text:enrolled.command});
  const original=await (await enrolled.manage()).json();
  for(const payload of [{retainTimes:['25:00']},{retainTimes:'08:00'},{retainTimes:['08:00'],consent:true}]){
    assert.equal((await enrolled.manage('PATCH',payload)).status,400);
  }
  for(let i=0;i<2;i++){
    const retained=await (await enrolled.manage('PATCH',{retainTimes:['08:00','09:00']})).json();
    assert.deepEqual(retained.times,['08:00']);assert.equal(retained.expiresAt,original.expiresAt);
  }
  const closed=await (await enrolled.manage('PATCH',{retainTimes:[]})).json();
  assert.equal(closed.status,'cancelled');assert.equal((await enrolled.manage()).status,404);
});
test('an obsolete pending confirmation cannot turn withdrawn snack times back on',async()=>{
  const {enroll,hook}=fixture();
  const old=await enroll();
  assert.equal((await(await old.manage('PATCH',{retainTimes:['08:00','16:00']})).json()).status,'pending');
  assert.equal((await(await old.manage('PATCH',{retainTimes:['08:00']})).json()).status,'cancelled');
  await hook({text:old.command});assert.equal((await old.manage()).status,404);
});

test('automatic schedule changes retain the original expiry when all meal times move',async t=>{
  let now=Date.parse('2026-11-24T06:00:00Z');t.mock.method(Date,'now',()=>now);
  const {enroll,hook}=fixture(),e=await enroll();await hook({text:e.command});
  const original=await (await e.manage()).json(); now+=day;
  const changed=await (await e.manage('PATCH',{...good,times:['09:00','14:00','19:00'],renew:false})).json();
  assert.deepEqual(changed.times,['09:00','14:00','19:00']);assert.equal(changed.expiresAt,original.expiresAt);
});
