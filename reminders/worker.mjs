import {day, nextSlot, readSchedule} from './schedule.mjs';

const pendingLife = 15 * 60_000;
const activeLife = 30 * day;
const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const err = (status, message) => json({error:message},status);
const phonePattern = /^\+[1-9]\d{6,14}$/;
const hex = buffer => Array.from(new Uint8Array(buffer), n=>n.toString(16).padStart(2,'0')).join('');
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const hash = async value => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

function ready(env) {
  return Boolean(env.WA_ACCESS_TOKEN && env.WA_APP_SECRET && env.WA_VERIFY_TOKEN &&
    /^\d+$/.test(env.WA_PHONE_NUMBER_ID || '') && /^[1-9]\d{6,14}$/.test(env.WA_BUSINESS_NUMBER || '') &&
    /^[a-z_][a-z0-9_]{0,511}$/.test(env.WA_TEMPLATE_NAME || '') &&
    /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(env.WA_TEMPLATE_LANGUAGE || '') &&
    /^v\d+\.\d+$/.test(env.WA_GRAPH_VERSION || ''));
}

async function readLimited(request, max) {
  if (!request.body || Number(request.headers.get('Content-Length'))>max) throw new RangeError();
  const reader=request.body.getReader(), chunks=[];
  let length=0;
  for (;;) {
    const {done,value}=await reader.read();
    if (done) break;
    length+=value.length;
    if (length>max) { await reader.cancel(); throw new RangeError(); }
    chunks.push(value);
  }
  const bytes=new Uint8Array(length);
  let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}

async function signed(env, bytes, signature) {
  if (!env.WA_APP_SECRET || !/^sha256=[0-9a-f]{64}$/.test(signature || '')) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WA_APP_SECRET),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const mac=Uint8Array.from(signature.slice(7).match(/../g),v=>parseInt(v,16));
  return crypto.subtle.verify('HMAC',key,mac,bytes);
}

const named = (env, name) => env.REMINDERS.idFromName(name);
const call = (env, id, action, data={}) => env.REMINDERS.get(id).fetch('https://store.internal/'+action,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const tokenFrom = request => /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];

async function webhook(request,env) {
  if (request.method==='GET') {
    const p=new URL(request.url).searchParams;
    if (!env.WA_VERIFY_TOKEN || p.get('hub.mode')!=='subscribe' || p.get('hub.verify_token')!==env.WA_VERIFY_TOKEN) return err(403,'Verification failed');
    return new Response(p.get('hub.challenge') || '',{headers:{'Cache-Control':'no-store'}});
  }
  if (request.method!=='POST') return err(405,'Method not allowed');
  let bytes,payload;
  try {bytes=await readLimited(request,1_048_576);} catch {return err(413,'Invalid webhook size');}
  if (!await signed(env,bytes,request.headers.get('X-Hub-Signature-256'))) return err(403,'Invalid signature');
  try {payload=JSON.parse(new TextDecoder().decode(bytes));} catch {return err(400,'Invalid JSON');}
  if (payload.object!=='whatsapp_business_account') return json({received:true});
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const v=change.value;
    if (change.field!=='messages' || v?.metadata?.phone_number_id!==env.WA_PHONE_NUMBER_ID) continue;
    for (const m of v.messages || []) {
      const phone='+'+m.from;
      if (!phonePattern.test(phone) || typeof m.text?.body!=='string') continue;
      const text=m.text.body.trim();
      const stop=/^(?:stop|unsubscribe|cancel|إيقاف|توقف)$/iu.test(text);
      const start=/^START ([a-f0-9]{24})(?:\s|$)/i.exec(text);
      if (!stop && !start) continue;
      const result=await call(env,named(env,'phone:'+phone),'incoming',{stop,code:start?.[1].toLowerCase(),timestamp:Number(m.timestamp)*1000});
      if (!result.ok) throw new Error('Webhook storage unavailable');
    }
    for (const status of v.statuses || []) {
      const phone='+'+status.recipient_id;
      if (!phonePattern.test(phone) || !['sent','delivered','read','failed'].includes(status.status)) continue;
      const result=await call(env,named(env,'phone:'+phone),'receipt',{messageId:status.id,status:status.status});
      if (!result.ok) throw new Error('Receipt storage unavailable');
    }
  }
  return json({received:true});
}

