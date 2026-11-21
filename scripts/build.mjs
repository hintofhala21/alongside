import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { check } from './check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await check();
await rm(resolve(root, 'build/site'), { recursive: true, force: true });
await mkdir(resolve(root, 'build'), { recursive: true });
// Copy this explicit public folder only. Never copy the repository or environment.
await cp(resolve(root, 'site'), resolve(root, 'build/site'), { recursive: true });
const library = JSON.parse(await readFile(resolve(root, 'shared/library.json'), 'utf8'));
await writeFile(resolve(root, 'build/site/assets/library.js'), '"use strict";\nglobalThis.AlongsideLibrary = ' + JSON.stringify(library).replaceAll('<', '\\u003c') + ';\n');
const config = JSON.parse(await readFile(resolve(root, 'site/config.json'), 'utf8'));
let connect = "'self'";
if (config.apiBase) {
  const url = new URL(config.apiBase);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use only the public HTTPS Worker origin in config.json.');
  connect += ' ' + url.origin;
}
for (const page of ['index.html', 'history.html']) {
  const path = resolve(root, 'build/site', page);
  await writeFile(path, (await readFile(path, 'utf8')).replace("'self' https://alongside-api.invalid", connect));
}
console.log('Built public files in build/site. No environment variables are included.');
