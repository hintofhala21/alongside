// Owner-only scheduling reads the same event occurrences as the subscribed calendar.
import {calendarOccurrences} from '../calendar/feed.mjs';

const meals = new Set(['breakfast','lunch','dinner']);

export function nextPersonalMeal(record, now, stopAt, alreadySent = []) {
  if (!record || !Number.isFinite(stopAt) || now >= stopAt) return null;
  let next = null;
  for (const {slot,start,date} of calendarOccurrences(record.plan,record,now,3)) {
    if (!meals.has(slot.id) || start <= now || start >= stopAt) continue;
    const key = date + '-' + slot.id;
    if (alreadySent.includes(key) || (next && next.start <= start)) continue;
    next = {key, start, meal:slot.id};
  }
  return next;
}

export async function sendPersonalMeal(endpoint, due, plan, fetcher = fetch) {
  const url = new URL(endpoint);
  if (url.origin !== 'https://mcp.zapier.com' || url.pathname !== '/api/v1/connect' || url.username || url.password)
    throw Error('Invalid Zapier endpoint');
  const headers = {'Content-Type':'application/json', Accept:'application/json, text/event-stream'};
  async function rpc(method, params, id) {
    const response = await fetcher(url, {method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(15000),
      body:JSON.stringify({jsonrpc:'2.0',method,params,id})});
    if (!response.ok) throw Error('Zapier request failed');
    const session = response.headers.get('Mcp-Session-Id');
    if (session) headers['Mcp-Session-Id'] = session;
    if (id === undefined) { await response.body?.cancel(); return; }
    const body = await response.text();
    const packets = response.headers.get('Content-Type')?.includes('text/event-stream')
      ? body.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)))
      : [JSON.parse(body)];
    const reply = packets.find(packet=>packet.id===id);
    if (!reply?.result || reply.error || reply.result.isError) throw Error('Zapier action unavailable');
    return reply.result;
  }
  const init = await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'alongside-personal-meals',version:'1'}},1);
  headers['MCP-Protocol-Version'] = init.protocolVersion;
  await rpc('notifications/initialized',{});
  const time = new Intl.DateTimeFormat('en',{hour:'numeric',minute:'2-digit',timeZone:plan.timeZone}).format(due.start);
  const wording = {breakfast:'breakfast time', lunch:'lunchtime', dinner:'dinnertime'};
  const event = plan.discreet ? 'A little reminder from Breeze 🌿' :
    'A little reminder from Breeze: it’s '+wording[due.meal]+' 🌿';
  await rpc('tools/call',{name:'execute_zapier_write_action',arguments:{selected_api:'WhatsAppNotificationsCLIAPI',
    action:'send_message',tool_name:'whatsapp_notifications_send_message',params:{template:'calendar_reminder',
      dynamic_properties:{event_name:event,date_and_time:time}}}},2);
}
