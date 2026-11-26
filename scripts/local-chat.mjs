// Local sessions and conversation data live only in this process.
import { AlongsideHub } from '../api/worker.mjs';

export function localChat(origin, env) {
  const records = new Map();
  let pending = Promise.resolve();
  const storage = {
    get: key => structuredClone(records.get(key)),
    put: (key, value) => records.set(key, structuredClone(value)),
    delete: key => records.delete(key),
    getAlarm: () => true,
    transaction(fn) {
      const work = pending.then(() => fn(storage));
      pending = work.catch(() => {});
      return work;
    }
  };
  const cleanup = setInterval(() => {
    for (const [key,value] of records) if (value.expires <= Date.now()) records.delete(key);
  }, 60000);
  cleanup.unref();
  const hub = new AlongsideHub({storage}, {...env, RATE_SALT: crypto.randomUUID()});
  return async function handle(request, response, path) {
    response.setHeader('Cache-Control','no-store');
    if (request.headers.host !== new URL(origin).host || request.headers.origin !== origin ||
        request.method !== 'POST' || !['/breeze/session','/breeze/chat','/breeze/places'].includes(path)) {
      response.writeHead(403).end(); return;
    }
    if (path!=='/breeze/places' && !env.OPENAI_API_KEY) {
      response.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Live AI is not configured on this Mac.'}));
      return;
    }
    const headers = new Headers({'Content-Type':request.headers['content-type'] || ''});
    if (request.headers.authorization) headers.set('Authorization',request.headers.authorization);
    const result = await hub.fetch(new Request(origin + path.slice('/breeze'.length), {
      method:'POST', headers, body:request, duplex:'half'
    }));
    response.writeHead(result.status,Object.fromEntries(result.headers)).end(await result.text());
  };
}
