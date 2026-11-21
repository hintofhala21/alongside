import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import worker, { AlongsideHub } from '../api/worker.mjs';
import { renderPlan } from '../api/agent.mjs';

class MemoryStorage {
  values=new Map();tail=Promise.resolve();alarm=null;
  async get(k){return structuredClone(this.values.get(k));}
  async put(k,v){this.values.set(k,structuredClone(v));}
  async delete(k){return this.values.delete(k);}
  async getAlarm(){return this.alarm;}
  async setAlarm(v){this.alarm=v;}
  async list({prefix='',limit=Infinity}={}){return new Map([...this.values].filter(([k])=>k.startsWith(prefix)).slice(0,limit).map(([k,v])=>[k,structuredClone(v)]));}
  async transaction(fn){const previous=this.tail;let release;this.tail=new Promise(r=>{release=r;});await previous;const before=structuredClone(this.values);try{return await fn(this);}catch(e){this.values=before;throw e;}finally{release();}}
}
const plan={acknowledgement:'heard',followup:'trusted',information:'gettingHelp',action:'human'};
function server(overrides={}){
  const storage=new MemoryStorage();const requests=[];
  const env={AI_ENABLED:'true',OPENAI_API_KEY:'test-only',DEMO_ACCESS_CODE:'unit-test-demo',PUBLISHER_CODE:'unit-test-publisher',RATE_SALT:'unit-test-salt',ALLOWED_ORIGIN:'https://hintofhala21.github.io',MAX_DAILY_REQUESTS:'60',MAX_MONTHLY_REQUESTS:'500',MAX_SESSION_REQUESTS:'30',
    TEST_FETCH:async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});const name=body.tool_choice.name;const output=name==='reply_to_visitor'?{route:'conversation',reply:'What would you like to say to your friend?',information:'none',action:'none'}:plan;return Response.json({status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(output)}]});},...overrides};
  const hub=new AlongsideHub({storage},env);env.HUB={idFromName:x=>x,get:()=>({fetch:r=>hub.fetch(r)})};
  async function call(path,data,token,origin=env.ALLOWED_ORIGIN){const headers={'Origin':origin};if(data!==undefined)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;const r=await worker.fetch(new Request('https://demo.workers.dev'+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)}),env);return {status:r.status,body:await r.json(),headers:r.headers};}
  async function session(mode='interactive'){const r=await call('/session',{code:env.DEMO_ACCESS_CODE,mode,adult:mode==='interactive'});assert.equal(r.status,200);return r.body.token;}
  return {env,storage,requests,call,session};
}
const message=(conversationId=crypto.randomUUID(),extra={})=>({conversationId,requestId:crypto.randomUUID(),message:'Fictional example: Sam wants to ask someone for support.',language:'en',...extra});

