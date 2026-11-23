"use strict";
(() => {
  const origin = 'https://alongside-reminders.alongside-waicy-demo.workers.dev';
  const statusText = {
    idle: 'WhatsApp reminders are off.',
    checking: 'Checking the WhatsApp connection…',
    offline: 'WhatsApp reminders are currently unavailable. You can use calendar reminders.',
    pending: 'Send the prepared message from your number within 15 minutes, then check the status here.',
    active: 'WhatsApp reminders are on. Reply STOP in WhatsApp or turn them off here.',
    changed: 'Your reminder times have changed. Choose Update times to apply them to WhatsApp.',
    ended: 'This connection has ended. You can connect again.',
    error: 'Could not confirm the connection. Try again. To stop reminders, reply STOP in WhatsApp.',
    blocked: 'Phone reminders are unavailable for this profile.'
  };
  function activationLink(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && u.hostname === 'wa.me' && !u.port && !u.username && !u.password &&
        /^\/[1-9]\d{6,14}$/.test(u.pathname) && u.searchParams.has('text') ? u.href : '';
    } catch { return ''; }
  }
  function normalizePhone(value) {
    const phone = value.trim().replace(/[\s()-]/g, '');
    return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : '';
  }
  function mount({document:doc,storage,getProfileId,getPlan,canConnect,fetcher=fetch,translate=text=>text}) {
    const el = id => doc.getElementById(id);
    const form = el('whatsapp-form'), phone=el('whatsapp-number'), consent=el('whatsapp-consent');
    const start=el('whatsapp-start'), link=el('whatsapp-activate'), stop=el('whatsapp-stop');
    const check=el('whatsapp-check'), update=el('whatsapp-update'), status=el('whatsapp-status');
    const key = p => 'alongside-wa-reminders-v1:'+p;
    let current='', available=false, busy=false, generation=0, state, message='idle', checkedAt=0;
    function load(p) {
      try { return JSON.parse(storage.getItem(key(p))) || null; } catch { return null; }
    }
    function selectProfile() {
      const next=getProfileId() || '';
      if(next!==current){
        generation++; busy=false; available=false; checkedAt=0; current=next;
        state=next ? load(next) : null; message='idle'; phone.value=''; consent.checked=false;
      }else if(next && !busy){
        const prior=state;
        state=load(next);
        if(prior?.token!==state?.token)message='idle';
      }
    }
    function save(next) {
      if(next) storage.setItem(key(current),JSON.stringify(next));
      else storage.removeItem(key(current));
      state=next;
    }
    function plan() {
      const {timeZone,slots}=getPlan();
      return {timeZone, times:[...new Set(slots.filter(s=>s.id!=='checkin').map(s=>s.time))].sort()};
    }
    function matchesPlan() {
      const p=plan();
      return state?.timeZone===p.timeZone && JSON.stringify([...state.times].sort())===JSON.stringify(p.times);
    }
    function render() {
      selectProfile();
      const allowed=Boolean(current && canConnect());
      const active=state?.status==='active', pending=state?.status==='pending';
      const changed=active && !matchesPlan();
      el('whatsapp-enrol').hidden=Boolean(state) || !allowed || !available;
      start.disabled=busy || !available || !allowed || Boolean(state);
      check.disabled=busy || !current; stop.disabled=busy;
      stop.hidden=!state; update.hidden=!active || !allowed; update.disabled=busy || !available;
      link.hidden=!(pending && allowed && state.activationUrl && available);
      if(link.hidden)link.removeAttribute('href');else link.href=state.activationUrl;
      el('whatsapp-schedule').textContent=allowed && available ? plan().times.join(' · ')+' ('+plan().timeZone+')' : '';
      let text=message;
      if(!allowed && !state)text='blocked';
      else if(['idle','active','pending','changed'].includes(text)) text=changed?'changed':state?.status || 'idle';
      status.textContent=translate(statusText[text] || statusText.error);
      const delivery={accepted:'Latest reminder accepted by WhatsApp.',delivered:'Latest reminder delivered.',read:'Latest reminder read.',failed:'Latest reminder could not be delivered.',unknown:'Latest delivery is unconfirmed.'};
      el('whatsapp-delivery').textContent=active && delivery[state.lastDelivery] ? translate(delivery[state.lastDelivery]) : '';
      el('whatsapp-until').textContent='';
      if(active && state.expiresAt){
        const expiry=new Date(state.expiresAt);
        if(Number.isFinite(+expiry))el('whatsapp-until').textContent=translate('Reminders end on')+' '+expiry.toLocaleDateString(doc.documentElement?.lang || 'en')+'.';
      }
    }
    async function request(path,method='GET',body,token) {
      const headers={};
      if(body)headers['Content-Type']='application/json';
      if(token)headers.Authorization='Bearer '+token;
      const result=await fetcher(origin+path,{method,headers,body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
      if(!result.ok)throw Object.assign(new Error('Request failed'),{status:result.status});
      return result.status===204 ? {} : await result.json();
    }
    const path = s => '/subscriptions/'+encodeURIComponent(s.id);
    async function perform(operation) {
      selectProfile(); if(!current || busy)return false;
      const expected=current, revision=++generation;
      const valid=()=>getProfileId()===expected && revision===generation;
      busy=true; render();
      try{return await operation(valid);}
      catch(e){
        if(valid()){
          if(e.status===404 && state && state.token===load(current)?.token){save(null);message='ended';}
          else {message='error';}
        }
        return false;
      } finally {if(valid()){busy=false;render();}}
    }
    async function refresh(force=false) {
      selectProfile();render();
      if(!current || (!canConnect() && !state) || busy || (!force && Date.now()-checkedAt<30000))return;
      checkedAt=Date.now();
      await perform(async valid=>{
        message='checking';render();
        try{const result=await request('/status'); if(!valid())return;available=result.available===true;}
        catch{if(!valid())return;available=false;}
        if(state){
          const token=state.token;
          const result=await request(path(state),'GET',undefined,token);
          if(!valid() || load(current)?.token!==token)return;
          save({...state,...details(result),activationUrl:result.status==='pending'?state.activationUrl:''});
          message=available?'idle':'offline';
        }else message=available?'idle':'offline';
      });
    }
    function details(result) {
      if(!['pending','active'].includes(result.status) || !Array.isArray(result.times) || typeof result.timeZone!=='string')throw Error('Unexpected response');
      return {status:result.status,times:result.times,timeZone:result.timeZone,expiresAt:result.expiresAt,lastDelivery:result.lastDelivery};
    }
    async function enroll(e) {
      e.preventDefault();selectProfile();
      const number=normalizePhone(phone.value);
      if(!number){phone.setCustomValidity(translate('Use an international number beginning with + and the country calling code.'));phone.reportValidity();return;}
      if(!consent.checked || !available || state || !canConnect())return;
      await perform(async valid=>{
        const requested=plan();
        const result=await request('/subscriptions','POST',{...requested,phone:number,consent:true});
        const url=activationLink(result.activationUrl);
        if(!url || !result.id || !result.token || result.status!=='pending')throw Error('Unexpected response');
        if(!valid() || load(current)){await request(path(result),'DELETE',undefined,result.token);return;}
        try{save({...requested,id:result.id,token:result.token,status:'pending',activationUrl:url});}
        catch(e){await request(path(result),'DELETE',undefined,result.token);throw e;}
        phone.value='';consent.checked=false;message='pending';
      });
    }
    async function disconnect(){
      selectProfile();
      if(busy)return false;
      if(!state)return true;
      return perform(async valid=>{
        const token=state.token;
        try{await request(path(state),'DELETE',undefined,token);}catch(e){if(e.status!==404)throw e;}
        if(!valid() || (load(current) && load(current).token!==token))return false;
        save(null);message='ended';consent.checked=false;
        return true;
      });
    }
    async function applyChanges() {
      if(!state || state.status!=='active' || !canConnect())return;
      await perform(async valid=>{
        const requested=plan();
        const token=state.token;
        const updated=await request(path(state),'PATCH',{...requested,consent:true},token);
        if(!valid() || load(current)?.token!==token)return;
        save({...state,...details(updated)});message='active';
      });
    }
    form.addEventListener('submit',enroll);phone.addEventListener('input',()=>phone.setCustomValidity(''));
    check.addEventListener('click',()=>refresh(true));stop.addEventListener('click',disconnect);update.addEventListener('click',applyChanges);
    render();
    return {refresh,render,disconnect};
  }
  globalThis.AlongsideWhatsApp={mount,normalizePhone,activationLink};
})();
