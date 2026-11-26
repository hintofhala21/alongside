// Production server for Railway: serves build/site and runs the three Alongside workers
// (Breeze API, calendar feeds, WhatsApp reminders) on the same origin.
//   /api/*        -> api/worker.mjs
//   /calendar/*   -> calendar/worker.mjs
//   /reminders/*  -> reminders/worker.mjs
import { createServer } from 'node:http';
import { readFile, stat, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname, join } from 'node:path';
import { openDatabase, Namespace } from './durable-objects.mjs';
import apiWorker, { AlongsideHub } from '../api/worker.mjs';
import calendarWorker, { CalendarPlan } from '../calendar/worker.mjs';
import remindersWorker, { ReminderStore } from '../reminders/worker.mjs';

const env = process.env;
const port = Number(env.PORT) || 8080;
const publicOrigin = (env.PUBLIC_ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : 'http://localhost:' + port)).replace(/\/+$/, '');
const siteRoot = fileURLToPath(new URL('../build/site/', import.meta.url));
const MAX_BODY = 64 * 1024;

async function dataDirectory() {
  const candidates = [env.DATA_DIR, env.RAILWAY_VOLUME_MOUNT_PATH, fileURLToPath(new URL('../.data/', import.meta.url))].filter(Boolean);
  for (const dir of candidates) {
    try { await mkdir(dir, { recursive: true }); await access(dir, constants.W_OK); return dir; } catch {}
  }
  throw new Error('No writable data directory. Set DATA_DIR or attach a Railway volume.');
}

try { await stat(join(siteRoot, 'index.html')); }
catch { console.error('build/site is missing. Run "npm run build" before starting the server.'); process.exit(1); }

const dataDir = await dataDirectory();
if (!env.DATA_DIR && !env.RAILWAY_VOLUME_MOUNT_PATH) console.warn('No volume attached: stored data (rate limits, calendar feeds, showcase) resets on each deploy.');
const db = openDatabase(join(dataDir, 'alongside.sqlite'));

// Each worker gets the same settings it had on Cloudflare (wrangler.jsonc), overridable by Railway variables.
const base = { ...env, ALLOWED_ORIGIN: env.ALLOWED_ORIGIN || publicOrigin };
const apiEnv = { OPENAI_MODEL: 'gpt-6-luna', MAX_MONTHLY_REQUESTS: '500', MAX_DAILY_REQUESTS: '60', MAX_SESSION_REQUESTS: '30', ...base };
apiEnv.HUB = new Namespace({ db, name: 'api-hub', ObjectClass: AlongsideHub, env: apiEnv });

// Simple per-client write limit, replacing Cloudflare's rate-limit binding (60 per minute).
const writes = new Map();
const writeLimit = { async limit({ key }) {
  const now = Date.now(), entry = writes.get(key);
  if (!entry || entry.reset <= now) { writes.set(key, { count: 1, reset: now + 60000 }); return { success: true }; }
  entry.count++; return { success: entry.count <= 60 };
} };
const calendarEnv = { ...base, WRITE_LIMIT: writeLimit };
calendarEnv.CALENDARS = new Namespace({ db, name: 'calendar-plans', ObjectClass: CalendarPlan, env: calendarEnv });

const remindersEnv = { WA_GRAPH_VERSION: 'v25.0', WA_TEMPLATE_LANGUAGE: 'en_US', ...base };
remindersEnv.REMINDERS = new Namespace({ db, name: 'reminders', ObjectClass: ReminderStore, env: remindersEnv });

const routes = [
  ['/api', apiWorker, apiEnv],
  ['/calendar', calendarWorker, calendarEnv],
  ['/reminders', remindersWorker, remindersEnv]
];
const namespaces = [apiEnv.HUB, calendarEnv.CALENDARS, remindersEnv.REMINDERS];

// Durable Object alarms: check every 15 seconds.
let alarmsRunning = false;
const alarmTimer = setInterval(async () => {
  if (alarmsRunning) return;
  alarmsRunning = true;
  try { for (const ns of namespaces) await ns.runDueAlarms(); }
  catch (error) { console.error('Alarm loop error:', error?.message); }
  finally { alarmsRunning = false; }
}, 15000);
setInterval(() => { const now = Date.now(); for (const [key, entry] of writes) if (entry.reset <= now) writes.delete(key); }, 60000).unref();

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  ...(publicOrigin.startsWith('https://') ? { 'Strict-Transport-Security': 'max-age=31536000' } : {})
};
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.applescript': 'text/plain; charset=utf-8', '.ics': 'text/calendar; charset=utf-8'
};

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || '').split(',')[0].trim() || request.socket.remoteAddress || 'unknown';
}

async function readBody(request) {
  if (Number(request.headers['content-length']) > MAX_BODY) return null;
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) return null; chunks.push(chunk); }
  return Buffer.concat(chunks);
}

async function toWorker(request, response, prefix, worker, workerEnv) {
  const incoming = new URL(request.url, publicOrigin);
  const url = new URL(incoming.pathname.slice(prefix.length) || '/', publicOrigin);
  url.search = incoming.search;
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || ['host', 'connection', 'content-length', 'cf-connecting-ip'].includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('CF-Connecting-IP', clientIp(request));
  // Browsers omit Origin on same-origin GET requests; the workers expect it.
  if (!headers.has('origin') && request.headers['sec-fetch-site'] === 'same-origin') headers.set('Origin', publicOrigin);
  let body;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await readBody(request);
    if (body === null) { response.writeHead(413, { 'Content-Type': 'application/json', ...securityHeaders }).end('{"error":"Request is too large."}'); return; }
  }
  const reply = await worker.fetch(new Request(url, { method: request.method, headers, body }), workerEnv);
  const out = { ...securityHeaders };
  reply.headers.forEach((value, name) => { out[name] = value; });
  response.writeHead(reply.status, out);
  response.end(request.method === 'HEAD' ? undefined : Buffer.from(await reply.arrayBuffer()));
}

async function serveFile(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, securityHeaders).end(); return; }
  let file = resolve(siteRoot, '.' + decodeURIComponent(pathname));
  if (file !== siteRoot.replace(/[\\/]$/, '') && !file.startsWith(siteRoot.endsWith(sep) ? siteRoot : siteRoot + sep)) { response.writeHead(400, securityHeaders).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const type = mime[extname(file)] || 'application/octet-stream';
    const cache = /\.(jpg|png|svg|zip)$/.test(file) ? 'public, max-age=86400' : 'no-cache';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, ...securityHeaders });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    const notFound = await readFile(join(siteRoot, '404.html')).catch(() => Buffer.from('Not found'));
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...securityHeaders });
    response.end(request.method === 'HEAD' ? undefined : notFound);
  }
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, publicOrigin);
    if (pathname === '/healthz') { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"ok":true}'); return; }
    for (const [prefix, worker, workerEnv] of routes) {
      if (pathname === prefix || pathname.startsWith(prefix + '/')) { await toWorker(request, response, prefix, worker, workerEnv); return; }
    }
    await serveFile(request, response, pathname);
  } catch (error) {
    console.error('Request failed:', error?.message);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json', ...securityHeaders });
    response.end('{"error":"Something went wrong."}');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log('Alongside is running on port ' + port + ' for ' + publicOrigin + ' (data in ' + dataDir + ')');
});
function shutdown() {
  clearInterval(alarmTimer);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
