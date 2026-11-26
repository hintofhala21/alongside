import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../site/assets/whatsapp.js',import.meta.url),'utf8');
function setup(){
  const context={URL,AbortSignal,location:{origin:'https://alongside.example'}};
  runInNewContext(source,context);
  const nodes=new Map(), data=new Map(), requests=[];
  const doc={documentElement:{lang:'en'},getElementById(id){
    if(!nodes.has(id))nodes.set(id,{
      value:'',checked:false,listeners:{},hidden:false,
      addEventListener(k,fn){this.listeners[k]=fn;},
      removeAttribute(k){delete this[k];},
      reportValidity(){},setCustomValidity(value){this.error=value;}
    });
    return nodes.get(id);
  }};
  const person={id:'test-profile',allowed:true}, plan={timeZone:'Asia/Riyadh',slots:[{id:'breakfast',time:'08:00'},{id:'checkin',time:'19:00'}]};
  let enabled=true,remote=null,failStop=false;
  const controller=context.AlongsideWhatsApp.mount({document:doc,storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    canConnect:()=>person.allowed,getProfileId:()=>person.id,getPlan:()=>plan,fetcher:async(url,options)=>{
      requests.push({url,...options});const path=new URL(url).pathname.replace(/^\/reminders/,'');
      if(path==='/status')return Response.json({available:enabled});
      const body=options.body && JSON.parse(options.body);
      if(options.method==='POST'){
        remote={status:'pending',id:'test-id',...body};
        return Response.json({status:'pending',id:'test-id',token:'local-test',activationUrl:'https://wa.me/12025550102?text=START%20example'});
      }
      assert.equal(options.headers.Authorization,'Bearer local-test');
      if(!remote)return new Response(null,{status:404});
      if(options.method==='DELETE'){
        if(failStop)return new Response(null,{status:503});
        remote=null;return new Response(null,{status:204});
      }
      if(options.method==='PATCH' && body.retainTimes) {
        if(failStop)return new Response(null,{status:503});
        const retained=remote.times.filter(t=>body.retainTimes.includes(t));
        if(!retained.length || (remote.status==='pending' && retained.length!==remote.times.length)){
          remote=null;return Response.json({status:'cancelled'});
        }
        remote.times=retained;
      }else if(options.method==='PATCH')Object.assign(remote,body);
      return Response.json(remote);
    }
  });
  const el=id=>doc.getElementById('whatsapp-'+id);
  const connect=async()=>{
    el('number').value='+1 (202) 555-0146';el('consent').checked=true;
    await el('form').listeners.submit({preventDefault(){}});
  };
  return {person,controller,el,plan,data,requests,connect,get remote(){return remote;},offline:()=>enabled=false,badStop:()=>failStop=true};
}
test('phone and plan leave the browser only after permission and service readiness',async()=>{
  const ui=setup();assert.equal(ui.requests.length,0);
  await ui.controller.refresh();assert.equal(ui.requests.length,1);
  ui.el('number').value='+12025550146';
  await ui.el('form').listeners.submit({preventDefault(){}});
  assert.equal(ui.requests.length,1);assert.equal(ui.el('activate').hidden,true);
  await ui.connect();
  assert.equal(ui.remote.status,'pending');assert.equal(ui.el('activate').hidden,false);
  assert.deepEqual(JSON.parse(ui.requests[1].body),{timeZone:'Asia/Riyadh',times:['08:00'],phone:'+12025550146',consent:true});
  assert.equal([...ui.data.values()].join('').includes('5550146'),false);
});
test('unavailable service and under-13 profiles do not submit a number',async()=>{
  const ui=setup();ui.offline();await ui.controller.refresh(true);await ui.connect();
  assert.equal(ui.el('enrol').hidden,true);assert.equal(ui.remote,null);
  const child=setup();child.person.allowed=false;await child.controller.refresh(true);await child.connect();
  assert.equal(child.requests.length,0);assert.equal(child.el('enrol').hidden,true);
});
test('confirmed connection reflects changed times, explicit updates, delivery receipts and successful cancellation',async()=>{
  const ui=setup();await ui.controller.refresh();await ui.connect();
  ui.remote.status='active';ui.remote.lastDelivery='delivered';
  await ui.controller.refresh(true);
  assert.match(ui.el('delivery').textContent,/delivered/);assert.equal(ui.el('activate').hidden,true);
  ui.plan.slots[0].time='09:00';ui.controller.render();assert.match(ui.el('status').textContent,/times have changed/);
  assert.equal(ui.remote.times[0],'08:00');
  await ui.el('update').listeners.click();assert.equal(ui.remote.times[0],'09:00');
  assert.ok(await ui.controller.disconnect());assert.equal(ui.remote,null);assert.equal(ui.data.size,0);
});
test('failed revocation preserves the connection so users can retry',async()=>{
  const ui=setup();await ui.controller.refresh();await ui.connect();
  ui.badStop();assert.equal(await ui.controller.disconnect(),false);assert.equal(ui.data.size,1);assert.equal(ui.el('stop').hidden,false);
});
test('Breeze reminder requests open settings without subscribing or swallowing unrelated questions',async()=>{
  const script=await readFile(new URL('../site/assets/chat.js',import.meta.url),'utf8');
  const start=script.indexOf('  function requestsReminderSettings('), end=script.indexOf('  const cleanMessage',start);
  const recognizes=runInNewContext(script.slice(start,end)+';requestsReminderSettings;');
  const label='Set up reminders';
  for(const phrase of ['Can you add my plan to my calendar?', 'Connect WhatsApp', 'Remind me to drink water','Set up reminders']){
    assert.equal(recognizes(phrase,label),true);
  }
  assert.equal(recognizes('Remind me what fainting means.',label),false);
  assert.equal(recognizes('I have chest pain and want to ask about reminders.',label),false);
  const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
  assert.match(html,/<a href="#reminders">/);
  assert.doesNotMatch(html,/<input id="whatsapp-consent"[^>]*checked/);
});

