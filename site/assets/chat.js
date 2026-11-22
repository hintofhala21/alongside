"use strict";
(() => {
  const key = globalThis.AlongsideAccount?.key('alongside-chat-history-v1') ?? 'alongside-chat-history-v1';
  const localChoice = globalThis.AlongsideAccount?.key('alongside-use-library') ?? 'alongside-use-library';
  const sessionKey = globalThis.AlongsideAccount?.key('alongside-demo-session-v1') ?? 'alongside-demo-session-v1';
  const node = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
  const id = value => document.getElementById(value);
  // Only match reviewed library topics; visitor text never leaves this mode.
  const commonTopics = [
    [/\barfid\b|\btare\b|回避・制限性食物摂取症|回避限制性|回避性限制性/, 'arfid'],
    [/\bosfed\b/, 'osfed'],
    [/osteoporos|ostéoporose|骨质疏松|骨粗鬆|骨粗しょう|ऑस्टियोपोरोसिस|هشاشة العظام/, 'boneHealth'],
    [/\biron\b|\bfer\b|hierro|\bferro\b|eisen|铁|鉄分|鉄を|鉄が|आयरन|लौह|حديد/, 'ironFood'],
    [/vitamin[ae]?[- ]?d\b|维生素\s*d|ビタミン\s*d|विटामिन\s*डी|فيتامين د/, 'vitaminDFood'],
    [/zinc|zink|\bcinc\b|锌|亜鉛|जिंक|जस्ता|ज़िंक|زنك/, 'zincFood'],
    [/binge|hyperphagie|atrac[oó]n|compulsão alimentar|essanf[aä]ll|暴食|むちゃ食い|बिंज/, 'bingeEating'],
    [/diagnos|diagn[oó]stic|diagn[oó]s|questionnaire|évaluation|evaluaci[oó]n|avaliação|beurteilung|诊断|评估|診断|評価|निदान|मूल्यांकन|تشخيص/, 'assessment'],
    [/warning signs|symptom|sympt[oô]mes|signes|señales|s[ií]ntomas|sintomas|anzeichen|症状|征兆|लक्षण|علامات/, 'warningSigns'],
    [/support|team|help|soutien|aide|équipe|apoyo|ayuda|equipo|apoio|ajuda|equipe|unterstützung|hilfe|支持|帮助|支援|相談|सहारा|सहायता|मदद|مساعدة|دعم/, 'team'],
    [/meal|repas|collation|comida|colaci[oó]n|merienda|refeição|lanche|mahlzeit|essen|用餐|吃饭|食事|भोजन|खाना|أكل|وجبة/, 'after']
  ];
  const prompts = {
    after:'How can I describe a difficult meal?', team:'How can I ask for company at lunch?',
    arfid:'What is ARFID?', assessment:'Can one meal tell me if I have an eating disorder?',
    note:'Show me a note about a difficult texture.', routine:'Help me find my routine',
    checkin:'Let’s do a gentle check-in', shorter:'Could you put that in one short sentence?'
  };
  // Compare complete general questions locally. A personal draft must never become an API payload.
  const generalWording = {
    arfid:['What does ARFID mean?', 'Can you explain ARFID?', 'Define ARFID'],
    checkin:['How do I start a check-in?', 'How does a check-in work?'],
    routine:['Where can I find my routine?', 'How do I find my routine?'],
    team:['How can I ask someone to sit with me at lunch?'],
    shorter:['Can you make that shorter?', 'Can you say that more simply?']
  };
  function questionKey(text, translate) {
    const normalize = value => value.normalize('NFKC').toLowerCase().trim().replace(/[.!?؟。！？]+$/u,'').replace(/\s+/gu,' ');
    const typed=normalize(text);
    return Object.keys(prompts).find(key=>[prompts[key],translate(prompts[key]),...(generalWording[key]||[])].some(label=>normalize(label)===typed));
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
      this.ready = this.loadConfig(); this.render();
      window.addEventListener('storage', e => { if(e.key === key || e.key === null) { this.cancel(); this.state = store.read(); this.render(); } });
    }
    async loadConfig() {
      try { const r = await fetch(new URL('../config.json', document.currentScript?.src || new URL('./assets/chat.js',location.href)), {cache:'no-store'}); if(!r.ok) throw Error('Configuration unavailable');
        const c = await r.json(); if(c.apiBase) { const u = new URL(c.apiBase); if(u.protocol === 'https:' && u.hostname.endsWith('.workers.dev')) this.apiBase = u.origin; }
      } catch {}
      if(this.session?.apiBase !== this.apiBase) this.disconnect();
      this.render();
    }
    current() { return this.state.chats.find(c => c.id === this.state.current); }
    younger() { return globalThis.AlongsideAccount?.kids || ['child','teen'].includes(this.options.getAgeGroup()); }
    mode() { return ['guided','personal'].includes(this.session?.mode) ? 'personal' : this.session ? 'luna' : 'library'; }
    ensureChat(mode=this.mode()) {
      const current=this.current();
      if(!current || current.mode!==mode || (mode!=='library' && current.sessionExpires!==this.session?.expires)) { const c = {id:crypto.randomUUID(),title:'A new conversation',created:new Date().toISOString(),messages:[],mode,sessionExpires:mode==='library'?undefined:this.session?.expires}; this.state.chats.unshift(c); this.state.chats = this.state.chats.slice(0,30); this.state.current=c.id; }
      return this.current();
    }
    save() { if(!store.write(this.state)) id('chat-status').textContent='This conversation is available for this visit. Browser storage is unavailable.'; }
    cancel() { this.abort?.abort(); this.busy=false; }
    newChat() { this.status(''); this.cancel(); this.state.current=null; this.save(); this.render(); id('chat-message').focus(); }
    clearLocal() { this.cancel(); store.clear(); this.state={current:null,chats:[]}; this.session=null; this.render(); }
    disconnect() { this.session=null; try { sessionStorage.removeItem(sessionKey); } catch {} }
    status(text) { id('chat-status').textContent=text; }
    render() {
      if(!id('conversation')) return;
      if(this.session && !this.matchesProfile()){this.cancel();this.disconnect();}
      const guided=this.younger();
      const synthetic=this.session?.mode==='synthetic';
      const chat=this.current(); const hasMessages=Boolean(chat?.messages.length);
      id('chat-welcome').hidden=hasMessages;
      id('chat-mode').textContent=this.options.translateText('Breeze');
      id('chat-privacy').textContent=this.options.translateText(guided
        ? 'You can type a general question such as “What is ARFID?” or choose one below. Personal messages cannot be sent from this profile yet.'
        : 'Your messages go to OpenAI only after you agree.');
      id('chat-message').hidden=synthetic;
      id('send-chat').hidden=synthetic;
      id('chat-message').disabled=this.busy || synthetic;
      id('send-chat').disabled=this.busy || synthetic;
      const out=id('conversation'); out.replaceChildren();
      for(const m of chat?.messages || []) {
        const b=node('article','',m.role==='user'?'bubble user':'bubble'); const body=node('p',m.text); body.dataset.userContent='';
        b.append(node('small',m.role==='user'?'You':this.options.translateText('Breeze')),body);
        const sources=(m.sources||[]).filter(s=>Object.hasOwn(this.options.sources,s));
        if(sources.length) { const links=node('div','','source-links'); for(const s of sources) { const source=this.options.sources[s]; const a=node('a',source.organization); a.href=source.url; a.target='_blank'; a.rel='noopener noreferrer'; links.append(a); } b.append(links); }
        if(m.action && m.action!=='none') { const labels={meals:'Ask for meal ideas',checkin:'Open a gentle check-in',routine:'Open my routine',care:'Find care',human:'Get human help'}; const a=node('button',labels[m.action]||'View next step','action outline'); a.type='button'; a.addEventListener('click',()=>this.options.onAction(m.action)); b.append(a); }
        if(m.trace?.length) { const d=node('details','','agent-trace'); d.append(node('summary','How Alongside helped')); for(const t of m.trace) d.append(node('p',t)); b.append(d); }
        out.append(b);
      }
      if(this.busy) out.append(node('p','Alongside is considering a small next step…','thinking'));
      id('empty-chats').hidden=this.state.chats.length>0;
      id('recent-chats').replaceChildren(...this.state.chats.map(c=>{ const li=node('li'); const b=node('button',c.title,'action outline'); b.dataset.userContent=''; b.type='button'; b.disabled=this.busy; b.setAttribute('aria-pressed',String(c.id===this.state.current)); b.addEventListener('click',()=>{this.state.current=c.id;this.save();this.render();});li.append(b);return li;}));
      this.renderSynthetic();
      this.renderQuestions(!synthetic);
      if(hasMessages || this.busy) out.scrollTop=out.scrollHeight;
    }
    matchesProfile() {
      if(this.session.expires<=Date.now())return false;
      if(this.session.mode==='synthetic')return true;
      if(this.younger())return this.session.mode==='guided' && this.session.ageGroup===this.options.getAgeGroup();
      return this.session.mode!=='guided' && this.options.getAgeGroup()==='adult';
    }
    renderQuestions(show) {
      const row=id('prepared-questions');
      row.replaceChildren();row.hidden=!show;if(!show)return;
      for(const [key,label] of Object.entries(prompts)){
        if(key==='shorter' && !this.current()?.messages?.length)continue;
        const text=this.options.translateText(label);
        const button=node('button',text);button.type='button';button.disabled=this.busy;
        button.onclick=()=>this.send(text,null,this.younger()?key:undefined);row.append(button);
      }
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
      }catch(e){this.status(e.message);return false;}
      finally{this.busy=false;this.render();}
    }
    renderSynthetic() {
      let row=id('synthetic-scenarios'); if(!row) {row=node('div','','synthetic-scenarios');row.id='synthetic-scenarios';id('chat-form').before(row);}
      row.replaceChildren(); row.hidden=this.session?.mode!=='synthetic'; if(row.hidden)return;
      row.append(node('small','Fictional scenarios — no personal typing is sent.'));
      for(const [scenario,label] of [['meal','A difficult mealtime'],['routine','A busy day'],['support','Asking for support']]) {const b=node('button',label,'action outline');b.type='button';b.disabled=this.busy;b.addEventListener('click',()=>this.send('',null,scenario));row.append(b);}
    }
    append(role,text,extra={}) {const c=this.ensureChat(extra.mode || this.mode());c.messages.push({id:crypto.randomUUID(),role,text,created:new Date().toISOString(),...extra});c.messages=c.messages.slice(-60);if(role==='user' && c.messages.length===1)c.title=text.slice(0,58);this.save();}
    sendApproved(message,answerId) { if(this.busy)return; const a=this.options.answers[answerId];this.append('user',message,{mode:'library'});this.append('assistant',this.options.translateText(a?.text||'That question is outside the approved library. You can choose an information topic or bring it to your care team.'),{sources:a?.sources||[],mode:'library'});this.render(); }
    libraryReply(message,hint) {
      const q = message.normalize('NFKC').toLowerCase();
      const topic = hint || commonTopics.find(([pattern]) => pattern.test(q))?.[1];
      const a=this.options.answers[topic];
      const action=hint==='checkin'?'checkin':hint==='routine'?'routine':/care|hospital|hôpital|soins|clínica|atención médica|krankenhaus|klinik|医院|病院|अस्पताल|عيادة/.test(q)?'care':null;
      return {text:this.options.translateText(a?.text || (action==='checkin'?'We can take a moment to reflect, one question at a time.':action==='routine'?'Your routine is here when you want a gentle place to start.':'I’m here with you. This is library mode, so I can offer reviewed information and small support steps. You can ask about a library topic or open a check-in.')),sources:a?.sources||[],action,mode:'library'};
    }
    async accountHeaders() {
      return globalThis.AlongsideAccount?.token ? {Authorization:'Bearer '+await globalThis.AlongsideAccount.token()} : {};
    }
    async request(path,body,signal) {
      const r=await fetch(this.apiBase+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+this.session.token},body:JSON.stringify(body),signal});
      const data=await r.json().catch(()=>({})); if(!r.ok) {if(r.status===401)this.disconnect();throw Error(data.error||'The private demo server could not respond. Please try again.');}return data;
    }
    openMealIdeas(message='') {
      globalThis.AlongsideMeals.open(id('meal-ideas-chat'),{...this.options,onClose:()=>id('ask-meals').focus()},message);
    }
    async openPersonal(message='', hint) {
      await this.ready;
      if(this.busy || id('personal-connection')?.open)return;
      if(this.session?.mode==='personal')return;
      if(this.session) return this.openConnection();
      if(this.younger())return;
      const d=node('dialog');d.id='personal-connection';d.setAttribute('aria-labelledby','personal-title');
      const title=node('h2','Chat with Breeze');title.id='personal-title';
      const form=node('form','','stack');
      const check=node('input');check.type='checkbox';check.required=true;
      const label=node('label');label.append(check,document.createTextNode('I am 18 or older and agree to send my chat messages.'));
      const start=node('button','Start live chat','action');start.type='submit';
      const error=node('p','','status');error.setAttribute('role','status');
      const close=node('button','Close','action outline');close.type='button';close.onclick=()=>d.close();
      const resume=()=>{d.close();this.newChat();if(message)void this.send(message,hint);};
      form.onsubmit=async event=>{
        event.preventDefault();if(!check.checked || this.younger() || start.disabled)return;
        start.disabled=true;
        try {
          if(!this.apiBase)throw Error('Breeze could not connect. Please try again.');
          const r=await fetch(this.apiBase+'/session',{method:'POST',headers:{'Content-Type':'application/json',...await this.accountHeaders()},body:JSON.stringify({mode:'personal',adult:true,consent:true,ageGroup:'adult'})});
          const result=await r.json();if(!r.ok || !result.token)throw Error(result.error || 'Could not connect.');
          if(!d.open || this.younger())return;
          this.session={...result,apiBase:this.apiBase};sessionStorage.setItem(sessionKey,JSON.stringify(this.session));sessionStorage.removeItem(localChoice);resume();
        }catch(e){error.textContent=e.message;}finally{start.disabled=false;}
      };
      form.append(node('p','Your chat messages go to Cloudflare and OpenAI. Your profile and check-ins stay on this device.'),node('p','Cloudflare keeps recent messages for up to a day before scheduled cleanup. This browser keeps your history until you clear it. Provider logs may last longer.'),label,start,close,error);
      d.append(title,form);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
    }
    async send(message,hint,scenario) {
      if(this.busy)return;await this.ready;if(this.busy)return;
      if(this.session && !this.matchesProfile())this.disconnect();
      if(!['child','teen','adult'].includes(this.options.getAgeGroup())){location.hash='#profile';return;}
      if(globalThis.AlongsideMeals?.request(message) && !scenario){this.openMealIdeas(message);return;}
      if(this.younger() && this.session?.mode!=='synthetic'){
        scenario ||= questionKey(message,text=>this.options.translateText(text));
        if(!scenario){
          this.status(this.options.translateText('Your message is still in the box. It was not sent. This profile can currently send general questions from the suggestions.'));
          return;
        }
        if(!this.session && !await this.connectGuided())return;
      }
      if(!this.session)return this.openPersonal(message,hint);
      const input=id('chat-message');if(input.value.trim()===message)input.value='';
      const scenarioMessages={meal:'Fictional scenario: Sam has just had a difficult mealtime and wants support.',routine:'Fictional scenario: Sam has a busy day and wants help finding a regular routine.',support:'Fictional scenario: Sam wants to ask a trusted person for support.'};
      if(this.session.mode==='synthetic' && !Object.hasOwn(scenarioMessages,scenario)) {this.status('Choose a fictional scenario.');return;}
      const display=scenario && this.session.mode==='synthetic'?this.options.translateText(scenarioMessages[scenario]):message;if(!display.trim())return;
      const c=this.ensureChat(); const currentId=c.id;this.append('user',display);this.busy=true;this.abort=new AbortController();this.status('');this.render();
      const timer=setTimeout(()=>this.abort.abort(),30000);
      try {const result=await this.request('/chat',{conversationId:c.id,requestId:crypto.randomUUID(),message:scenario?undefined:message,scenario:scenario||undefined,language:this.options.getLanguage()},this.abort.signal);
        if(this.state.current!==currentId || this.abort.signal.aborted)return;this.append('assistant',result.reply.text,{...result.reply,mode:c.mode});
        if(result.reply.endLive){this.disconnect();sessionStorage.setItem(localChoice,'yes');}
      }catch(e){if(this.state.current===currentId)this.status(e.name==='AbortError'?'The request took too long. Please try again.':e.message);}
      finally {clearTimeout(timer);this.busy=false;this.render();}
    }
    async openConnection(invite = '') {
      await this.ready;let d=id('demo-connection');if(d)d.remove();d=node('dialog');d.id='demo-connection';d.setAttribute('aria-labelledby','demo-connect-title');
      const title=node('h2','Try the competition demo');title.id='demo-connect-title';d.append(title);
      if(!this.apiBase) {d.append(node('p','The chatbot is prepared, but its private server has not been connected yet. The owner can run the guided setup; visitors never enter an OpenAI key here.'));const a=node('a','Owner setup guide','action outline');a.href='https://github.com/hintofhala21/alongside/blob/main/docs/OPENAI-SETUP.md';a.target='_blank';a.rel='noopener noreferrer';d.append(a);}
      else {
        const form=node('form','','stack');const mode=node('select');mode.id='demo-mode';for(const [v,t]of[['synthetic','Fictional scenarios — any age'],['interactive','Free-text testing — adult judges']]){const o=node('option',t);o.value=v;mode.append(o);}const ml=node('label','Testing mode','field');ml.append(mode);
        const code=node('input');code.type='password';code.id='demo-code';code.required=true;code.maxLength=100;code.autocomplete='off';const cl=node('label','Competition access code','field');cl.append(code);
        const adult=node('input');adult.type='checkbox';const al=node('label','');al.append(adult,document.createTextNode(' I am 18 or older and will use fictional details only.'));al.hidden=true;
        const notice=node('p','Use fictional scenarios. Alongside does not send your profile, check-ins or contact details.');const status=node('p','','status');status.setAttribute('role','status');
        if (typeof invite === 'string' && invite) {
          code.value=invite;
          mode.value='interactive'; al.hidden=false; adult.required=true;
        }
        mode.addEventListener('change',()=>{al.hidden=mode.value!=='interactive';adult.required=mode.value==='interactive';});
        const submit=node('button','Start demo','action');submit.type='submit';form.append(ml,cl,al,notice,submit,status);
        form.addEventListener('submit',async e=>{e.preventDefault();if(mode.value==='interactive' && (this.options.getAgeGroup()==='child'||this.options.getAgeGroup()==='teen')){status.textContent='Use fictional scenarios for younger builders. Adult judges can use the free-text option.';return;}submit.disabled=true;
          try {const r=await fetch(this.apiBase+'/session',{method:'POST',headers:{'Content-Type':'application/json',...await this.accountHeaders()},body:JSON.stringify({code:code.value,mode:mode.value,adult:adult.checked})});const result=await r.json();if(!r.ok)throw Error(result.error||'Could not connect.');this.session={...result,apiBase:this.apiBase};sessionStorage.setItem(sessionKey,JSON.stringify(this.session));d.close();this.newChat();}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}});d.append(form);
        if(this.session){const off=node('button','Disconnect demo','action outline');off.type='button';off.addEventListener('click',()=>{this.disconnect();d.close();this.newChat();});d.append(off);}
      }
      const close=node('button','Close','action outline');close.type='button';close.addEventListener('click',()=>d.close());d.append(close);document.body.append(d);d.showModal();
    }
  };
})();