async function siteRequest(request,env,path) {
  if (path==='/status' && request.method==='GET') return json({available:ready(env)});
  if (request.method==='OPTIONS') return new Response(null,{status:204});
  if (request.headers.get('Origin')!==env.ALLOWED_ORIGIN) return err(403,'Origin not allowed');
  if (path==='/subscriptions' && request.method==='POST') {
    if (!ready(env)) return err(503,'WhatsApp is not connected');
    let input;
    try {input=JSON.parse(new TextDecoder().decode(await readLimited(request,8192)));} catch {return err(400,'Invalid request');}
    const plan=readSchedule(input);
    if (!plan || typeof input.phone!=='string' || !phonePattern.test(input.phone)) return err(400,'Check the phone number, consent, timezone and reminder times');
    const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
    const limited=await call(env,named(env,'rate:'+await hash(ip)),'rate');
    if (!limited.ok) return limited;
    const id=named(env,'phone:'+input.phone);
    return call(env,id,'enroll',{id:id.toString(),phone:input.phone,plan});
  }
  const match=/^\/subscriptions\/([0-9a-f]{64})$/.exec(path);
  const method=request.method;
  if (!match || !['GET','PATCH','DELETE'].includes(method)) return err(404,'Not found');
  const token=tokenFrom(request);
  if (!token) return err(404,'Subscription not found');
  let plan,id;
  try {id=env.REMINDERS.idFromString(match[1]);} catch {return err(404,'Subscription not found');}
  if (method==='PATCH') {
    try {plan=readSchedule(JSON.parse(new TextDecoder().decode(await readLimited(request,8192))));} catch {}
    if (!plan) return err(400,'Choose a valid schedule and confirm consent');
  }
  return call(env,id,'manage',{method,plan,tokenHash:await hash(token)});
}

export default {async fetch(request,env) {
  const path=new URL(request.url).pathname;
  let result;
  try {
    if (path==='/webhook') return await webhook(request,env);
    result=await siteRequest(request,env,path);
  } catch {result=err(503,'Reminders are temporarily unavailable');}
  const headers=new Headers(result.headers);
  if (request.headers.get('Origin')===env.ALLOWED_ORIGIN) {
    headers.set('Access-Control-Allow-Origin',env.ALLOWED_ORIGIN);
    headers.set('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
    headers.set('Vary','Origin');
  }
  return new Response(result.body,{status:result.status,headers});
}};

export async function sendReminder(env, phone, transport=fetch) {
  const response=await transport('https://graph.facebook.com/'+env.WA_GRAPH_VERSION+'/'+env.WA_PHONE_NUMBER_ID+'/messages',{
    method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.WA_ACCESS_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:phone.slice(1),type:'template',
      template:{name:env.WA_TEMPLATE_NAME,language:{code:env.WA_TEMPLATE_LANGUAGE}}})});
  if (!response.ok) return {status:'failed'};
  const id=(await response.json()).messages?.[0]?.id;
  return typeof id==='string' && id ? {status:'accepted',messageId:id} : {status:'unknown'};
}

export class ReminderStore {
  constructor(ctx,env){this.storage=ctx.storage;this.env=env;this.queue=Promise.resolve();}
  // Hold the object-level queue across provider I/O as well as storage calls so that
  // a cancellation can never return success before an older send starts.
  run(fn) {
    const result=this.queue.then(fn);
    this.queue=result.catch(()=>{});
    return result;
  }
  fetch(request){return this.run(async()=>this.handle(new URL(request.url).pathname,await request.json(),Date.now()));}
  alarm(){return this.run(()=>this.onAlarm(Date.now()));}

  async load(now) {
    const state=await this.storage.get('state') || {pending:[]};
    state.pending=state.pending.filter(p=>p.expiresAt>now);
    if (state.active?.expiresAt<=now) delete state.active;
    if (state.rate?.expiresAt<=now) delete state.rate;
    return state;
  }
  async save(state) {
    const alarms=state.pending.map(p=>p.expiresAt);
    if (state.active) alarms.push(state.active.next.at,state.active.expiresAt);
    if (state.rate) alarms.push(state.rate.expiresAt);
    await this.storage.transaction(async ()=>{
      if (alarms.length) {
        await this.storage.put('state',state);
        await this.storage.setAlarm(Math.min(...alarms));
      } else {
        await this.storage.delete('state');
        await this.storage.deleteAlarm();
      }
    });
  }

