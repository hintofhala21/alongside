import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../site/assets/kids-chat.js',import.meta.url),'utf8');
const sandbox={};
runInNewContext(source,sandbox);
const {respond}=sandbox.AlongsideKidsChat;
const options={answers:{assessment:{text:'Approved summary',sources:['nhs']}},translateText:t=>t};
function model(answer,calls){
  return {clone:async()=>({prompt:async data=>{calls.push(JSON.parse(data));return JSON.stringify(answer);},destroy(){}})};
}
test('kids can ask an original question and follow up in memory without network or browser storage',async()=>{
  const calls=[],messages=[{role:'user',text:'My dragon is called Pip.'}];
  const models={writer:model({route:'chat',reply:'Pip can be the conductor of a cloud train.',topic:'none'},calls),review:model('safe',calls)};
  const r=await respond(models,options,messages,'Give him a funny job.');
  assert.match(r.text,/Pip/);assert.deepEqual(calls[0].recent,messages);assert.equal(calls[1].proposed,r.text);
  assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
});
test('kids medical and urgent routes discard generated instructions',async()=>{
  for(const route of ['health','urgent']){
    const r=await respond({writer:model({route,reply:'unreviewed',topic:'assessment'},[])},options,[],'test');
    assert.doesNotMatch(r.text,/unreviewed/);
    if(route==='health')assert.equal(r.text,'Approved summary');else assert.equal(r.action,'human');
  }
});
test('a rejected or malformed second opinion cannot release a draft',async()=>{
  for(const verdict of ['trusted','urgent','health','invalid']){
    const r=await respond({writer:model({route:'chat',reply:'discard this draft'},[]),review:model(verdict,[])},options,[],'test');
    assert.doesNotMatch(r.text,/discard this draft/);assert.equal(r.action,'human');
  }
});
