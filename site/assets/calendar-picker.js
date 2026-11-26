'use strict';
if(location.origin==='http://127.0.0.1:4174'){
  const get=id=>document.getElementById(id);
  const planner=new URLSearchParams(location.search).get('from')==='breeze'?'http://127.0.0.1:4175/':'./';
  document.querySelector('.calendar-guide > a').href=planner+'#plan';
  get('mac-pick').hidden=false;
  get('picker-download').hidden=true;
  const list=get('pick-list'), status=get('pick-status'), review=get('review-times');
  const formatter=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  get('load-times').onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;list.replaceChildren();review.hidden=true;status.textContent='Checking Mac Calendar…';
    try{
      const now=new Date(), end=new Date(now);end.setHours(0,0,0,0);end.setDate(end.getDate()+7);
      const times=(await AlongsideAppleCalendar.readMacBusy()).filter(r=>r.end>+now && r.start<+end).sort((a,b)=>a.start-b.start);
      for(const range of times){
        const label=document.createElement('label'), box=document.createElement('input');
        box.type='checkbox';box.value=new Date(range.start).toISOString()+'|'+new Date(range.end).toISOString();
        label.className='calendar-time';label.append(box,formatter.formatRange(range.start,range.end));list.append(label);
      }
      status.textContent=times.length?'Select the times to include.':'No busy times found for the next seven days.';
      review.hidden=!times.length;review.disabled=true;
    }catch{status.textContent='Could not read Mac Calendar. Return to My Plan and check the Mac Calendar connection.';}
    finally{button.disabled=false;}
  };
  list.onchange=()=>{
    const n=list.querySelectorAll('input:checked').length;
    status.textContent=n>100?'Choose up to 100 busy times.':n+' selected';
    review.disabled=n===0 || n>100;
  };
  review.onclick=()=>{
    const value=Array.from(list.querySelectorAll('input:checked'),b=>b.value).join('\n');
    location.assign(planner+'#week-busy='+encodeURIComponent(value));
  };
}
