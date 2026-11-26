import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../build/site/first-visit/index.html',import.meta.url),'utf8');
assert.ok(html.includes('content="0;url=../"'));
console.log('Legacy first-visit links open the regular app.');
