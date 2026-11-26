"use strict";
(() => {
  const key = globalThis.AlongsideAccount?.key('alongside-chat-history-v1') ?? 'alongside-chat-history-v1';
  const localChoice = globalThis.AlongsideAccount?.key('alongside-use-library') ?? 'alongside-use-library';
  const sessionKey = globalThis.AlongsideAccount?.key('alongside-demo-session-v1') ?? 'alongside-demo-session-v1';
  const node = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
  const id = value => document.getElementById(value);
  function connectionMessage(error) {
    return error.name === 'TypeError'
      ? 'Breeze couldn’t reach live chat. Try again in a moment, or choose “Read approved answer” for a topic you can read offline.'
      : error.message;
  }
  function requestsReminderSettings(text,translatedLabel){
    const plain=text.normalize('NFKC').trim().toLowerCase().replace(/[.!?؟。！？]+$/u,'');
    if(plain===translatedLabel.toLowerCase())return true;
    const request=plain.replace(/^(?:please |can you |could you |how (?:do|can) i )/u,'').replace(/ please$/u,'');
    return /^(?:(?:set up|open|enable|disable|stop|cancel|change|update|connect|manage) (?:my |the )?(?:(?:calendar|whatsapp|meal|snack|water) )?reminders?(?: settings)?|connect (?:my )?(?:calendar|whatsapp)|(?:add|put) (?:my |the )?(?:plan|meals|meal plan|breakfast|lunch|dinner) (?:to|on|in) (?:my |the )?calendar|remind me (?:about|to have) (?:breakfast|lunch|dinner|my meals|my snacks)|remind me to drink water)$/u.test(request);
  }
  const cleanMessage = m => m && ['user','assistant'].includes(m.role) && typeof m.text === 'string' && m.text.length <= 6000;
  const store = {
    read() { try { const v = JSON.parse((globalThis.AlongsideAccount?.storage ?? localStorage).getItem(key)); return { current: typeof v?.current === 'string' ? v.current : null, chats: Array.isArray(v?.chats) ? v.chats.filter(c => typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages)).slice(0,30).map(c => ({ ...c, messages:c.messages.filter(cleanMessage).slice(-60) })) : [] }; } catch { return {current:null,chats:[]}; } },
    write(value) { try { (globalThis.AlongsideAccount?.storage ?? localStorage).setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
    clear() { (globalThis.AlongsideAccount?.storage ?? localStorage).removeItem(key); sessionStorage.removeItem(sessionKey); sessionStorage.removeItem(localChoice); }
  };
  globalThis.AlongsideChatStore = store;
  globalThis.AlongsideChat = class {
    constructor(options) {
      this.options = options; this.state = store.read(); this.busy = false; this.apiBase = ''; this.session = null;
      try { const s = JSON.parse(sessionStorage.getItem(sessionKey)); if (s?.expires > Date.now()) this.session = s; } catch {}
      if(location.hash.startsWith('#support?')){
        const selected=new URLSearchParams(location.hash.slice('#support?'.length)).get('chat');
        if(this.state.chats.some(c=>c.id===selected && c.mode!=='luna'))this.state.current=selected;
        history.replaceState(null,'','#support');
        store.write(this.state);
      }
      this.ready = this.loadConfig(); this.render();
      window.addEventListener('storage', e => { if(e.key === key || e.key === null) { this.cancel(); this.state = store.read(); this.render(); } });
    }
    async loadConfig() {
      try { const r = await fetch(new URL('../config.json', document.currentScript?.src || new URL('./assets/chat.js',location.href)), {cache:'no-store'}); if(!r.ok) throw Error('Configuration unavailable');
        const c = await r.json();
        if(location.hostname==='127.0.0.1' && ['4173','4174','4175'].includes(location.port)) {
          this.localBreeze=c.localBreeze==='live'?'live':'unavailable';
          this.apiBase=location.origin+'/breeze';
        } else if(c.apiBase) { const u = new URL(c.apiBase); if(u.protocol === 'https:' && u.hostname.endsWith('.workers.dev')) this.apiBase = u.origin; }
      } catch {}
      if(this.session?.apiBase !== this.apiBase) this.disconnect();
      this.render();
    }
    current() { return this.state.chats.find(c => c.id === this.state.current && c.mode!=='luna'); }
    younger() { return globalThis.AlongsideAccount?.kids || ['child','teen'].includes(this.options.getAgeGroup()); }
    mode() { return ['guided','personal'].includes(this.session?.mode) ? 'personal' : this.session ? 'luna' : 'library'; }
    ensureChat(mode=this.mode()) {
      const current=this.current();
      if(current)return current;
      const c={id:crypto.randomUUID(),title:'A new conversation',created:new Date().toISOString(),messages:[],mode};
      this.state.chats.unshift(c);this.state.chats=this.state.chats.slice(0,30);this.state.current=c.id;
      return this.current();
    }
    liveConversationId(chat) {
      if(chat.sessionExpires!==this.session.expires){
        chat.liveId=crypto.randomUUID();chat.sessionExpires=this.session.expires;
      }
      // Older saved threads used their local id as the live conversation id.
      return chat.liveId || chat.id;
    }
    save() { if(!store.write(this.state)) id('chat-status').textContent='This conversation is available for this visit. Browser storage is unavailable.'; }
    cancel() { this.abort?.abort(); this.busy=false; }
    newChat() { this.status(''); this.cancel(); this.state.current=null; this.save(); this.render(); id('chat-message').focus(); }
    clearLocal() { this.cancel(); store.clear(); this.state={current:null,chats:[]}; this.session=null; this.render(); }
    disconnect() { this.session=null; try { sessionStorage.removeItem(sessionKey); } catch {} }
    status(text) { id('chat-status').textContent=text; }
    revealLatest() { id('conversation')?.lastElementChild?.scrollIntoView({block:'end'}); }
    render() {
      if(!id('conversation')) return;
      if(this.session && !this.matchesProfile()){this.cancel();this.disconnect();}
      const guided=this.younger();
      const chats=this.state.chats.filter(c=>c.mode!=='luna');
      const chat=this.current(); const hasMessages=Boolean(chat?.messages.length);
      id('chat-welcome').hidden=hasMessages;
      const offline=this.localBreeze==='unavailable';
      id('chat-mode').textContent=this.options.translateText(offline?'AI chat offline':this.session?'Chat connected':'Breeze');
      id('chat-privacy').textContent=this.options.translateText(this.localBreeze==='unavailable' ? 'Live chat is offline.' : guided
        ? 'When you press Send, your words go to OpenAI for a reply. Leave out names and contact details.'
        : this.session ? 'Chat connected. Your messages go to OpenAI for replies.' : 'Your messages go to OpenAI only after you agree.');

      id('chat-message').disabled=this.busy;
      id('send-chat').disabled=this.busy;
      const out=id('conversation'); out.replaceChildren();
      for(const m of chat?.messages || []) {
        const b=node('article','',m.role==='user'?'bubble user':'bubble'); const body=node('p',m.text); body.dataset.userContent='';
        b.append(node('small',m.role==='user'?'You':this.options.translateText('Breeze')),body);
        const sources=(m.sources||[]).filter(s=>Object.hasOwn(this.options.sources,s));
        if(sources.length) { const links=node('div','','source-links'); for(const s of sources) { const source=this.options.sources[s]; const a=node('a',source.organization); a.href=source.url; a.target='_blank'; a.rel='noopener noreferrer'; links.append(a); } b.append(links); }
        if(m.action && m.action!=='none') { const labels={calendar:'Choose calendar times',week:'Review my week',reminders:'Set up reminders',meals:'Ask for meal ideas',checkin:'Open a gentle check-in',routine:'Open my routine',care:'Find care',human:'Get human help'}; const a=node('button',labels[m.action]||'View next step','action outline'); a.type='button'; a.addEventListener('click',()=>this.options.onAction(m.action)); b.append(a); }
        if(m.trace?.length) { const d=node('details','','agent-trace'); d.append(node('summary','How Alongside helped')); for(const t of m.trace) d.append(node('p',t)); b.append(d); }
        out.append(b);
      }
      if(this.busy) out.append(node('p','Alongside is considering a small next step…','thinking'));
      id('empty-chats').hidden=chats.length>0;
      id('recent-chats').replaceChildren(...chats.map(c=>{ const li=node('li'); const b=node('button',c.title,'action outline'); b.dataset.userContent=''; b.type='button'; b.disabled=this.busy; b.setAttribute('aria-pressed',String(c.id===this.state.current)); b.addEventListener('click',()=>{this.state.current=c.id;this.save();this.render();});li.append(b);return li;}));


      const shown=(chat?.messages.length||0)+(this.busy?1:0);
      if(document.body.classList.contains('chat-view') && out.offsetParent && shown!==this.shownCount){
        if(shown && out.lastElementChild) out.lastElementChild.scrollIntoView({block:'end',behavior:this.shownCount===undefined?'auto':'smooth'});
        this.shownCount=shown;
      }
    }
    matchesProfile() {
      if(this.session.expires<=Date.now())return false;
      if(!['personal','guided'].includes(this.session.mode))return false;
      if(this.younger())return this.session.mode==='guided' && this.session.ageGroup===this.options.getAgeGroup();
      return this.session.mode!=='guided' && this.options.getAgeGroup()==='adult';
    }
    async connectGuided() {
      this.busy=true;this.render();
      const ageGroup=this.options.getAgeGroup();
      try {
        const r=await fetch(this.apiBase+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'guided',ageGroup})});
        const data=await r.json();
        if(!r.ok || !data.token)throw Error(data.error || 'Breeze could not connect.');
        if(ageGroup!==this.options.getAgeGroup())return false;
        this.session={...data,apiBase:this.apiBase};sessionStorage.setItem(sessionKey,JSON.stringify(this.session));return true;
      }catch(e){this.status(connectionMessage(e));return false;}
      finally{this.busy=false;this.render();}
    }
    append(role,text,extra={}) {const c=this.ensureChat(extra.mode || this.mode());c.messages.push({id:crypto.randomUUID(),role,text,created:new Date().toISOString(),...extra});c.messages=c.messages.slice(-60);if(role==='user' && c.messages.length===1)c.title=text.slice(0,58);this.save();}
    sendApproved(message,answerId) { if(this.busy)return; const a=this.options.answers[answerId];this.append('user',message,{mode:'library'});this.append('assistant',this.options.translateText(a?.text||'That question is outside the approved library. You can choose an information topic or bring it to your care team.'),{sources:a?.sources||[],mode:'library'});this.render(); }
    async accountHeaders() {
      return globalThis.AlongsideAccount?.token ? {Authorization:'Bearer '+await globalThis.AlongsideAccount.token()} : {};
    }
    async request(path,body,signal) {
      const r=await fetch(this.apiBase+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+this.session.token},body:JSON.stringify(body),signal});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) {
        if(r.status===401)this.disconnect();
        if(this.localBreeze==='live' && data.diagnostic==='key_rejected'){
          throw Error('OpenAI rejected the key used by this Mac. Restart Breeze with a valid project key.');
        }
        throw Error(data.error||'The chat service could not respond. Please try again.');
      }
      return data;
    }
    openMealIdeas() {
      const box=id('chat-message');
      if (!box.value.trim()) box.value='Can you suggest a meal?';
      box.focus();
    }
    async openPersonal(message='', hint) {
      await this.ready;
      if(this.busy || id('personal-connection')?.open)return;
      if(this.session?.mode==='personal')return;
      if(this.session)return;
      if(this.younger())return;
      const d=node('dialog');d.id='personal-connection';d.setAttribute('aria-labelledby','personal-title');
      const title=node('h2','Chat with Breeze');title.id='personal-title';
      const form=node('form','','stack');
      const check=node('input');check.type='checkbox';check.required=true;
      const label=node('label');label.append(check,document.createTextNode('I agree to send my chat messages.'));
      const start=node('button','Start live chat','action');start.type='submit';
      const error=node('p','','status');error.setAttribute('role','status');
      const close=node('button','Close','action outline');close.type='button';close.onclick=()=>d.close();
      const resume=()=>{d.close();this.render();if(message)void this.send(message,hint);};
      form.onsubmit=async event=>{
        event.preventDefault();if(!check.checked || this.younger() || start.disabled)return;
        start.disabled=true;
        try {
          if(!this.apiBase)throw Error('Breeze could not connect. Please try again.');
          const r=await fetch(this.apiBase+'/session',{method:'POST',headers:{'Content-Type':'application/json',...await this.accountHeaders()},body:JSON.stringify({mode:'personal',adult:true,consent:true,ageGroup:'adult'})});
          const result=await r.json();if(!r.ok || !result.token)throw Error(result.error || 'Could not connect.');
          if(!d.open || this.younger())return;
          this.session={...result,apiBase:this.apiBase};sessionStorage.setItem(sessionKey,JSON.stringify(this.session));sessionStorage.removeItem(localChoice);resume();
        }catch(e){error.textContent=connectionMessage(e);}finally{start.disabled=false;}
      };
      form.append(node('p',this.localBreeze==='live'?'This computer sends chat messages to OpenAI. Your profile and check-ins stay on this device.':'Your chat messages go to Cloudflare and OpenAI. Your profile and check-ins stay on this device.'),node('p',this.localBreeze==='live'?'The local server keeps recent messages in memory for up to a day. Your browser keeps chat history until you clear it.':'Cloudflare keeps recent messages for up to a day before scheduled cleanup. This browser keeps your history until you clear it. Provider logs may last longer.'),label,start,close,error);
      d.append(title,form);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
    }
    async send(message,hint) {
      if(this.busy)return;await this.ready;if(this.busy)return;
      if(this.session && !this.matchesProfile())this.disconnect();
      if(!['child','teen','adult'].includes(this.options.getAgeGroup())){location.hash='#profile';return;}
      const previousCalendar=/^\s*can you access(?: it)?\s*\??\s*$/i.test(message) && /calendar/i.test(this.current()?.messages?.at(-1)?.text || '');
      const calendarRequest=/\b(?:cal[ae]nd[ae]r|conflicts?|overlaps?)\b|تقويم/i.test(message);
      const meal=message.match(/\b((?:morning |afternoon |evening |night )?snack|breakfast|lunch|dinner)\b/i);
      const clock=message.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])m\b/i);
      const weekRequest=/plan.{0,40}week|week.{0,40}plan/i.test(message);
      if(this.options.calendarTools && (previousCalendar || (weekRequest && !/food|meal ideas|recipes?|what to (?:eat|cook)/i.test(message)) || calendarRequest || (meal && clock && /remind|schedule/i.test(message))) && !/calorie|weight loss|lose weight/i.test(message)){
        const scope=/tomorrow/i.test(message)?'tomorrow':/today/i.test(message)?'today':meal?'next':'week';
        const time=clock?String(Number(clock[1])%12+(clock[3].toLowerCase()==='p'?12:0)).padStart(2,'0')+':'+(clock[2]||'00'):null;
        const name=meal?meal[1][0].toUpperCase()+meal[1].slice(1).toLowerCase():null;
        id('chat-message').value='';
        this.append('user',message);
        this.append('assistant','Review your meal times against Mac Calendar below.',{action:'week'});
        this.render();await this.options.calendarTools({scope,name,time});return;
      }
      if(requestsReminderSettings(message,this.options.translateText('Set up reminders'))) {
        const input=id('chat-message');if(input.value.trim()===message)input.value='';
        this.append('user',message);
        this.append('assistant',this.options.translateText('Open reminder settings to review your plan and choose where to receive reminders.'),{action:'reminders'});
        this.status('');this.render();return;
      }
      if(this.localBreeze==='unavailable'){
        this.status('Breeze needs a local server with an OpenAI API key to reply. Your message is still here.');
        return;
      }
      if(this.younger() && !this.session && !await this.connectGuided())return;
      if(!this.session)return this.openPersonal(message,hint);
      const input=id('chat-message');if(input.value.trim()===message)input.value='';
      const display=message;if(!display.trim())return;
      const c=this.ensureChat(); const currentId=c.id;const liveId=this.liveConversationId(c);this.append('user',display);const pending=c.messages.at(-1);this.busy=true;this.abort=new AbortController();this.status('');this.render();
      const timer=setTimeout(()=>this.abort.abort(),30000);
      try {const result=await this.request('/chat',{conversationId:liveId,requestId:crypto.randomUUID(),message,language:this.options.getLanguage()},this.abort.signal);
        if(this.state.current!==currentId || this.abort.signal.aborted)return;this.append('assistant',result.reply.text,{...result.reply,mode:c.mode});
        if(result.reply.action==='week')await this.options.calendarTools?.({scope:'week'});
        if(result.reply.endLive){this.disconnect();sessionStorage.setItem(localChoice,'yes');}
      }catch(e){
        if(this.state.current===currentId){
          if(c.messages.at(-1)===pending){
            c.messages.pop();
            if(!input.value)input.value=message;
            this.save();
          }
          this.status(e.name==='AbortError'?'The request took too long. Please try again.':connectionMessage(e));
        }
      }
      finally {clearTimeout(timer);this.busy=false;this.render();}
    }
  };
})();
