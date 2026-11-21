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

test('a requested text goes through the same safety review before display',async()=>{
  const calls=[];
  const models={writer:model({route:'chat',textToSend:'Could we talk about my day?',topic:'none'},calls),review:model('safe',calls)};
  const reply=await respond(models,options,[],'What could I text my sister?');
  assert.equal(reply.text,'Could we talk about my day?');
  assert.equal(calls[1].proposed,reply.text);
});

test('meal-photo distress keeps a listening response even if flagged as an unanswered medical question',async()=>{
  const message='I wanted my lunch, but seeing those pictures made me feel sick.';
  for(const models of [
    {writer:model({route:'health',topic:'none',reply:''},[])},
    {writer:model({route:'chat',topic:'none',reply:'draft'},[]),review:model('health',[])},
    {writer:model({route:'mealPhotos',topic:'none',reply:''},[])}
  ])assert.match((await respond(models,options,[],message)).text,/pictures made eating feel hard/);
  const urgent=await respond({writer:model({route:'urgent'},[])},options,[],message);
  assert.match(urgent.text,/emergency services/);
  const factual=await respond({writer:model({route:'health',topic:'none'},[])},options,[],'Could meal photos make me feel sick?');
  assert.match(factual.text,/library/);
});

test('a standalone ARFID definition returns the cited approved entry',async()=>{
  const entry={text:'Reviewed ARFID definition',sources:['nimh']};
  const settings={...options,answers:{arfid:entry}};
  for(const question of ['What is ARFID?', 'What does ARFID stand for?', 'Define ARFID.']){
    const reply=await respond({},settings,[],question);
    assert.equal(reply.text,entry.text);assert.deepEqual(reply.sources,entry.sources);
  }
});

test('an incorrect photo classification is retried for a texture note; assistant guesses are not evidence',async()=>{
  const calls=[];let drafts=0;
  const writer={clone:async()=>({prompt:async()=>JSON.stringify(++drafts===1?
    {route:'mealPhotos'}:{route:'chat',textToSend:'The texture made lunch hard for me.'}),destroy(){}})};
  const history=[{role:'user',text:'The texture made lunch hard for me.'},{role:'assistant',text:'Did you mean photos?'}];
  const r=await respond({writer,review:model('safe',calls)},options,history,'Help me write a note.');
  assert.equal(r.text,'The texture made lunch hard for me.');assert.equal(drafts,2);assert.equal(calls.length,1);
});

test('two ungrounded photo drafts cannot appear as a response',async()=>{
  const writer=model({route:'chat',textToSend:'Those pictures upset me.'},[]);
  const r=await respond({writer},options,[{role:'assistant',text:'pictures'}],'Help me write a note about texture.');
  assert.doesNotMatch(r.text,/picture/i);
});

test('a check-in uses the visitor’s wording even after a wrong topic choice',async()=>{
  const history=[{role:'user',text:'I wanted to eat lunch today, but the texture made it hard.'}];
  const models={writer:model({route:'mealPhotos'},[])};
  const r=await respond(models,options,history,'Help me write a check-in for my dietitian.');
  assert.equal(r.text,history[0].text);
  const danger=await respond({writer:model({route:'urgent'},[])},options,history,'Help me write a note.');
  assert.match(danger.text,/emergency/);
});
