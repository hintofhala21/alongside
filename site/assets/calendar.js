'use strict';
globalThis.AlongsideCalendar = (() => {
  const endpoint='https://alongside-calendar.alongside-waicy-demo.workers.dev';
  const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
  const kinds={breakfast:'Breakfast',morning:'Morning snack',lunch:'Lunch',afternoon:'Afternoon snack',
    dinner:'Dinner',evening:'Evening snack',water:'Water reminder',checkin:'Daily check-in'};

  function mount({container,storage,getProfileId,getPlan,canShare,translate = text=>text,fetcher = fetch,base = endpoint}) {
    let current='', reviewing=false, busy=false, status='', manualLink=false;
    let chain=Promise.resolve();
    function read(id) {
      if (!id)return null;
      const stored=JSON.parse(storage.getItem('alongside-calendar:'+id) || 'null');
      return stored && /^[a-f0-9]{64}$/.test(stored.key) && /^[a-f0-9]{64}$/.test(stored.id) ? stored : null;
    }
    function save(id,entry){storage.setItem('alongside-calendar:'+id,JSON.stringify(entry));}
    function clear(id){storage.removeItem('alongside-calendar:'+id);}
    function enqueue(fn) {
      const result=chain.then(fn);
      chain=result.catch(()=>{});
      return result;
    }
    function planFor(id) {
      if (!id || getProfileId()!==id || canShare?.()!==true)return null;
      const plan=getPlan();
      return {timeZone:plan.timeZone,discreet:plan.discreet,slots:plan.slots.map(s=>({id:s.id,time:s.time})),
        ...(plan.overrides?.length?{overrides:plan.overrides}:{}),...(plan.conflicts?.length?{conflicts:plan.conflicts}:{})};
    }
    async function makeEntry(id) {
      const key=hex(crypto.getRandomValues(new Uint8Array(32)));
      const readKey=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Alongside calendar read '+key)));
      const entry={key,id:readKey,active:false};
      save(id,entry); // Persist ownership before the remote operation, including retry after a lost response.
      return entry;
    }
    async function publish(id,creating,force=false) {
      if (!planFor(id))return;
      let entry=read(id);
      if (!entry && !creating)return;
      if (!entry)entry=await makeEntry(id);
      const plan=planFor(id);
      if (!plan)return;
      const signature=JSON.stringify(plan);
      if(entry.active && entry.signature===signature && !force)return;
      const headers={Authorization:'Bearer '+entry.key,'Content-Type':'application/json'};
      if (!entry.active)headers['If-None-Match']='*';
      const reply=await fetcher(base+'/v1/plans/'+entry.id,{method:'PUT',headers,body:signature,credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
      if(reply.status===410){clear(id);throw Error('expired');}
      if(!reply.ok)throw Error('update');
      const {expires,personalAlertsAvailable}=await reply.json();
      // Other tabs may have just disconnected while this tab waited for a reply.
      if (read(id)?.key!==entry.key)return;
      save(id,{...entry,active:true,signature,expires,personalAlertsAvailable:personalAlertsAvailable===true});
    }
    async function disconnect() {
      const id=getProfileId();
      return enqueue(async()=>{
        const entry=read(id);
        if (!entry)return true;
        const response=await fetcher(base+'/v1/plans/'+entry.id,{method:'DELETE',headers:{Authorization:'Bearer '+entry.key},
          credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
        if(!response.ok && response.status!==410)throw Error('disconnect');
        clear(id);reviewing=false;manualLink=false;status='Sharing stopped. Remove the subscription in your calendar app to clear saved events.';render();
        return true;
      });
    }
    function item(tag,text='',css='') {
      const el=document.createElement(tag);if (text)el.textContent=translate(text);if(css)el.className=css;return el;
    }
    function button(label,fn) {
      const el=item('button',label,'action outline');el.type='button';el.disabled=busy;el.addEventListener('click',fn);return el;
    }
    function link(label,url){
      const el=item('a',label,'action outline');el.href=url;el.rel='noreferrer noopener';el.referrerPolicy='no-referrer';return el;
    }
    function run(fn,okMessage) {
      if (busy)return;
      busy=true;status='';render();
      return fn().then(()=>{status=okMessage;},error=>{
        status=error.message==='expired'?'This subscription expired. Connect again to get a new link.':'Could not reach the calendar service. Please try again.';
      }).finally(()=>{busy=false;render();});
    }
    function render(){
      const id=getProfileId();
      if(id!==current){current=id;reviewing=false;manualLink=false;status='';}
      container.replaceChildren();
      if(!id || canShare?.()!==true){container.hidden=true;return;}
      container.hidden=false;
      let saved=read(id);
      if (saved?.active && saved.expires<=Date.now()){clear(id);saved=null;status='This subscription expired. Connect again to get a new link.';}
      const title=item('h3','Connect your calendar');
      container.append(title);
      if (!saved?.active){
        if(!reviewing && !saved){
          container.append(button('Review calendar connection',()=>{reviewing=true;status='';render();}));
          if (status){const note=item('p',status,'status');note.setAttribute('role','status');container.append(note);}
          return;
        }
        const plan=planFor(id);
        container.append(item('p','Allow Alongside to share these reminder times and your time zone through a private calendar link? Anyone with the link can read the events.'));
        const preview=item('ul');
        plan.slots.forEach(s=>preview.append(item('li',translate(kinds[s.id])+' · '+s.time)));
        container.append(preview,item('small',plan.timeZone));
        container.append(item('p',plan.discreet?'Calendar event titles will say “Reminder”.':'Your calendar will show meal, snack and other reminder names.'));
        container.append(item('p','The link expires after 90 days unless you update or renew it. Stop sharing before clearing this profile or starting a fresh visit.'));
        container.append(button('Allow calendar sharing',()=>run(()=>enqueue(()=>publish(id,true)),'Choose your calendar below and confirm the subscription there.')));
        container.append(button('Cancel',()=>{if(saved)return run(()=>disconnect(),'Sharing stopped.');reviewing=false;status='';render();}));
      } else {
        const feed=base+'/v1/plans/'+saved.id+'.ics';
        container.append(item('p','Choose your calendar and confirm there. Your app controls refresh times and notification settings.'));
        const open=link('Open calendar app',feed.replace(/^https:/,'webcal:'));
        container.append(open,button('Use Google Calendar or Outlook',()=>{manualLink=!manualLink;render();}));
        if(manualLink){
          container.append(item('p','Google Calendar on a computer: Other calendars → From URL. Outlook: Add calendar → Subscribe from web. Paste the private link and confirm.'));
          const label=item('label','Private calendar link','field'),input=item('input');
          input.readOnly=true;input.type='text';input.value=feed;input.dir='ltr';label.append(input);container.append(label);
          container.append(button('Copy private link',async()=>{
            try {await navigator.clipboard.writeText(feed);status='Private link copied.';}
            catch {input.focus();input.select();return;}
            render();
          }));
          for (const [name,url] of [['Google Calendar','https://calendar.google.com/calendar/u/0/r/settings/addbyurl'],['Outlook','https://outlook.live.com/calendar/']]) {
            const provider=link(name,url);provider.target='_blank';container.append(provider);
          }
        }
        if(saved.expires)container.append(item('small',translate('Link expires')+' · '+new Date(saved.expires).toLocaleDateString(document.documentElement.lang||'en')));
        container.append(button('Update or renew subscription',()=>run(()=>enqueue(()=>publish(id,false,true)),'Calendar feed updated. Your calendar app chooses when to refresh.')));
        container.append(button('Stop calendar sharing',()=>run(()=>disconnect(),'Sharing stopped. Remove the subscription in your calendar app to clear saved events.')));
      }
      if(status || busy){const note=item('p',busy?'Connecting…':status,'status');note.setAttribute('role','status');container.append(note);}
    }
    function refresh(){
      // Profile edits can arrive in bursts. Read the current plan only when a queued update runs.
      const id=getProfileId();render();
      const plan=planFor(id);
      if(!id || !plan || !read(id)?.active)return Promise.resolve(true);
      return enqueue(()=>publish(id,false)).then(()=>{render();return true;},error=>{
        status=error.message==='expired'?'This subscription expired. Connect again to get a new link.':'Calendar update pending. Use the update button to retry.';
        render();return error.message==='expired';
      });
    }
    refresh();
    return {refresh,disconnect,personalAlertsAvailable:()=>Boolean(read(getProfileId())?.personalAlertsAvailable),isConnected:()=>Boolean(read(getProfileId())?.active)};
  }
  return {mount};
})();