  async handle(path,data,now) {
    const state=await this.load(now);
    if (path==='/rate') {
      state.rate ||= {count:0,expiresAt:now+day};
      if (state.rate.count>=12) return err(429,'Try again later');
      state.rate.count++;
      await this.save(state);
      return json({ok:true});
    }
    if (path==='/enroll') {
      if (state.pending.length>=6) return err(429,'Try again in 15 minutes');
      const token=random(32), code=random(12);
      const expiresAt=now+pendingLife;
      state.pending.push({tokenHash:await hash(token),codeHash:await hash(code),phone:data.phone,plan:data.plan,expiresAt,requestedAt:now});
      await this.save(state);
      const message='START '+code+'\nI agree to receive daily Alongside reminders at '+data.plan.times.join(', ')+' ('+data.plan.timeZone+'). I can reply STOP anytime.';
      return json({id:data.id,token,status:'pending',expiresAt,activationUrl:'https://wa.me/'+this.env.WA_BUSINESS_NUMBER+'?text='+encodeURIComponent(message)},201);
    }
    const active=state.active;
    if (path==='/incoming') {
      if (data.stop) {
        // Do not allow a delayed duplicate STOP to cancel a later confirmed enrollment.
        if (active && (!Number.isFinite(data.timestamp) || data.timestamp+999>=active.confirmedAt)) delete state.active;
        state.pending=state.pending.filter(p=>Number.isFinite(data.timestamp) && data.timestamp+999<p.requestedAt);
      } else if (ready(this.env)) {
        const digest=await hash(data.code || '');
        const pending=state.pending.find(p=>p.codeHash===digest);
        if (pending) {
          const lastKey=active?.lastKey;
          state.active={...pending,lastKey,confirmedAt:now,expiresAt:now+activeLife,next:nextSlot(pending.plan,now,lastKey)};
          delete state.active.codeHash;
          state.pending=[];
        }
      }
      await this.save(state);
      return json({ok:true});
    }
    if (path==='/receipt') {
      if (active?.messageId && active.messageId===data.messageId) {
        const rank={accepted:0,sent:1,failed:1,delivered:2,read:3};
        if (data.status==='failed' && !['delivered','read'].includes(active.lastDelivery)) active.lastDelivery='failed';
        else if ((rank[data.status] ?? -1)>(rank[active.lastDelivery] ?? 0)) active.lastDelivery=data.status==='sent'?'accepted':data.status;
        await this.save(state);
      }
      return json({ok:true});
    }
    if (path!=='/manage') return err(404,'Not found');
    const selected=active?.tokenHash===data.tokenHash ? active : state.pending.find(p=>p.tokenHash===data.tokenHash);
    if (!selected) return err(404,'Subscription not found');
    if (data.method==='DELETE') {
      if (selected===active) {delete state.active;state.pending=[];}
      else state.pending=state.pending.filter(p=>p!==selected);
      await this.save(state);
      return json({status:'cancelled'});
    }
    if (data.method==='PATCH') {
      if (selected!==active) return err(409,'Confirm the number before changing the schedule');
      selected.plan=data.plan;
      selected.next=nextSlot(data.plan,now,selected.lastKey);
      selected.expiresAt=now+activeLife;
      await this.save(state);
    }
    return json({status:selected===active?'active':'pending',...selected.plan,expiresAt:selected.expiresAt,lastDelivery:selected.lastDelivery});
  }

  async onAlarm(now) {
    const state=await this.load(now), active=state.active;
    if (!active || active.next.at>now) {await this.save(state);return;}
    const due=active.next;
    active.lastKey=due.key;
    active.next=nextSlot(active.plan,now,due.key);
    const send=ready(this.env) && now-due.at<10*60_000;
    active.lastDelivery=send?'unknown':'failed';
    delete active.messageId;
    // Claim the slot and schedule tomorrow before external I/O. Never repeat a
    // request whose provider acceptance is uncertain after a timeout or restart.
    await this.save(state);
    if (!send) return;
    try {
      const result=await sendReminder(this.env,active.phone);
      active.lastDelivery=result.status;
      if (result.messageId) active.messageId=result.messageId;
    } catch {active.lastDelivery='unknown';}
    await this.save(state);
  }
}
