"use strict";
(async () => {
  const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  function renderMessages(chat,container) {
    for(const m of chat.messages||[]) {if(!['user','assistant'].includes(m.role)||typeof m.text!=='string')continue;const b=el('div','',m.role==='user'?'bubble user':'bubble');const body=el('p',m.text);body.dataset.userContent='';b.append(el('small',m.role==='user'?'You':'Breeze'),body);
      const links=el('div','','source-links');for(const key of m.sources||[]){const s=globalThis.AlongsideLibrary.medicalSources[key];if(!s)continue;const a=el('a',s.organization);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}if(links.children.length)b.append(links);
      if(m.trace?.length){const d=el('details','','agent-trace');d.append(el('summary','Agent actions'));for(const t of m.trace)d.append(el('p',String(t)));b.append(d);}container.append(b);
    }
  }
  const list=document.getElementById('history-list'), panel=document.getElementById('history-transcript');
  const chats=globalThis.AlongsideChatStore.read().chats.filter(c=>c.mode!=='luna');
  function select(chat){
    const heading=el('h2',chat.title);heading.dataset.userContent='';
    const resume=el('a','Continue this chat','action');
    resume.href='./#support?chat='+encodeURIComponent(chat.id);
    panel.replaceChildren(heading,resume);renderMessages(chat,panel);
    for(const button of list.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.id===chat.id));
  }
  for(const chat of chats){
    const button=el('button','','history-item'),title=el('span',chat.title);
    title.dataset.userContent='';button.type='button';button.dataset.id=chat.id;
    button.append(title,el('small',new Date(chat.created).toLocaleDateString(document.documentElement.lang)));
    button.onclick=()=>select(chat);list.append(button);
  }
  if(chats.length)select(chats[0]);else panel.append(el('p','Your conversations will appear here after you start a chat.','empty-history'));
})();
