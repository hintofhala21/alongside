import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const release = new URL('../build/site/', import.meta.url);
const preview = new URL('first-visit/', release);
const startup = '<script src="./assets/visit-storage.js" defer></script>\n';
for (const name of await readdir(release)) {
  if (!name.endsWith('.html')) continue;
  const regular = await readFile(new URL(name, release), 'utf8');
  const firstVisit = await readFile(new URL(name, preview), 'utf8');
  assert.equal(firstVisit.replace(startup, ''), regular, 'First-visit page differs from the release: '+name);
}
const bootstrap = await readFile(new URL('assets/visit-storage.js', preview), 'utf8');
const tab = new Map();
let visit = 0;
function open(fresh) {
  const context = {
    URL, location: {href: 'https://example.test/first-visit/'+(fresh?'?new=1':'')},
    history: {replaceState() {}}, crypto: {randomUUID: () => String(++visit)},
    sessionStorage: {getItem: k => tab.get(k) ?? null, setItem: (k,v) => tab.set(k,v), removeItem: k => tab.delete(k)}
  };
  runInNewContext(bootstrap, context);
  return context.AlongsideVisitStorage;
}
open(true).setItem('profile','sample');
assert.equal(open(false).getItem('profile'),'sample');
assert.equal(open(true).getItem('profile'),null);
console.log('First-visit pages match this release; reload keeps progress and the shared link starts fresh.');
