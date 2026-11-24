import {calendarFeed, DAY, normalizePlan} from './feed.mjs';

import {firstPendingConflict,nextPersonalMeal,sendPersonalMeal} from '../reminders/personal-meals.mjs';

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
    const stopAt=this.personalUntil();
    const meal=nextPersonalMeal(record,now,stopAt,sent);
    const conflict=firstPendingConflict(record,now,stopAt,sent);
    // An ordinary reminder already due in the next second has priority.
    const due=conflict && (!meal || meal.start>now+1000) ? {...conflict,notifyAt:now+1000} : meal;
    if (due?.kind==='overlap') {
      const previous=await this.store.get('personalDue');
      if (previous?.key===due.key && previous.start===due.start) due.notifyAt=previous.notifyAt;
    }
    if (due) await this.store.put('personalDue',due);
    else await this.store.delete('personalDue');
    await this.store.setAlarm(due?.notifyAt ?? due?.start ?? record.expires);
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
      const personalAlertsAvailable=this.personalUntil()>now;
      if (plan.conflicts) {
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:plan.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
        plan.conflicts=personalAlertsAvailable ? plan.conflicts.filter(row=>row.date===today) : [];
        if(!plan.conflicts.length)delete plan.conflicts;
      }
      const same=JSON.stringify(data?.plan)===JSON.stringify(plan);
      if (data && data.expires>now && creating && !same)return respond(409);
      const saved={
        uid:data?.uid || crypto.randomUUID().slice(0,18), revised:same?data.revised:now,
        sequence:same?data.sequence:(data?.sequence||0)+1, expires:now+90*DAY, plan
      };
      await this.store.put('plan',saved);
      await this.schedule(saved,now,(await this.store.get('personalSent')) || []);
      return respond(200,JSON.stringify({expires:saved.expires,personalAlertsAvailable}),{'Content-Type':'application/json'});
    });
  }
  async alarm() {
    const pending=await this.ctx.blockConcurrencyWhile(async()=>{
      const now=Date.now(),record=await this.store.get('plan');
      if (!record || record.expires<=now) {await this.store.deleteAll();return;}
      const due=await this.store.get('personalDue'), stopAt=this.personalUntil();
      const sent=(await this.store.get('personalSent')) || [];
      const overlap=due?.kind==='overlap';
      const current=due && (overlap ? firstPendingConflict(record,now,stopAt,sent) :
        nextPersonalMeal(record,due.start-1,stopAt,sent));
      const at=due?.notifyAt ?? due?.start;
      const shouldSend=now<stopAt && now>=at && now-at<120000 &&
        Boolean(due && current && current.key===due.key && current.start===due.start);
      // Suppress late overlap notifications as well, so an alarm retry cannot replay a missed ping.
      if (overlap && now>=at && !shouldSend && current?.key===due.key) {
        sent.push(due.key);
        await this.store.put('personalSent',sent.slice(-40));
      }
      if (shouldSend) {
        sent.push(due.key);
        await this.store.put('personalSent',sent.slice(-40));
      }
      await this.schedule(record,now,sent);
      // Reserve the occurrence before delivery. An ambiguous provider response must never trigger a duplicate.
      return shouldSend ? {due,plan:record.plan} : null;
    });
    if (pending) {
      // Opening an MCP session can take time. Recheck the latest saved plan just
      // before the action so a keep, move or disconnect cancels an in-flight alert.
      const {due,plan}=pending;
      await sendPersonalMeal(this.env.PERSONAL_ZAPIER_URL,due,plan,fetch,async()=>{
        const record=await this.store.get('plan'),now=Date.now(),end=this.personalUntil();
        if(!record || record.expires<=now || now>=end || record.plan.timeZone!==plan.timeZone ||
            record.plan.discreet!==plan.discreet) return false;
        if(due.kind==='overlap' && now>=due.start)return false;
        const current=due.kind==='overlap' ? firstPendingConflict({...record,plan:{...record.plan,
          conflicts:record.plan.conflicts?.filter(c=>c.id===due.meal)}},now,end) :
          nextPersonalMeal(record,due.start-1,end);
        return current?.key===due.key && current.start===due.start;
      });
    }
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
