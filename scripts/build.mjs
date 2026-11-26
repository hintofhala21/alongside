import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { languagePacks, languageNames } from '../shared/languages.mjs';
import { accountPage } from './account-pages.mjs';
import { check } from './check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await check();
await rm(resolve(root, 'build/site'), { recursive: true, force: true });
await mkdir(resolve(root, 'build'), { recursive: true });
// Copy this explicit public folder only. Never copy the repository or environment.
await cp(resolve(root, 'site'), resolve(root, 'build/site'), { recursive: true });
const library = JSON.parse(await readFile(resolve(root, 'shared/library.json'), 'utf8'));
library.mealTerms=JSON.parse(await readFile(resolve(root,'shared/meal-terms.json'),'utf8'));
await writeFile(resolve(root, 'build/site/assets/library.js'), '"use strict";\nglobalThis.AlongsideLibrary = ' + JSON.stringify(library).replaceAll('<', '\\u003c') + ';\n');
const runtime = await readFile(resolve(root, 'shared/locale-client.js'), 'utf8');
// Send the English keys once, even when several languages share the same page.
const keys = Object.keys(languagePacks.fr);
const values = Object.fromEntries(Object.entries(languagePacks).map(([code, pack]) => [
  code, keys.map(key => pack[key])
]));
const localeData = {names: languageNames, keys, values};
await writeFile(resolve(root, 'build/site/assets/locales.js'),
  'globalThis.AlongsideLocaleData = ' + JSON.stringify(localeData) + ';\n' + runtime);
const config = JSON.parse(await readFile(resolve(root, 'site/config.json'), 'utf8'));
let connect = "'self'";
const reminderOrigins = " https://alongside-reminders.alongside-waicy-demo.workers.dev https://alongside-calendar.alongside-waicy-demo.workers.dev";
const sameOrigin = /^\/[a-z-]+$/.test(config.apiBase || '');
if (config.apiBase && !sameOrigin) {
  const url = new URL(config.apiBase);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use only the public HTTPS Worker origin in config.json.');
  connect += ' ' + url.origin;
}
for (const page of ['index.html', 'history.html']) {
  const path = resolve(root, 'build/site', page);
  const html=(await readFile(path, 'utf8')).replace("'self' https://alongside-api.invalid", page === "index.html" && !sameOrigin ? connect + reminderOrigins : connect);
  await writeFile(path, accountPage(html,config.firebase));
}
if (config.firebase) {
  const path = resolve(root, 'build/site/privacy.html');
  const html = await readFile(path, 'utf8');
  await writeFile(path, html.replace('There is no account sign-in or cross-device backup.',
    'Adults sign in with Google or email using Firebase. Firebase processes account details to verify sign-in. Profile details and chats stay in this browser. Restarting a profile clears the local notebook. Younger visitors can use this tab without a Firebase account.'));
}
console.log('Built public files in build/site. No environment variables are included.');

// Keep previously shared first-visit links working with the regular app.
const output=resolve(root,'build/site');
const legacy=resolve(output,'first-visit');
await mkdir(legacy,{recursive:true});
for(const name of await readdir(output)){
  if(!name.endsWith('.html'))continue;
  const target=name==='index.html'?'../':'../'+name;
  await writeFile(resolve(legacy,name),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Alongside</title><meta http-equiv="refresh" content="0;url='+target+'"><a href="'+target+'">Open Alongside</a></html>');
}
