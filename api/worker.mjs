import {searchPlaces} from './places.mjs';
import mealTerms from '../shared/meal-terms.json' with {type:'json'};
import { accountAllowed } from './account.mjs';
import publicConfig from '../site/config.json' with { type: 'json' };
import { supportedLanguage } from '../shared/languages.mjs';
import { runAgent, scenarios, starters } from './agent.mjs';

const DAY=86400000;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const messageLimit=800;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
async function sameSecret(a,b) {if(typeof a!=='string'||typeof b!=='string'||!b)return false;const x=await hash(a),y=await hash(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
function token() {return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
async function body(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('Use a JSON request.',415);
  const reader=request.body?.getReader();if(!reader)fail('Missing request body.');let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();fail('Request is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try {const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||Array.isArray(value)||typeof value!=='object')fail('Invalid request.');return value;}catch{fail('Invalid JSON.');}
}
const cap=(value,fallback,max)=>{const n=Number(value);return Number.isInteger(n)&&n>0?Math.min(n,max):fallback;};
export class AlongsideHub {
  constructor(ctx,env){this.ctx=ctx;this.storage=ctx.storage;this.env=env;}
  async counter(keys) {
    await this.storage.transaction(async txn=>{
      const entries=[];for(const [key,limit,expires] of keys){const value=await txn.get(key)||{count:0,expires};if(value.count>=limit)fail('The chat limit has been reached. Please try later.',429);entries.push([key,{...value,count:value.count+1}]);}
      for(const [key,value]of entries)await txn.put(key,value);
    });
  }
  async session(request) {
    const raw=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!raw||!/^[-_A-Za-z0-9]{43}$/.test(raw))fail('Connect to Breeze first.',401);
    const key=await hash(this.env.RATE_SALT+':'+raw);const session=await this.storage.get('session:'+key);if(!session||session.expires<Date.now())fail('Your chat session has ended. Reconnect to continue.',401);return {key,...session};
  }
  async fetch(request) {
    try {
      if(!await this.storage.getAlarm())await this.storage.setAlarm(Date.now()+3600000);
      const path=new URL(request.url).pathname;const now=Date.now();const today=new Date(now).toISOString().slice(0,10);const month=today.slice(0,7);
      if(request.method==='GET'&&path==='/showcase') {
        const entries=await this.storage.list({prefix:'share:',limit:100});return json({demos:[...entries.values()].filter(s=>s.expires>now).map(s=>({id:s.id,title:s.title,created:s.created,expires:s.expires,mode:'luna'}))});
      }
      if(request.method==='GET'&&path.startsWith('/showcase/')) {
        const id=path.slice('/showcase/'.length);if(!uuid.test(id))fail('Demo not found.',404);const share=await this.storage.get('share:'+id);if(!share||share.expires<now)fail('This demo is unavailable or has expired.',404);return json(share);
      }
      if(request.method!=='POST')fail('Not found.',404);
      const data=await body(request);
      if(path==='/places'){
        if(!this.env.GOOGLE_PLACES_API_KEY)fail('Live Google Places search is not configured.',503);
        await this.counter([['places:'+today,100,now+DAY]]);
        try{return json({places:await searchPlaces(data,this.env.GOOGLE_PLACES_API_KEY,this.env.TEST_FETCH||fetch)});}
        catch(error){fail(error.status?error.message:'Google Places is unavailable. Try again later.',error.status||502);}
      }
      if(path==='/session') {
        const ip=request.headers.get('X-Demo-Client')||'unknown';await this.counter([['login:'+ip+':'+today,20,now+DAY],['login-total:'+today,500,now+DAY]]);
        if(data.mode!=='guided' && !await accountAllowed(request,publicConfig.firebase))fail('Sign in to Alongside first.',401);
        if(data.mode==='guided') {
          if(!['child','teen'].includes(data.ageGroup))fail('Select your age group in your profile.');
        } else if(data.mode==='personal') {
          if(data.ageGroup && data.ageGroup!=='adult')fail('Choose a prepared question in Breeze.',403);
          if(data.adult!==true || data.consent!==true) fail('Live chat requires adult confirmation and permission to send chat messages.',403);
        } else {
          if(!await sameSecret(data.code,this.env.DEMO_ACCESS_CODE))fail('That competition access code is not correct.',401);
          if(!['synthetic','interactive'].includes(data.mode))fail('Choose a testing mode.');
          if(data.mode==='interactive'&&data.adult!==true)fail('Free-text testing is for adult judges using fictional details.',403);
        }
        const raw=token();const session={mode:data.mode,ageGroup:data.mode==='guided'?data.ageGroup:'adult',expires:now+DAY};await this.storage.put('session:'+await hash(this.env.RATE_SALT+':'+raw),session);return json({token:raw,...session});
      }
      const session=await this.session(request);
      if(path==='/chat') {
        if(!uuid.test(data.conversationId)||!uuid.test(data.requestId))fail('Invalid conversation.');
        const guided=session.mode==='guided';
        const mealRequest=guided && data.scenario==='mealIdeas';
        let message;
        if(mealRequest){
          if(Object.hasOwn(data,'message') || !Array.isArray(data.ingredients) || data.ingredients.length>16 ||
            !data.ingredients.every(x=>mealTerms.includes(x)) || !['suggest','another'].includes(data.choice))fail('Choose recognized food preferences.');
          message=(data.choice==='another'?'Suggest different meal ideas, keeping earlier preferences.':'Suggest meal ideas.')+
            (data.ingredients.length?' Requested ingredients or preferences: '+data.ingredients.join(', ')+'.':'');
        }else{
          if(guided && data.scenario !== undefined && (Object.hasOwn(data,'message') || !Object.hasOwn(starters,data.scenario)))fail('Choose a prepared question.');
          message=guided && data.scenario !== undefined?starters[data.scenario]:session.mode==='synthetic'?scenarios[data.scenario]:data.message;
        }
        if(typeof message!=='string'||!message.trim()||message.length>messageLimit)fail('Use a message of up to 800 characters.');
        if(session.mode==='synthetic'&&!Object.hasOwn(scenarios,data.scenario))fail('Choose a fictional scenario.');
        const conversationKey='conversation:'+data.conversationId;let conversation=await this.storage.get(conversationKey);
        if(conversation&&conversation.owner!==session.key)fail('Conversation not found.',404);
        const requestKey='request:'+session.key+':'+data.requestId;const previous=await this.storage.get(requestKey);if(previous?.reply)return json(previous.reply);if(previous)fail('That request is still being processed.',409);
        const lock='busy:'+data.conversationId;
        await this.storage.transaction(async txn=>{const busy=await txn.get(lock);if(busy?.expires>now)fail('Wait for the current reply before sending another message.',409);await txn.put(lock,{expires:now+30000});await txn.put(requestKey,{expires:now+DAY});});
        try {
          await this.counter([['budget-month:'+month,cap(this.env.MAX_MONTHLY_REQUESTS,500,1000),now+35*DAY],['budget-day:'+today,cap(this.env.MAX_DAILY_REQUESTS,60,100),now+2*DAY],['budget-session:'+session.key,cap(this.env.MAX_SESSION_REQUESTS,30,50),session.expires]]);
          conversation ||= {id:data.conversationId,owner:session.key,mode:session.mode,title:message.slice(0,58),created:new Date(now).toISOString(),messages:[],expires:session.expires};
          const user={role:'user',text:message,id:crypto.randomUUID(),created:new Date(now).toISOString()};
          const reply=await runAgent([...conversation.messages,user],this.env,supportedLanguage(data.language),this.env.TEST_FETCH||fetch,session.mode,session.ageGroup);
          const mode=(guided || session.mode==='personal')?'personal':'luna';
          const assistant={...reply,role:'assistant',mode,id:crypto.randomUUID(),created:new Date().toISOString()};
          conversation.messages.push(user,assistant);conversation.messages=conversation.messages.slice(-40);
          const result={reply:assistant,conversationId:conversation.id,mode};
          await this.storage.transaction(async txn=>{if(reply.endLive)await txn.delete('session:'+session.key);await txn.put(conversationKey,conversation);await txn.put(requestKey,{reply:result,expires:session.expires});});return json(result);
        } finally {await this.storage.delete(lock);}
      }
      if(['guided','personal'].includes(session.mode) && ['/publish','/unpublish'].includes(path))fail('Personal chats are private.',403);
      if(path==='/publish') {
        if(!await sameSecret(data.publisherCode,this.env.PUBLISHER_CODE))fail('A publisher code is needed to select a demo for judges.',403);
        if(data.confirmFictional!==true)fail('Review the conversation and confirm that it contains fictional details only.');
        if(!uuid.test(data.conversationId))fail('Conversation not found.',404);const c=await this.storage.get('conversation:'+data.conversationId);if(!c||c.owner!==session.key||c.expires<now)fail('This demo session is unavailable. Run a new demo first.',404);
        if(['guided','personal'].includes(c.mode))fail('Personal chats are private.',403);
        if(!c.messages.some(m=>m.mode==='luna'))fail('Only a completed Breeze demo can be published.');
        const title=typeof data.title==='string'?data.title.trim().slice(0,80):'Competition demo';if(!title)fail('Add a title.');
        if(/@|https?:\/\/|\+?\d[\d\s().-]{7,}/.test(title))fail('Use a title without contact details.');
        const shares=await this.storage.list({prefix:'share:',limit:100});if(shares.size>=30)fail('The showcase is full. Remove an old demo first.',429);
        const share={id:crypto.randomUUID(),title,created:new Date(now).toISOString(),expires:now+7*DAY,messages:c.messages,mode:'luna'};
        await this.storage.put('share:'+share.id,share);return json({id:share.id,expires:share.expires});
      }
      if(path==='/unpublish') {
        if(!await sameSecret(data.publisherCode,this.env.PUBLISHER_CODE))fail('Publisher code required.',403);if(!uuid.test(data.id))fail('Demo not found.',404);await this.storage.delete('share:'+data.id);return json({removed:true});
      }
      fail('Not found.',404);
    }catch(e){return json({error:e.status?e.message:'The AI demo could not respond. Please try again later.',diagnostic:e.diagnostic},e.status||502);}
  }
  async alarm(){const now=Date.now();for(const [key,value]of await this.storage.list()){if(value?.expires&&value.expires<now)await this.storage.delete(key);}await this.storage.setAlarm(now+3600000);}
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);const origin=request.headers.get('Origin');const localChat=['http://127.0.0.1:4173','http://127.0.0.1:4174'].includes(origin)
      && ['/session','/chat'].includes(url.pathname);
    const allowed=Boolean(origin) && (origin===env.ALLOWED_ORIGIN || localChat);
    const cors=allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{};
    const finish=response=>{const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);return new Response(response.body,{status:response.status,headers});};
    if(url.pathname==='/status'&&request.method==='GET')return finish(json({placesReady:Boolean(env.GOOGLE_PLACES_API_KEY&&env.HUB),ready:env.AI_ENABLED==='true'&&Boolean(env.OPENAI_API_KEY&&env.DEMO_ACCESS_CODE&&env.PUBLISHER_CODE&&env.RATE_SALT&&env.HUB),mode:'adult-support-and-competition-demo'}));
    if(!allowed)return json({error:'This website origin is not permitted.'},403);
    if(request.method==='OPTIONS')return finish(new Response(null,{status:204}));
    if(!['GET','POST'].includes(request.method))return finish(json({error:'Method not allowed.'},405));
    if(url.pathname!=='/places' && (env.AI_ENABLED!=='true'||!env.OPENAI_API_KEY||!env.DEMO_ACCESS_CODE||!env.PUBLISHER_CODE||!env.RATE_SALT||!env.HUB))return finish(json({error:'The private AI demo has not been activated yet.'},503));
    try {
      const client=await hash(env.RATE_SALT+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));
      const headers=new Headers(request.headers);headers.set('X-Demo-Client',client);headers.delete('CF-Connecting-IP');headers.delete('Cookie');
      const stub=env.HUB.get(env.HUB.idFromName('alongside-competition-v1'));return finish(await stub.fetch(new Request(request,{headers})));
    }catch{return finish(json({error:'The private demo server is temporarily unavailable.'},503));}
  }
};