test('removing snacks preserves shared meal times and waits for WhatsApp before saving locally',async()=>{
  const script=await readFile(new URL('../site/assets/app.js',import.meta.url),'utf8');
  function source(a,b){return script.slice(script.indexOf(a),script.indexOf(b,script.indexOf(a)+a.length));}
  const data={settings:{snacks:true,water:false,discreet:true},times:{morning:'08:00',dinner:'20:00'}};
  const calls=[];let answer,ready;
  const ui={data,profile:{id:'test'},record:()=>data,zone:()=>'Asia/Riyadh',editingReminders:false,
    whatsappController:{reconcileSavedPlan:slots=>{calls.push(Array.from(slots,s=>s.time));return new Promise(resolve=>{answer=resolve;});},render(){}},
    persist:()=>{ready=true;return true;},calendarController:{refresh:async()=>true,isConnected:()=>true}};
  const save=runInNewContext(source('const mealSlots =','const byId =')+source('function activeEatingSlots(', 'function formatTime(')+source('function withinWaterWindow(', 'function renderReminders(')+source('function reminderPlan(', 'function syncReminderPlan(')+';saveReminderChange;',ui);
  const status={};const first=save({settings:{...data.settings,snacks:false}},status);
  assert.equal(data.settings.snacks,true);assert.equal(ready,undefined);
  assert.deepEqual(calls[0],['08:00','12:30','20:00','20:00']);
  answer(false);assert.equal(await first,false);assert.equal(data.settings.snacks,true);assert.match(status.textContent,/STOP/);
  const second=save({settings:{...data.settings,snacks:false}},status);
  answer(true);assert.equal(await second,true);assert.equal(data.settings.snacks,false);assert.equal(ready,true);
  assert.match(status.textContent,/calendar app/);
  ui.calendarController.refresh=async()=>false;
  const third=save({times:{...data.times,dinner:'18:00'}},status);
  answer(true);assert.equal(await third,true);assert.match(status.textContent,/feed could not update/);
});

test('WhatsApp browser controller narrows active schedules, clears stale pending links and retains control on a network failure',async()=>{
  for(const variant of ['pending','active','unconfirmed']){
    const ui=setup();
    ui.plan.slots.push({id:'morning',time:'10:30'},{id:'lunch',time:'12:30'});
    await ui.controller.refresh();await ui.connect();
    if(variant!=='pending'){ui.remote.status='active';await ui.controller.refresh(true);}
    if(variant==='unconfirmed')ui.badStop();
    ui.plan.slots=ui.plan.slots.filter(slot=>slot.id!=='morning');
    assert.equal(await ui.controller.retainSchedule(ui.plan.slots),variant!=='unconfirmed');
    assert.deepEqual(JSON.parse(ui.requests.at(-1).body),{retainTimes:['08:00','12:30']});
    if(variant==='pending'){assert.equal(ui.remote,null);assert.equal(ui.el('activate').hidden,true);}
    if(variant==='active'){assert.deepEqual(ui.remote.times,['08:00','12:30']);assert.equal(ui.el('stop').hidden,false);}
    if(variant==='unconfirmed'){assert.equal(ui.data.size,1);assert.ok(ui.remote.times.includes('10:30'));assert.match(ui.el('status').textContent,/STOP/);}
  }
});

test('a confirmed opt-in follows all saved times and snack changes without renewal or another profile receiving them',async()=>{
  const ui=setup();await ui.controller.refresh();await ui.connect();
  ui.remote.status='active';await ui.controller.refresh(true);
  ui.plan.timeZone='Europe/Paris';
  ui.plan.slots=[{id:'breakfast',time:'09:00'},{id:'lunch',time:'14:00'},{id:'morning',time:'11:00'}];
  assert.ok(await ui.controller.reconcileSavedPlan(ui.plan.slots));
  assert.deepEqual(ui.remote.times,['09:00','11:00','14:00']);assert.equal(ui.remote.timeZone,'Europe/Paris');
  assert.equal(ui.remote.renew,false);
  ui.plan.slots.splice(2,1);
  assert.ok(await ui.controller.reconcileSavedPlan(ui.plan.slots));assert.deepEqual(ui.remote.times,['09:00','14:00']);
  ui.person.id='a-different-profile';const count=ui.requests.length;
  assert.ok(await ui.controller.reconcileSavedPlan([{id:'breakfast',time:'07:00'}]));assert.equal(ui.requests.length,count);
});
