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
if (config.apiBase) {
  const url = new URL(config.apiBase);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use only the public HTTPS Worker origin in config.json.');
  connect += ' ' + url.origin;
}
for (const page of ['index.html', 'history.html']) {
  const path = resolve(root, 'build/site', page);
  const html=(await readFile(path, 'utf8')).replace("'self' https://alongside-api.invalid", connect);
  await writeFile(path, accountPage(html,config.firebase));
}
if (config.firebase) {
  const path = resolve(root, 'build/site/privacy.html');
  const html = await readFile(path, 'utf8');
  await writeFile(path, html.replace('There is no account sign-in or cross-device backup.',
    'Adults sign in with Google or email using Firebase. Firebase processes account details to verify sign-in. Profile details and chats stay in this browser. Restarting a profile clears the local notebook. Younger visitors can use this tab without a Firebase account.'));
}
console.log('Built public files in build/site. No environment variables are included.');

// Serve the same site with isolated, tab-scoped storage for first-visit walkthroughs.
const output=resolve(root,'build/site');
const walkthrough=resolve(output,'first-visit');
await mkdir(walkthrough,{recursive:true});
for(const name of await readdir(output)){
  if(name!=='first-visit')await cp(resolve(output,name),resolve(walkthrough,name),{recursive:true});
}
const initializeVisit = `
(() => {
  const url=new URL(location.href);
  const fresh=url.searchParams.has('new');
  if(fresh || !sessionStorage.getItem('alongside-preview-visit'))
    sessionStorage.setItem('alongside-preview-visit',crypto.randomUUID());
  if(fresh){url.searchParams.delete('new');history.replaceState(null,'',url);}
  const prefix='alongside-preview:'+sessionStorage.getItem('alongside-preview-visit')+':';
  globalThis.AlongsideVisitStorage={
    getItem:key=>sessionStorage.getItem(prefix+key),
    setItem:(key,value)=>sessionStorage.setItem(prefix+key,value),
    removeItem:key=>sessionStorage.removeItem(prefix+key)
  };
})();`;
// Isolate storage for every shipped browser script, including the locale renderer
// on the history and privacy pages. Add new features only in the main site.
const assets=resolve(walkthrough,'assets');
for(const page of await readdir(walkthrough)){
  if(!page.endsWith('.html'))continue;
  const path=resolve(walkthrough,page);
  const html=await readFile(path,'utf8');
  if(html.includes('<script '))await writeFile(path,html.replace('<script ', '<script src="./assets/visit-storage.js" defer></script>\n<script '));
}
for(const file of await readdir(assets)){
  if(!file.endsWith('.js'))continue;
  const path=resolve(assets,file);
  const source=await readFile(path,'utf8');
  const scoped='(function(localStorage,sessionStorage){\n'+source+'\n})(AlongsideVisitStorage,AlongsideVisitStorage);';
  await writeFile(path,scoped);
}
await writeFile(resolve(assets,'visit-storage.js'),initializeVisit);
