'use strict';
globalThis.AlongsideAppleCalendar=(()=>{
  const minute=60000, duration=5*minute;
  const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})$/;
  function parseFragment(fragment){
    if(!fragment.startsWith('#apple-busy='))return null;
    if(fragment.length>18000)throw Error('Too many events');
    const value=decodeURIComponent(fragment.slice('#apple-busy='.length)).trim();
    if(!value)return [];
    const lines=value.split(/\r?\n/);
    if(lines.length>100)throw Error('Too many events');
    return lines.map(line=>{
      const pair=line.split('|');
      if(pair.length!==2 || !pair.every(t=>timestamp.test(t)))throw Error('Invalid busy time');
      const [start,end]=pair.map(Date.parse);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Invalid interval');
      return {start,end};
    });
  }
  function compare(slots,ranges,date,zone,toUTC,now=Date.now()){
    const occupied=start=>ranges.some(r=>r.start<start+duration && r.end>start);
    const format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const moments=slots.map(s=>({...s,start:+toUTC(date,s.time,zone)}));
    function alternative(slot,direction){
      // Stay on this day and keep the order of the person's other planned meals.
      const [hour,min]=slot.time.split(':').map(Number);
      for(let offset=5;offset<=180;offset+=5){
        const value=hour*60+min+direction*offset;
        if(value<0||value>=1440)break;
        const time=[Math.floor(value/60),value%60].map(n=>String(n).padStart(2,'0')).join(':');
        const start=+toUTC(date,time,zone);
        if(direction<0 && start<=now)break;
        if(moments.some(other=>other.id!==slot.id && other.start>=Math.min(start,slot.start) && other.start<=Math.max(start,slot.start)))break;
        if(start>now && format.format(start)===time && !occupied(start))return time;
      }
      return '';
    }
    return moments.filter(s=>s.start>now && occupied(s.start)).map(s=>({
      date,id:s.id,time:s.time,earlier:alternative(s,-1),later:alternative(s,1)
    }));
  }
  return {parseFragment,compare};
})();
