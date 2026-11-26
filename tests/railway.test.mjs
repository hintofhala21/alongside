import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase, Namespace } from '../server/durable-objects.mjs';
import { AlongsideHub } from '../api/worker.mjs';
import apiWorker from '../api/worker.mjs';

class Probe {
  constructor(ctx) { this.ctx = ctx; this.storage = ctx.storage; this.alarms = 0; }
  async fetch() { return new Response(String(await this.storage.get('n') ?? 0)); }
  async alarm() { this.alarms++; await this.storage.put('alarmed', true); }
}

test('SQLite storage keeps values, lists by prefix and survives reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alongside-'));
  try {
    let db = openDatabase(join(dir, 'a.sqlite'));
    let ns = new Namespace({ db, name: 'probe', ObjectClass: Probe, env: {} });
    const id = ns.idFromName('one');
    assert.equal(String(id), String(ns.idFromName('one')));
    assert.ok(id.equals(ns.idFromString(String(id))));
    const store = ns.instance(id).storage;
    await store.put('share:b', { title: 'B' }); await store.put('share:a', { title: 'A' }); await store.put('other', 1);
    assert.deepEqual([...(await store.list({ prefix: 'share:' })).keys()], ['share:a', 'share:b']);
    assert.equal((await store.list({ prefix: 'share:', limit: 1 })).size, 1);
    assert.deepEqual(await store.get('share:a'), { title: 'A' });
    db.close();
    db = openDatabase(join(dir, 'a.sqlite'));
    ns = new Namespace({ db, name: 'probe', ObjectClass: Probe, env: {} });
    assert.deepEqual(await ns.instance(ns.idFromName('one')).storage.get('share:b'), { title: 'B' });
    assert.equal(await ns.instance(ns.idFromName('two')).storage.get('share:b'), undefined);
    db.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('transactions are all-or-nothing and run one at a time', async () => {
  const db = openDatabase(':memory:');
  const store = new Namespace({ db, name: 'probe', ObjectClass: Probe, env: {} }).instance(new Namespace({ db, name: 'probe', ObjectClass: Probe, env: {} }).idFromName('x')).storage;
  await assert.rejects(store.transaction(async txn => { await txn.put('a', 1); throw Error('stop'); }));
  assert.equal(await store.get('a'), undefined);
  await Promise.all(Array.from({ length: 20 }, () => store.transaction(async txn => {
    const n = (await txn.get('n')) ?? 0; await new Promise(r => setTimeout(r, 1)); await txn.put('n', n + 1);
  })));
  assert.equal(await store.get('n'), 20);
  db.close();
});

test('due alarms run once and clear themselves', async () => {
  const db = openDatabase(':memory:');
  const ns = new Namespace({ db, name: 'probe', ObjectClass: Probe, env: {} });
  const object = ns.instance(ns.idFromName('x'));
  await object.storage.setAlarm(Date.now() - 1);
  await ns.runDueAlarms(); await ns.runDueAlarms();
  assert.equal(object.alarms, 1);
  assert.equal(await object.storage.getAlarm(), null);
  assert.equal(await object.storage.get('alarmed'), true);
  db.close();
});

test('a Breeze chat works end to end on the Railway storage', async () => {
  const db = openDatabase(':memory:');
  const origin = 'https://alongside.example.up.railway.app';
  const env = { AI_ENABLED: 'true', OPENAI_API_KEY: 'test', DEMO_ACCESS_CODE: 'demo', PUBLISHER_CODE: 'pub', RATE_SALT: 'salt', ALLOWED_ORIGIN: origin,
    TEST_FETCH: async () => Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'reply_to_visitor', arguments: JSON.stringify({ route: 'conversation', reply: 'Hello from Breeze', information: 'none', action: 'none' }) }] }) };
  env.HUB = new Namespace({ db, name: 'api-hub', ObjectClass: AlongsideHub, env });
  const call = (path, body, token) => apiWorker.fetch(new Request(origin + path, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }), env);
  const session = await (await call('/session', { mode: 'personal', adult: true, consent: true, ageGroup: 'adult' })).json();
  assert.ok(session.token);
  const reply = await call('/chat', { conversationId: crypto.randomUUID(), requestId: crypto.randomUUID(), message: 'Hi', language: 'en' }, session.token);
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).reply.text, 'Hello from Breeze');
  const blocked = await apiWorker.fetch(new Request(origin + '/session', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(blocked.status, 403);
  db.close();
});

test('the Railway server serves the site, health check and API status without secrets', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'ignore' });
  const dir = await mkdtemp(join(tmpdir(), 'alongside-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server/railway.mjs'], { cwd: root, env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, fail) => { child.stdout.on('data', d => { if (String(d).includes('running')) ok(); }); child.on('exit', code => fail(Error('exited ' + code))); setTimeout(() => fail(Error('timeout')), 10000); });
    const url = 'http://127.0.0.1:' + port;
    assert.equal((await fetch(url + '/healthz')).status, 200);
    const home = await fetch(url + '/');
    assert.equal(home.status, 200); assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.match(await home.text(), /Alongside/);
    assert.deepEqual(await (await fetch(url + '/config.json')).json(), { apiBase: '/api' });
    const status = await (await fetch(url + '/api/status')).json();
    assert.equal(status.ready, false);
    assert.equal((await fetch(url + '/calendar/health')).status, 200);
    assert.equal((await fetch(url + '/missing-page')).status, 404);
    assert.notEqual((await fetch(url + '/%2e%2e/package.json')).status, 200);
    assert.equal((await fetch(url + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(70000) })).status, 413);
  } finally { child.kill('SIGTERM'); await rm(dir, { recursive: true, force: true }); }
});
