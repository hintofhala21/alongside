const names = Object.freeze({
  breakfast: 'Breakfast', morning: 'Morning snack', lunch: 'Lunch', afternoon: 'Afternoon snack',
  dinner: 'Dinner', evening: 'Evening snack', water: 'Water reminder', checkin: 'Daily check-in'
});
export const DAY = 86400000;
export function isLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(value+'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === value;
}

const wallTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function datedEntries(rows, slotIds) {
  if (!Array.isArray(rows) || rows.length > 8) throw Error('Invalid dated reminders');
  const seen = new Set();
  return rows.map(row=>{
    if (!row || Object.keys(row).some(k=>!['date','id','time'].includes(k)) ||
        !isLocalDate(row.date) || !slotIds.has(row.id) || typeof row.time !== 'string' || !wallTime.test(row.time))
      throw Error('Invalid dated reminder');
    const key=row.date+'/'+row.id;
    if (seen.has(key)) throw Error('Duplicate dated reminder');
    seen.add(key);
    return {date:row.date,id:row.id,time:row.time};
  });
}
export function normalizePlan(input) {
  if (!input || Object.keys(input).some(key => !['slots','timeZone','discreet','overrides','conflicts'].includes(key)) ||
      typeof input.timeZone !== 'string' || input.timeZone.length > 80 || typeof input.discreet !== 'boolean' ||
      !Array.isArray(input.slots) || input.slots.length < 1 || input.slots.length > 8) throw Error('Invalid plan');
  const zone = new Intl.DateTimeFormat('en', {timeZone: input.timeZone}).resolvedOptions().timeZone;
  const seen = new Set();
  const slots = input.slots.map(slot => {
    if (!slot || Object.keys(slot).some(key => !['id', 'time'].includes(key)) || typeof slot.id !== 'string' || !Object.hasOwn(names, slot.id) ||
        seen.has(slot.id) || typeof slot.time !== 'string' || !wallTime.test(slot.time)) throw Error('Invalid reminder');
    seen.add(slot.id);
    return {id: slot.id, time: slot.time};
  });
  const plan = {timeZone: zone, discreet: input.discreet, slots};
  for (const key of ['overrides','conflicts']) {
    if (input[key] === undefined) continue;
    const entries = datedEntries(input[key],seen);
    if (entries.length) plan[key] = entries;
  }
  return plan;
}
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

// A feed publishes individual UTC events. Calendar apps need no matching time-zone definition,
// and events retain their UID across schedule changes, including a change of time zone.
export function* calendarOccurrences(plan, {expires}, now, days = 28) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: plan.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  function scene(ms) {
    const p = Object.fromEntries(fmt.formatToParts(ms).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month-1, p.day, p.hour, p.minute);
  }
  const offset = t => scene(t) - t;
  const today = Math.floor(scene(now) / DAY)*DAY;
  for (let i = 0; i < days; i++) {
    const day = today + i*DAY;
    // Surround each local date with offsets on both sides, including half-hour DST changes.
    const earlier = offset(day-DAY);
    const later = offset(day+DAY);
    const date = new Date(day).toISOString().slice(0,10);
    for (const recurring of plan.slots) {
      const override = plan.overrides?.find(row=>row.date===date && row.id===recurring.id);
      const slot = override ? {id:recurring.id,time:override.time} : recurring;
      const [hour, minute] = slot.time.split(':').map(Number);
      const wall = day + (hour*60+minute)*60000;
      let start = wall-earlier;
      if (earlier !== later) {
        // First occurrence on a fall-back; on a spring-forward, move ahead by the skipped interval.
        const candidates = [start, wall-later].sort((a,b) => a-b);
        start = candidates.find(t => scene(t) === wall) ?? wall-earlier;
      }
      if (start >= expires) continue;
      yield {slot, start, date: date.replaceAll('-','')};
    }
  }
}

export function calendarFeed(plan, {uid, revised, sequence, expires}, now) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Alongside//Plan//EN','CALSCALE:GREGORIAN',
    'METHOD:PUBLISH','X-WR-CALNAME:Alongside reminders','REFRESH-INTERVAL;VALUE=DURATION:PT6H','X-PUBLISHED-TTL:PT6H'];
  for (const {slot,start,date} of calendarOccurrences(plan,{expires},now)) {
    const title = plan.discreet ? 'Reminder' : names[slot.id];
    lines.push('BEGIN:VEVENT', 'UID:'+uid+'-'+date+'-'+Object.keys(names).indexOf(slot.id)+'@alongside', 'DTSTAMP:'+stamp(revised),
        'SEQUENCE:'+sequence,'DTSTART:'+stamp(start),'DTEND:'+stamp(start+5*60000),'SUMMARY:'+title,'TRANSP:TRANSPARENT',
        'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0S','DESCRIPTION:'+title,'END:VALARM','END:VEVENT');
  }
  return [...lines,'END:VCALENDAR',''].join('\r\n');
}