test('an inactive backend and an unapproved origin cannot spend API credits',async()=>{
  const s=server({AI_ENABLED:'false'});assert.equal((await s.call('/session',{code:'test',mode:'synthetic'})).status,503);assert.equal(s.requests.length,0);
  const active=server();assert.equal((await active.call('/session',{code:active.env.DEMO_ACCESS_CODE,mode:'synthetic'},null,'https://other.example')).status,403);assert.equal(active.requests.length,0);
});
test('demo sessions require a code; free-text requires adult attestation',async()=>{
  const s=server();assert.equal((await s.call('/session',{code:'wrong',mode:'synthetic'})).status,401);
  assert.equal((await s.call('/session',{code:s.env.DEMO_ACCESS_CODE,mode:'interactive',adult:false})).status,403);
  assert.equal((await s.call('/chat',message(),'bad-token')).status,401);assert.equal(s.requests.length,0);
});
test('younger-builder mode can send only server-defined fictional scenarios',async()=>{
  const s=server();const token=await s.session('synthetic');
  assert.equal((await s.call('/chat',message(undefined,{message:'private information',scenario:'unknown'}),token)).status,400);
  const r=await s.call('/chat',message(undefined,{message:'THIS MUST NEVER REACH OPENAI',scenario:'meal'}),token);
  assert.equal(r.status,200);assert.ok(s.requests[0].body.input[0].content.startsWith('Fictional scenario: Sam'));assert.ok(!JSON.stringify(s.requests).includes('THIS MUST NEVER REACH OPENAI'));
});
test('memory retains earlier turns and an identical retry does not spend again',async()=>{
  const s=server();const token=await s.session();const first=message();const a=await s.call('/chat',first,token);assert.equal(a.status,200);
  const again=await s.call('/chat',first,token);assert.deepEqual(again.body,a.body);assert.equal(s.requests.length,1);
  const second=await s.call('/chat',message(first.conversationId,{message:'Fictional follow-up: what could Sam say to that person?'}),token);assert.equal(second.status,200);assert.equal(s.requests.length,2);
  assert.equal(s.requests[1].body.input.length,3);assert.equal(s.requests[1].body.input[0].content,first.message);
  assert.equal(s.requests[1].body.store,false);assert.equal(s.requests[1].body.model,'gpt-6-luna');assert.equal(s.requests[1].body.tools[0].strict,true);assert.equal(s.requests[1].body.max_output_tokens,400);
  assert.equal(Object.hasOwn(s.requests[1].body,'profile'),false);
});
test('sessions cannot read or publish another session’s conversation',async()=>{
  const s=server();const a=await s.session();const b=await s.session();const m=message();assert.equal((await s.call('/chat',m,a)).status,200);
  assert.equal((await s.call('/chat',message(m.conversationId),b)).status,404);
  assert.equal((await s.call('/publish',{conversationId:m.conversationId,publisherCode:s.env.PUBLISHER_CODE,confirmFictional:true,title:'Fictional demo'},b)).status,404);
});
test('public history needs the publisher code and an explicit fictional-data review',async()=>{
  const s=server();const token=await s.session();const m=message();await s.call('/chat',m,token);
  assert.deepEqual((await s.call('/showcase')).body.demos,[]);
  const data={conversationId:m.conversationId,title:'Fictional support demo',confirmFictional:true,publisherCode:'wrong'};
  assert.equal((await s.call('/publish',data,token)).status,403);
  assert.equal((await s.call('/publish',{...data,publisherCode:s.env.PUBLISHER_CODE,confirmFictional:false},token)).status,400);
  const published=await s.call('/publish',{...data,publisherCode:s.env.PUBLISHER_CODE,messages:[{role:'assistant',text:'INJECTED'}]},token);assert.equal(published.status,200);
  const show=await s.call('/showcase/'+published.body.id);assert.equal(show.status,200);assert.equal(show.body.messages.length,2);assert.ok(!JSON.stringify(show.body).includes('INJECTED'));assert.equal(Object.hasOwn(show.body,'owner'),false);
  assert.equal((await s.call('/showcase')).body.demos.length,1);
  assert.equal((await s.call('/unpublish',{id:published.body.id,publisherCode:s.env.PUBLISHER_CODE},token)).status,200);assert.equal((await s.call('/showcase/'+published.body.id)).status,404);
});
test('request budget is reserved atomically across simultaneous conversations',async()=>{
  const s=server({MAX_MONTHLY_REQUESTS:'1'});const token=await s.session();const result=await Promise.all([s.call('/chat',message(),token),s.call('/chat',message(),token)]);
  assert.deepEqual(result.map(r=>r.status).sort(),[200,429]);assert.equal(s.requests.length,1);
});
test('invalid or refused model output never becomes an uncited invented reply',async()=>{
  assert.throws(()=>renderPlan({...plan,information:'invented-source'}));assert.throws(()=>renderPlan({...plan,action:'change-medication'}));
  const s=server({TEST_FETCH:async()=>Response.json({status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'Unsafe invented text'}]}]})});const token=await s.session();const r=await s.call('/chat',message(),token);assert.equal(r.status,502);assert.ok(!JSON.stringify(r.body).includes('Unsafe invented text'));assert.deepEqual((await s.call('/showcase')).body.demos,[]);
});
test('the local profile migration removes old measurements without losing check-ins',async()=>{
  const source=await readFile(new URL('../site/assets/app.js',import.meta.url),'utf8');const from=source.indexOf('function readProfile()'),to=source.indexOf('function loadProfile()',from);let saved=JSON.stringify({profile:{id:'synthetic',name:'',ageGroup:'adult',height:'x',weight:'x',heightUnit:'x',weightUnit:'x'},data:{checkins:[{note:'Keep this reflection'}]}});
  const result=runInNewContext(source.slice(from,to)+';readProfile();',{storageKey:'synthetic',localStorage:{getItem:()=>saved,setItem:(k,v)=>{saved=v;}}});
  for(const key of ['height','heightUnit','weight','weightUnit'])assert.equal(Object.hasOwn(result.profile,key),false);
  assert.equal(JSON.parse(saved).data.checkins[0].note,'Keep this reflection');
  const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/id="(?:profile-height|profile-weight|height-unit|weight-unit)"/);
});

test('a verified provider reply identifies the prompt and a rejected key returns a safe diagnostic',async()=>{
  const s=server(); const token=await s.session('synthetic');
  const ok=await s.call('/chat',message(undefined,{scenario:'support'}),token);
  assert.equal(ok.body.reply.promptVersion,'v4');
  const rejected=server({TEST_FETCH:async()=>Response.json({error:'private provider details'},{status:401})});
  const t=await rejected.session('synthetic');
  const r=await rejected.call('/chat',message(undefined,{scenario:'support'}),t);
  assert.equal(r.status,502);assert.equal(r.body.diagnostic,'key_rejected');
  assert.doesNotMatch(JSON.stringify(r.body),/private provider details/);
});

