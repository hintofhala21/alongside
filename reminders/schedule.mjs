const minute = 60_000;
export const day = 24 * 60 * minute;

export function readTimes(times) {
  if (!Array.isArray(times) || times.length>48 || times.some(t=>typeof t!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return null;
  return [...new Set(times)].sort();
}

export function readSchedule(input) {
  const times=readTimes(input?.times);
  if (input?.consent!==true || typeof input.timeZone!=='string' || input.timeZone.length>80 || !times?.length) return null;
  try {
    const zone = new Intl.DateTimeFormat('en', {timeZone: input.timeZone}).resolvedOptions().timeZone;
    return {timeZone: zone, times};
  } catch { return null; }
}

function localParts(format, instant) {
  return Object.fromEntries(format.formatToParts(instant).map(p => [p.type, p.value]));
}

// Try the actual offsets around each local date. Nonexistent spring-forward times
// fail the round trip. A repeated autumn time uses its first occurrence only.
export function nextSlot(plan, now, lastKey = '') {
  const format = new Intl.DateTimeFormat('en-GB', {timeZone: plan.timeZone, year:'numeric',
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit',hourCycle:'h23'});
  const local = localParts(format, now);
  const start = Date.UTC(+local.year, +local.month-1, +local.day);
  for (let i=0; i<4; i++) {
    const date = start + i*day;
    const dateKey = new Date(date).toISOString().slice(0,10);
    const offsets = new Set();
    for (const delta of [-day, 0, day]) {
      const instant = date + delta;
      const p = localParts(format, instant);
      offsets.add(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-instant);
    }
    for (const time of plan.times) {
      const key = dateKey+'T'+time;
      if (key === lastKey) continue;
      const [h,m] = time.split(':').map(Number);
      const candidates = [...offsets].map(o=>date+(h*60+m)*minute-o).sort((a,b)=>a-b);
      const first = candidates.find(instant=>{
        const p=localParts(format,instant);
        return [p.year,p.month,p.day].join('-')===dateKey && p.hour+':'+p.minute===time;
      });
      if (first !== undefined && first>now) return {key, at:first};
    }
  }
  throw new Error('No upcoming local time');
}
