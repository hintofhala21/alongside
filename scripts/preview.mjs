import { localChat } from './local-chat.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { homedir } from 'node:os';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const macMode=process.platform==='darwin' && process.env.ALONGSIDE_MAC_CALENDAR==='1';
const careMode=process.env.ALONGSIDE_FIND_CARE==='1';
const port=careMode?4176:process.env.ALONGSIDE_OPEN_CHAT==='1'?4175:macMode?4174:4173;
const origin='http://127.0.0.1:'+port;
const root = fileURLToPath(new URL('../build/site/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
// Local keys live outside the project so the secret scan in scripts/check.mjs stays strict.
const envFile=process.env.ALONGSIDE_ENV_FILE || resolve(homedir(),'.config/alongside/env');
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const chat = localChat(origin,{GOOGLE_PLACES_API_KEY:process.env.GOOGLE_PLACES_API_KEY,OPENAI_API_KEY:process.env.OPENAI_API_KEY, OPENAI_MODEL:process.env.OPENAI_MODEL});
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if(path==='/Find-Care.html'){
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(await readFile(new URL('../Find-Care.html',import.meta.url)));return;
    }
    if(path==='/config.json'){
      const config=JSON.parse(await readFile(resolve(root,'config.json'),'utf8'));
      response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({...config,placesReady:Boolean(process.env.GOOGLE_PLACES_API_KEY),lunaMeals:true,chatVersion:15,calendarTools:process.platform==='darwin',localBreeze:process.env.OPENAI_API_KEY?'live':'unavailable'}));
      return;
    }
    if(path.startsWith('/breeze/')){await chat(request,response,path);return;}
    if(process.platform==='darwin' && path==='/mac-calendar/add-meal'){
      if(request.method!=='POST' || request.headers.origin!==origin || request.headers.host!=='127.0.0.1:'+port || request.headers['x-alongside-calendar']!=='add-meal'){
        response.writeHead(403).end();return;
      }
      const query=new URL(request.url,origin).searchParams;
      const meal=query.get('meal'), when=Number(query.get('when'));
      if(!['Breakfast','Morning snack','Lunch','Afternoon snack','Dinner','Evening snack','Night snack','Snack'].includes(meal) || !Number.isSafeInteger(when) || when*1000<=Date.now()){
        response.writeHead(400).end();return;
      }
      try {
        await run(fileURLToPath(new URL('../build/mac/AlongsideCalendar.app/Contents/MacOS/AlongsideCalendar',import.meta.url)),['--add-meal',meal,String(when)],{timeout:90000});
        response.writeHead(204).end();
      } catch {response.writeHead(503).end();}
      return;
    }
    if(process.platform==='darwin' && path.startsWith('/mac-calendar/')){
      response.setHeader('Cache-Control','no-store');
      if(request.headers.host!=='127.0.0.1:'+port){response.writeHead(403).end();return;}
      if(path==='/mac-calendar/status'){response.end('alongside-calendar');return;}
      if(path!=='/mac-calendar/busy' || request.method!=='POST' || request.headers.origin!==origin || request.headers['x-alongside-calendar']!=='availability'){
        response.writeHead(403).end();return;
      }
      try {
        const {stdout}=await run(fileURLToPath(new URL('../build/mac/AlongsideCalendar.app/Contents/MacOS/AlongsideCalendar',import.meta.url)),['--busy'],{timeout:90000,maxBuffer:2000000});
        response.writeHead(200,{'Content-Type':'application/json'}).end(stdout);
      } catch (error) {response.writeHead(error.code===2?403:503).end('Calendar unavailable');}
      return;
    }
    const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.on('error', error=>{
  console.error(error.code==='EADDRINUSE'
    ? 'Another server is using '+origin+'. Close its Terminal window before restarting Alongside.'
    : 'Alongside could not start: '+error.message);
  process.exitCode=1;
});
server.listen(port,'127.0.0.1',()=>{
  console.log('Alongside: '+origin);
  if(careMode)execFile('open',[origin+'/Find-Care.html']);
  else if(process.env.ALONGSIDE_OPEN_CHAT==='1')execFile('open',[origin+'/#support']);
  else if(macMode)execFile('open',[origin+'/#plan']);
});
