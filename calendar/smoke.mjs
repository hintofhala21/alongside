// Publish only a short-lived synthetic schedule and always revoke it, even on a failed assertion.
import assert from 'node:assert/strict';
import {feedId} from './worker.mjs';

const endpoint='https://alongside-calendar.alongside-waicy-demo.workers.dev';
const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const url=endpoint+'/v1/plans/'+await feedId(key);
const headers={'Origin':'https://hintofhala21.github.io','Authorization':'Bearer '+key,'Content-Type':'application/json'};
const plan={discreet:true,timeZone:'Asia/Riyadh',slots:[{id:'breakfast',time:'08:00'},{id:'lunch',time:'12:30'}]};
async function request(method,read=false,extra={}) {
  try {return await fetch(url+(read?'.ics':''),{method,signal:AbortSignal.timeout(15000),
    headers:read?{}:{...headers,...extra},body:method==='PUT'?JSON.stringify(plan):undefined});}
  catch {throw Error('Calendar network request failed');}
}
let attempted=false;
try {
  assert.equal((await request('GET',true)).status,404,'unshared calendar');
  attempted=true;
  assert.equal((await request('PUT',false,{'If-None-Match':'*'})).status,200,'creation');
  const before=await request('GET',true);assert.equal(before.status,200,'calendar download');
  const a=await before.text();
  assert.ok(a.includes('T050000Z') && a.includes('SUMMARY:Reminder'),'discreet breakfast');
  plan.slots[0].time='09:00';plan.discreet=false;
  assert.equal((await request('PUT')).status,200,'sync');
  const after=await request('GET',true);const b=await after.text();
  assert.ok(b.includes('T060000Z') && b.includes('SUMMARY:Breakfast'),'new breakfast time/label');
  assert.ok(a.match(/UID:[^\r]+/)[0]===b.match(/UID:[^\r]+/)[0],'event identity');
} finally {
  if(attempted){
    assert.equal((await request('DELETE')).status,204,'revocation');
    assert.equal((await request('GET',true)).status,404,'access after revocation');
  }
}
console.log('Live calendar verified: create, fetch, update, stable events, revoke and denied access after revocation.');
