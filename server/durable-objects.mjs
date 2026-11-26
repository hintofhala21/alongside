// A small stand-in for Cloudflare Durable Objects, backed by Node's built-in SQLite.
// It covers only what the Alongside workers use: key-value storage, list, transactions,
// alarms, idFromName/idFromString and blockConcurrencyWhile.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

const encode = value => JSON.stringify(value);
const decode = text => (text === null || text === undefined ? undefined : JSON.parse(text));
const time = when => (when instanceof Date ? when.getTime() : Number(when));

// Runs async work one at a time for each key, like an input gate.
class Mutex {
  constructor() { this.tail = Promise.resolve(); }
  run(fn) {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
}

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (ns TEXT NOT NULL, obj TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (ns, obj, k));
    CREATE TABLE IF NOT EXISTS alarms (ns TEXT NOT NULL, obj TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (ns, obj));`);
  return db;
}

class Storage {
  constructor(db, ns, obj) {
    this.db = db; this.ns = ns; this.obj = obj; this.mutex = new Mutex();
    this.q = {
      get: db.prepare('SELECT v FROM kv WHERE ns = ? AND obj = ? AND k = ?'),
      put: db.prepare('INSERT INTO kv (ns, obj, k, v) VALUES (?, ?, ?, ?) ON CONFLICT (ns, obj, k) DO UPDATE SET v = excluded.v'),
      del: db.prepare('DELETE FROM kv WHERE ns = ? AND obj = ? AND k = ?'),
      delAll: db.prepare('DELETE FROM kv WHERE ns = ? AND obj = ?'),
      list: db.prepare('SELECT k, v FROM kv WHERE ns = ? AND obj = ? ORDER BY k'),
      getAlarm: db.prepare('SELECT at FROM alarms WHERE ns = ? AND obj = ?'),
      setAlarm: db.prepare('INSERT INTO alarms (ns, obj, at) VALUES (?, ?, ?) ON CONFLICT (ns, obj) DO UPDATE SET at = excluded.at'),
      delAlarm: db.prepare('DELETE FROM alarms WHERE ns = ? AND obj = ?')
    };
  }
  readOne(key) { return decode(this.q.get.get(this.ns, this.obj, key)?.v); }
  async get(keys) {
    if (Array.isArray(keys)) {
      const found = new Map();
      for (const key of keys) { const value = this.readOne(key); if (value !== undefined) found.set(key, value); }
      return found;
    }
    return this.readOne(keys);
  }
  writeOne(key, value) {
    if (value === undefined) throw new TypeError('Cannot store undefined.');
    this.q.put.run(this.ns, this.obj, key, encode(value));
  }
  async put(key, value) {
    if (key && typeof key === 'object') { this.atomically(() => { for (const [k, v] of Object.entries(key)) this.writeOne(k, v); }); return; }
    this.writeOne(key, value);
  }
  async delete(keys) {
    if (Array.isArray(keys)) { let count = 0; this.atomically(() => { for (const key of keys) count += Number(this.q.del.run(this.ns, this.obj, key).changes); }); return count; }
    return this.q.del.run(this.ns, this.obj, keys).changes > 0;
  }
  async deleteAll() { this.q.delAll.run(this.ns, this.obj); }
  async list({ prefix = '', start, end, limit, reverse = false } = {}) {
    let rows = this.q.list.all(this.ns, this.obj).filter(r => r.k.startsWith(prefix) && (start === undefined || r.k >= start) && (end === undefined || r.k < end));
    if (reverse) rows.reverse();
    if (Number.isInteger(limit)) rows = rows.slice(0, limit);
    return new Map(rows.map(r => [r.k, decode(r.v)]));
  }
  async getAlarm() { return this.q.getAlarm.get(this.ns, this.obj)?.at ?? null; }
  async setAlarm(when) {
    const at = time(when);
    if (!Number.isFinite(at)) throw new TypeError('Invalid alarm time.');
    this.q.setAlarm.run(this.ns, this.obj, Math.round(at));
  }
  async deleteAlarm() { this.q.delAlarm.run(this.ns, this.obj); }
  async sync() {}
  atomically(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { fn(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  // Writes are buffered and committed together; reads inside see the buffered values.
  transaction(fn) {
    return this.mutex.run(async () => {
      const pending = new Map();
      const txn = {
        get: async key => (Array.isArray(key)
          ? new Map(key.map(k => [k, pending.has(k) ? pending.get(k) : this.readOne(k)]).filter(([, v]) => v !== undefined))
          : (pending.has(key) ? pending.get(key) : this.readOne(key))),
        put: async (key, value) => {
          if (key && typeof key === 'object') { for (const [k, v] of Object.entries(key)) pending.set(k, v); return; }
          if (value === undefined) throw new TypeError('Cannot store undefined.');
          pending.set(key, value);
        },
        delete: async key => { for (const k of Array.isArray(key) ? key : [key]) pending.set(k, undefined); return true; },
        rollback: () => { pending.clear(); },
        list: options => this.list(options)
      };
      const result = await fn(txn);
      this.atomically(() => {
        for (const [key, value] of pending) {
          if (value === undefined) this.q.del.run(this.ns, this.obj, key);
          else this.q.put.run(this.ns, this.obj, key, encode(value));
        }
      });
      return result;
    });
  }
}

class ObjectId {
  constructor(hex, name) { this.hex = hex; this.name = name; }
  toString() { return this.hex; }
  equals(other) { return Boolean(other) && String(other) === this.hex; }
}

export class Namespace {
  constructor({ db, name, ObjectClass, env }) {
    this.db = db; this.ns = name; this.ObjectClass = ObjectClass; this.env = env; this.instances = new Map();
  }
  idFromName(name) { return new ObjectId(createHash('sha256').update(this.ns + ':' + name).digest('hex'), name); }
  idFromString(hex) {
    if (!/^[a-f0-9]{64}$/.test(String(hex))) throw new TypeError('Invalid Durable Object ID.');
    return new ObjectId(String(hex));
  }
  newUniqueId() { return new ObjectId(randomBytes(32).toString('hex')); }
  instance(id) {
    const hex = String(id);
    let entry = this.instances.get(hex);
    if (!entry) {
      const storage = new Storage(this.db, this.ns, hex);
      const gate = new Mutex();
      const ctx = { id: id instanceof ObjectId ? id : new ObjectId(hex), storage, blockConcurrencyWhile: fn => gate.run(fn), waitUntil() {} };
      entry = { object: new this.ObjectClass(ctx, this.env) };
      this.instances.set(hex, entry);
    }
    return entry.object;
  }
  get(id) {
    return { id, fetch: (input, init) => this.instance(id).fetch(input instanceof Request && !init ? input : new Request(input, init)) };
  }
  async runDueAlarms(now = Date.now()) {
    const due = this.db.prepare('SELECT obj, at FROM alarms WHERE ns = ? AND at <= ?').all(this.ns, now);
    for (const { obj, at } of due) {
      this.db.prepare('DELETE FROM alarms WHERE ns = ? AND obj = ? AND at = ?').run(this.ns, obj, at);
      const object = this.instance(new ObjectId(obj));
      if (typeof object.alarm !== 'function') continue;
      try { await object.alarm(); }
      catch (error) {
        console.error('Alarm failed in ' + this.ns + ', retrying in a minute:', error?.message);
        const storage = new Storage(this.db, this.ns, obj);
        if (await storage.getAlarm() === null) await storage.setAlarm(now + 60000);
      }
    }
  }
}
