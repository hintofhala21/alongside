"use strict";
(() => {
  const key = 'alongside-chat-history-v1';
  const sessionKey = 'alongside-demo-session-v1';
  const node = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
  const id = value => document.getElementById(value);
  const cleanMessage = m => m && ['user','assistant'].includes(m.role) && typeof m.text === 'string' && m.text.length <= 6000;
  const store = {
    read() { try { const v = JSON.parse(localStorage.getItem(key)); return { current: typeof v?.current === 'string' ? v.current : null, chats: Array.isArray(v?.chats) ? v.chats.filter(c => typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages)).slice(0,30).map(c => ({ ...c, messages:c.messages.filter(cleanMessage).slice(-60) })) : [] }; } catch { return {current:null,chats:[]}; } },
    write(value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
    clear() { localStorage.removeItem(key); sessionStorage.removeItem(sessionKey); }
  };
  globalThis.AlongsideChatStore = store;
  globalThis.AlongsideChat = class {
    constructor(options) {
      this.options = options; this.state = store.read(); this.busy = false; this.apiBase = ''; this.session = null;
      try { const s = JSON.parse(sessionStorage.getItem(sessionKey)); if (s?.expires > Date.now()) this.session = s; } catch {}
      this.ready = this.loadConfig(); this.render();
      window.addEventListener('storage', e => { if(e.key === key || e.key === null) { this.cancel(); this.state = store.read(); this.render(); } });
    }
    async loadConfig() {
      try { const r = await fetch(new URL('../config.json', document.currentScript?.src || new URL('./assets/chat.js',location.href)), {cache:'no-store'}); if(!r.ok) return;
        const c = await r.json(); if(c.apiBase) { const u = new URL(c.apiBase); if(u.protocol === 'https:' && u.hostname.endsWith('.workers.dev')) this.apiBase = u.origin; }
      } catch {}
      if(this.session?.apiBase !== this.apiBase) this.disconnect();
      this.render();
    }
    current() { return this.state.chats.find(c => c.id === this.state.current); }
    ensureChat() {
      if(!this.current()) { const c = {id:crypto.randomUUID(),title:'A new conversation',created:new Date().toISOString(),messages:[],mode:this.session ? 'luna' : 'library'}; this.state.chats.unshift(c); this.state.chats = this.state.chats.slice(0,30); this.state.current=c.id; }
      return this.current();
    }
    save() { if(!store.write(this.state)) id('chat-status').textContent='This conversation is available for this visit. Browser storage is unavailable.'; }
    cancel() { this.abort?.abort(); this.busy=false; }
    newChat() { this.cancel(); this.state.current=null; this.save(); this.render(); id('chat-message').focus(); }
    clearLocal() { this.cancel(); store.clear(); this.state={current:null,chats:[]}; this.session=null; this.render(); }
    disconnect() { this.session=null; try { sessionStorage.removeItem(sessionKey); } catch {} }
    status(text) { id('chat-status').textContent=text; }
    render() {
      if(!id('conversation')) return;
      const chat=this.current(); const hasMessages=Boolean(chat?.messages.length);
      id('chat-welcome').hidden=hasMessages; id('chat-options').hidden=hasMessages || this.session?.mode==='synthetic';
      id('chat-mode').textContent=this.session ? 'Luna · '+(this.session.mode==='synthetic'?'fictional demo':'judge demo') : 'Approved library · AI not connected';
      id('connect-demo').textContent=this.session?'Demo options':'Competition demo';
      id('chat-privacy').textContent=this.session ? 'Fictional testing only. Demo messages go to the private AI server; profile details never do.' : 'Library replies stay on this device. No profile details are sent.';
      id('chat-message').disabled=this.busy || this.session?.mode==='synthetic'; id('send-chat').disabled=this.busy || this.session?.mode==='synthetic';
      id('chat-message').placeholder=this.session?.mode==='synthetic'?'Use the fictional scenario buttons below.':'What’s on your mind?';
      const out=id('conversation'); out.replaceChildren();
      for(const m of chat?.messages || []) {
        const b=node('article','',m.role==='user'?'bubble user':'bubble'); const body=node('p',m.text); body.dataset.userContent='';
        b.append(node('small',m.role==='user'?'You':'Alongside'),body);
        const sources=(m.sources||[]).filter(s=>Object.hasOwn(this.options.sources,s));
        if(sources.length) { const links=node('div','','source-links'); for(const s of sources) { const source=this.options.sources[s]; const a=node('a',source.organization); a.href=source.url; a.target='_blank'; a.rel='noopener noreferrer'; links.append(a); } b.append(links); }
        if(m.action && m.action!=='none') { const labels={checkin:'Open a gentle check-in',routine:'Open my routine',care:'Find care',human:'Get human help'}; const a=node('button',labels[m.action]||'View next step','action outline'); a.type='button'; a.addEventListener('click',()=>this.options.onAction(m.action)); b.append(a); }
        if(m.trace?.length) { const d=node('details','','agent-trace'); d.append(node('summary','How Alongside helped')); for(const t of m.trace) d.append(node('p',t)); b.append(d); }
        out.append(b);
      }
      if(this.busy) out.append(node('p','Alongside is considering a small next step…','thinking'));
      id('empty-chats').hidden=this.state.chats.length>0;
      id('recent-chats').replaceChildren(...this.state.chats.map(c=>{ const li=node('li'); const b=node('button',c.title,'action outline'); b.dataset.userContent=''; b.type='button'; b.disabled=this.busy; b.setAttribute('aria-pressed',String(c.id===this.state.current)); b.addEventListener('click',()=>{this.state.current=c.id;this.save();this.render();});li.append(b);return li;}));
      this.renderSynthetic();
      if(hasMessages || this.busy) out.scrollTop=out.scrollHeight;
    }
    renderSynthetic() {
      let row=id('synthetic-scenarios'); if(!row) {row=node('div','','synthetic-scenarios');row.id='synthetic-scenarios';id('chat-form').before(row);}
      row.replaceChildren(); row.hidden=this.session?.mode!=='synthetic'; if(row.hidden)return;
      row.append(node('small','Fictional scenarios — no personal typing is sent.'));
      for(const [scenario,label] of [['meal','A difficult mealtime'],['routine','A busy day'],['support','Asking for support']]) {const b=node('button',label,'action outline');b.type='button';b.disabled=this.busy;b.addEventListener('click',()=>this.send('',null,scenario));row.append(b);}
    }
    append(role,text,extra={}) {const c=this.ensureChat();c.messages.push({id:crypto.randomUUID(),role,text,created:new Date().toISOString(),...extra});c.messages=c.messages.slice(-60);if(role==='user' && c.messages.length===1)c.title=text.slice(0,58);this.save();}
    sendApproved(message,answerId) { if(this.busy)return; const a=this.options.answers[answerId];this.append('user',message);this.append('assistant',this.options.translateText(a?.text||'That question is outside the approved library. You can choose an information topic or bring it to your care team.'),{sources:a?.sources||[],mode:'library'});this.render(); }
    libraryReply(message,hint) {
      const q=message.toLowerCase();let topic=hint;
      if (this.options.getLanguage() === 'fr' && !topic) {
        const matches = [[/ostéoporose|santé des os/, 'boneHealth'], [/signes|symptômes/, 'warningSigns'], [/\bfer\b/, 'ironFood'], [/vitamine d/, 'vitaminDFood'], [/hyperphagie/, 'bingeEating'], [/diagnostic|évaluation/, 'assessment'], [/soutien|aide|équipe/, 'team'], [/repas|collation/, 'after']];
        topic = matches.find(([pattern]) => pattern.test(q))?.[1];
      }
      if (this.options.getLanguage() === 'es' && !topic) {
        const matches = [
          [/\barfid\b/, 'arfid'], [/\bosfed\b/, 'osfed'], [/osteoporosis|salud ósea/, 'boneHealth'],
          [/hierro/, 'ironFood'], [/vitamina d/, 'vitaminDFood'], [/zinc|\bcinc\b/, 'zincFood'],
          [/diagn[oó]stic|evaluaci[oó]n|cuestionario/, 'assessment'], [/atrac[oó]n/, 'bingeEating'],
          [/señales|s[ií]ntomas/, 'warningSigns'], [/apoyo|ayuda|equipo/, 'team'],
          [/comida|colaci[oó]n|merienda/, 'after']
        ];
        topic = matches.find(([pattern]) => pattern.test(q))?.[1];
      }
      if(!this.options.answers[topic]) {
        if(/\barfid\b/.test(q))topic='arfid';else if(/\bosfed\b/.test(q))topic='osfed';else if(/iron|حديد/.test(q))topic='ironFood';else if(/vitamin d|فيتامين د/.test(q))topic='vitaminDFood';else if(/zinc|زنك/.test(q))topic='zincFood';else if(/diagnos|questionnaire|تشخيص/.test(q))topic='assessment';else if(/support|team|help|مساعدة|دعم/.test(q))topic='team';else if(/meal|أكل|وجبة/.test(q))topic='after';
      }
      const a=this.options.answers[topic];
      const action=hint==='checkin'?'checkin':hint==='routine'?'routine':/care|hospital|hôpital|soins|clínica|atención médica|عيادة/.test(q)?'care':null;
      return {text:this.options.translateText(a?.text || (action==='checkin'?'We can take a moment to reflect, one question at a time.':action==='routine'?'Your routine is here when you want a gentle place to start.':'I’m here with you. This is library mode, so I can offer reviewed information and small support steps. Connect the competition demo to try Luna.')),sources:a?.sources||[],action,mode:'library'};
    }
    async request(path,body,signal) {
      const r=await fetch(this.apiBase+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+this.session.token},body:JSON.stringify(body),signal});
      const data=await r.json().catch(()=>({})); if(!r.ok) {if(r.status===401)this.disconnect();throw Error(data.error||'The private demo server could not respond. Please try again.');}return data;
    }
    async send(message,hint,scenario) {
      if(this.busy)return;await this.ready;if(this.busy)return;
      if(!this.session) { if(!message)return;this.append('user',message);this.append('assistant',this.libraryReply(message,hint).text,this.libraryReply(message,hint));this.render();return; }
      const scenarioMessages={meal:'Fictional scenario: Sam has just had a difficult mealtime and wants support.',routine:'Fictional scenario: Sam has a busy day and wants help finding a regular routine.',support:'Fictional scenario: Sam wants to ask a trusted person for support.'};
      if(this.session.mode==='synthetic' && !Object.hasOwn(scenarioMessages,scenario)) {this.status('Choose a fictional scenario.');return;}
      const display=scenario?this.options.translateText(scenarioMessages[scenario]):message;if(!display.trim())return;
      const c=this.ensureChat(); const currentId=c.id;this.append('user',display);this.busy=true;this.abort=new AbortController();this.status('');this.render();
      const timer=setTimeout(()=>this.abort.abort(),30000);
      try {const result=await this.request('/chat',{conversationId:c.id,requestId:crypto.randomUUID(),message:scenario?undefined:message,scenario:scenario||undefined,language:this.options.getLanguage()},this.abort.signal);
        if(this.state.current!==currentId)return;c.mode='luna';this.append('assistant',result.reply.text,{...result.reply,mode:'luna'});
      }catch(e){if(this.state.current===currentId)this.status(e.name==='AbortError'?'The request took too long. Please try again.':e.message);}
      finally {clearTimeout(timer);this.busy=false;this.render();}
    }
    async openConnection() {
      await this.ready;let d=id('demo-connection');if(d)d.remove();d=node('dialog');d.id='demo-connection';d.setAttribute('aria-labelledby','demo-connect-title');
      const title=node('h2','Try the competition demo');title.id='demo-connect-title';d.append(title);
      if(!this.apiBase) {d.append(node('p','The chatbot is prepared, but its private server has not been connected yet. The owner can run the guided setup; visitors never enter an OpenAI key here.'));const a=node('a','Owner setup guide','action outline');a.href='https://github.com/hintofhala21/alongside/blob/main/docs/OPENAI-SETUP.md';a.target='_blank';a.rel='noopener noreferrer';d.append(a);}
      else {
        const form=node('form','','stack');const mode=node('select');mode.id='demo-mode';for(const [v,t]of[['synthetic','Fictional scenarios — any age'],['interactive','Free-text testing — adult judges']]){const o=node('option',t);o.value=v;mode.append(o);}const ml=node('label','Testing mode','field');ml.append(mode);
        const code=node('input');code.type='password';code.id='demo-code';code.required=true;code.maxLength=100;code.autocomplete='off';const cl=node('label','Competition access code','field');cl.append(code);
        const adult=node('input');adult.type='checkbox';const al=node('label','');al.append(adult,document.createTextNode(' I am 18 or older and will use fictional details only.'));al.hidden=true;
        const notice=node('p','Use fictional scenarios. Alongside does not send your profile, check-ins or contact details.');const status=node('p','','status');status.setAttribute('role','status');
        mode.addEventListener('change',()=>{al.hidden=mode.value!=='interactive';adult.required=mode.value==='interactive';});
        const submit=node('button','Start demo','action');submit.type='submit';form.append(ml,cl,al,notice,submit,status);
        form.addEventListener('submit',async e=>{e.preventDefault();if(mode.value==='interactive' && (this.options.getAgeGroup()==='child'||this.options.getAgeGroup()==='teen')){status.textContent='Use fictional scenarios for younger builders. Adult judges can use the free-text option.';return;}submit.disabled=true;
          try {const r=await fetch(this.apiBase+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.value,mode:mode.value,adult:adult.checked})});const result=await r.json();if(!r.ok)throw Error(result.error||'Could not connect.');this.session={...result,apiBase:this.apiBase};sessionStorage.setItem(sessionKey,JSON.stringify(this.session));d.close();this.newChat();}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}});d.append(form);
        if(this.session){const off=node('button','Disconnect demo','action outline');off.type='button';off.addEventListener('click',()=>{this.disconnect();d.close();this.newChat();});d.append(off);}
      }
      const close=node('button','Close','action outline');close.type='button';close.addEventListener('click',()=>d.close());d.append(close);document.body.append(d);d.showModal();
    }
  };
})();
