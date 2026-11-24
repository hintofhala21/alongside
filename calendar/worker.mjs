import {calendarFeed, DAY, normalizePlan} from './feed.mjs';

import {nextPersonalMeal,sendPersonalMeal} from '../reminders/personal-meals.mjs';

const headers = {'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const respond = (status, body = null, extra = {}) => new Response(body, {status, headers:{...headers,...extra}});
const keyPattern = /^[a-f0-9]{64}$/;
export async function feedId(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('Alongside calendar read '+key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
async function readPlan(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Error();
  const reader=request.body?.getReader();
  if (!reader) throw Error();
  let length=0; const chunks=[];
  while (true) {
    const {done,value}=await reader.read(); if (done) break;
    if ((length+=value.length)>2048) { await reader.cancel(); throw Error(); }
    chunks.push(value);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  return normalizePlan(JSON.parse(new TextDecoder().decode(bytes)));
}
export class CalendarPlan {
  constructor(ctx,env) {this.ctx=ctx;this.store=ctx.storage;this.env=env;}
  personalUntil() {
    const env=this.env;
    if (!env?.PERSONAL_FEED_ID || !env.PERSONAL_ZAPIER_URL ||
        !this.ctx.id.equals(env.CALENDARS.idFromName(env.PERSONAL_FEED_ID))) return 0;
    return Date.parse(env.PERSONAL_STOP_AT);
  }
  async schedule(record,now,sent=[]) {
    const due=nextPersonalMeal(record,now,this.personalUntil(),sent);
    if (due) await this.store.put('personalDue',due);
    else await this.store.delete('personalDue');
    await this.store.setAlarm(due?.start ?? record.expires);
  }
  async fetch(request) {
    const now=Date.now();
    if (request.method==='GET' || request.method==='HEAD') {
      const data=await this.store.get('plan');
      if (!data || data.expires<=now) return respond(404);
      const body=request.method==='GET' ? calendarFeed(data.plan,data,now) : null;
      return respond(200,body,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="alongside.ics"'});
    }
    let plan;
    if (request.method==='PUT') {
      try {plan=await readPlan(request);} catch {return respond(400);}
    }
    return this.ctx.blockConcurrencyWhile(async()=>{
      const data=await this.store.get('plan');
      if(request.method==='DELETE'){
        // A late update or retry must never turn a revoked feed back on.
        await this.store.delete('plan');
        await this.store.delete('personalDue');
        await this.store.put('revoked',true);
        await this.store.setAlarm(now+DAY);
        return respond(204);
      }
      if(await this.store.get('revoked'))return respond(410);
      const creating=request.headers.get('If-None-Match')==='*';
      if ((!data || data.expires<=now) && !creating)return respond(410);
      const same=JSON.stringify(data?.plan)===JSON.stringify(plan);
      if (data && data.expires>now && creating && !same)return respond(409);
      const saved={
        uid:data?.uid || crypto.randomUUID().slice(0,18), revised:same?data.revised:now,
        sequence:same?data.sequence:(data?.sequence||0)+1, expires:now+90*DAY, plan
      };
      await this.store.put('plan',saved);
      await this.schedule(saved,now,(await this.store.get('personalSent')) || []);
      return respond(200,JSON.stringify({expires:saved.expires}),{'Content-Type':'application/json'});
    });
  }
  async alarm() {
    const pending=await this.ctx.blockConcurrencyWhile(async()=>{
      const now=Date.now(),record=await this.store.get('plan');
      if (!record || record.expires<=now) {await this.store.deleteAll();return;}
      const due=await this.store.get('personalDue'), stopAt=this.personalUntil();
      const sent=(await this.store.get('personalSent')) || [];
      const current=due && nextPersonalMeal(record,due.start-1,stopAt,sent);
      const shouldSend=now<stopAt && due && now>=due.start && now-due.start<120000 &&
        current?.key===due.key && current.start===due.start;
      if (shouldSend) {
        sent.push(due.key);
        await this.store.put('personalSent',sent.slice(-12));
      }
      await this.schedule(record,now,sent);
      // Reserve the occurrence before delivery. An ambiguous provider response must never trigger a duplicate.
      return shouldSend ? {due,plan:record.plan} : null;
    });
    if (pending) await sendPersonalMeal(this.env.PERSONAL_ZAPIER_URL,pending.due,pending.plan);
  }
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (url.pathname==='/health' && request.method==='GET')return respond(200,'{"service":"calendar"}',{'Content-Type':'application/json'});
    const match=/^\/v1\/plans\/([a-f0-9]{64})(\.ics)?$/.exec(url.pathname);
    if (!match || url.search) return respond(404);
    const [,id,read]=match;
    if (read) {
      if (!['GET','HEAD'].includes(request.method))return respond(405);
      return env.CALENDARS.get(env.CALENDARS.idFromName(id)).fetch(request);
    }
    if (request.headers.get('Origin')!==env.ALLOWED_ORIGIN)return respond(403);
    const cors={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Vary':'Origin'};
    if(request.method==='OPTIONS')return respond(204,null,{...cors,'Access-Control-Allow-Methods':'PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type, If-None-Match','Access-Control-Max-Age':'600'});
    if (!['PUT','DELETE'].includes(request.method))return respond(405,null,cors);
    const key=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!key || !keyPattern.test(key) || await feedId(key)!==id)return respond(403,null,cors);
    if (request.method==='PUT' && env.WRITE_LIMIT) {
      const result=await env.WRITE_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
      if(!result.success)return respond(429,null,{...cors,'Retry-After':'60'});
    }
    const reply=await env.CALENDARS.get(env.CALENDARS.idFromName(id)).fetch(request);
    const wrapped=new Response(reply.body,reply);
    for (const [name,value] of Object.entries(cors))wrapped.headers.set(name,value);
    return wrapped;
  }
};