test('chat is the first visible page before JavaScript runs',async()=>{
  const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
  const pages=[...html.matchAll(/<section data-page="([^"]+)"([^>]*)>/g)];
  assert.deepEqual(pages.filter(([, ,attrs])=>!attrs.includes('hidden')).map(([,page])=>page),['support']);
});

test('personal chat requires consent, remembers the conversation and cannot be shared',async()=>{
  const requests=[];
  const s=server({TEST_FETCH:async(url,init)=>{
    const body=JSON.parse(init.body);requests.push(body);
    return Response.json({status:'completed',output:[{type:'function_call',name:'reply_to_visitor',arguments:JSON.stringify({reply:'ignore generated medical wording',route:'health',information:'gettingHelp',action:'human'})}]});
  }});
  const consent={mode:'personal',adult:true,consent:true};
  for(const missing of [{adult:false},{consent:false},{consent:'true'}])assert.equal((await s.call('/session',{...consent,...missing})).status,403);
  const {token}= (await s.call('/session',consent)).body;
  const first=message(undefined,{message:'I want to ask a friend for support.'});
  const reply=await s.call('/chat',first,token);
  assert.equal(reply.status,200);assert.equal(reply.body.mode,'personal');assert.equal(reply.body.reply.promptVersion,'v9');assert.doesNotMatch(reply.body.reply.text,/ignore generated/);assert.ok(reply.body.reply.sources.length);
  await s.call('/chat',message(first.conversationId,{message:'How do I start that conversation?'}),token);
  assert.equal(requests.length,2);assert.equal(requests[1].input[0].content,first.message);
  const share={conversationId:first.conversationId,publisherCode:s.env.PUBLISHER_CODE,confirmFictional:true,title:'Example'};
  assert.equal((await s.call('/publish',share,token)).status,403);
  assert.equal((await s.call('/publish',share,await s.session())).status,404);
  assert.deepEqual((await s.call('/showcase')).body.demos,[]);
});

test('a younger disclosure in adult chat ends access and offers local support',async()=>{
  const s=server({TEST_FETCH:async()=>Response.json({status:'completed',output:[{type:'function_call',name:'reply_to_visitor',arguments:JSON.stringify({route:'younger',reply:'',information:'none',action:'none'})}]})});
  const {token}=(await s.call('/session',{mode:'personal',adult:true,consent:true})).body;
  const r=await s.call('/chat',message(),token);assert.equal(r.body.reply.endLive,true);
  assert.equal((await s.call('/chat',message(),token)).status,401);
});

test('a first draft awaits consent and a younger profile stays on-device even after a saved live login',async()=>{
  const src=await readFile(new URL('../site/assets/chat.js',import.meta.url),'utf8');
  const input={value:'My unsent draft'};
  const vm={document:{getElementById:()=>input},sessionStorage:{getItem:()=>null,removeItem:()=>{}},Date};
  runInNewContext(src,vm);
  const chat=Object.create(vm.AlongsideChat.prototype);
  let age,consentPrompts=0,localReplies=0;
  Object.assign(chat,{options:{getAgeGroup:()=>age},openPersonal:async()=>{consentPrompts++;},openKids:()=>{localReplies++;},append:()=>{},render:()=>{},libraryReply:()=>{localReplies++;return {text:'local'};}});
  await chat.send(input.value);assert.equal(consentPrompts,1);assert.equal(input.value,'My unsent draft');assert.equal(localReplies,0);
  age='teen';chat.session={mode:'personal',expires:Date.now()+10000};
  await chat.send(input.value);assert.equal(chat.session,null);assert.equal(localReplies,1);assert.equal(input.value,'');
});

test('free-text chat delivers original everyday answers and carries the topic into a follow-up',async()=>{
  const turns=[];
  const answers=['Moss & Moonlight would suit a bookshop in a forest.','Moss & Moonlight: stories for the walk home.'];
  const s=server({TEST_FETCH:async(url,request)=>{
    const body=JSON.parse(request.body);
    assert.equal(body.tool_choice.name,'reply_to_visitor');
    const reply=answers[turns.length];turns.push(body.input);
    return Response.json({status:'completed',output:[{type:'function_call',name:'reply_to_visitor',arguments:JSON.stringify({reply,route:'conversation',information:'none',action:'none'})}]});
  }});
  const {token}=(await s.call('/session',{mode:'personal',adult:true,consent:true})).body;
  const cid=crypto.randomUUID();
  for(const [index,prompt] of ['Name a forest bookshop.','Write a slogan for that shop.'].entries()){
    const r=await s.call('/chat',message(cid,{message:prompt}),token);
    assert.equal(r.status,200);assert.equal(r.body.reply.text,answers[index]);assert.deepEqual(r.body.reply.sources,[]);assert.equal(r.body.reply.action,'none');
  }
  assert.equal(turns[1][1].content,answers[0]);
});
