import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {accountPage,validateAccounts} from '../scripts/account-pages.mjs';
import {accountAllowed} from '../api/account.mjs';

const config={apiKey:'AIza'+'a'.repeat(35),projectId:'unit-project',authDomain:'unit-project.firebaseapp.com',appId:'1:42:web:aabb'};
test('both entry points wait for account setup only after a real project is configured',async()=>{
  for(const file of ['site/index.html','site/history.html']){
    const html=await readFile(new URL('../'+file,import.meta.url),'utf8');
    assert.equal(accountPage(html),html);
    const page=accountPage(html,config);assert.match(page,/class="accounts-locked"/);assert.match(page,/assets\/accounts.js/);
    assert.doesNotMatch(page,/<script src="\.\/assets\/(app|chat|history)\.js"/);
  }
  assert.throws(()=>validateAccounts({...config,authDomain:'untrusted.example'}));
});
test('configured live chat requires a verified user from the matching project',async()=>{
  const req=token=>new Request('https://example.test/session',{headers:token?{Authorization:'Bearer '+token}:{}});
  const token=(project)=>'a.'+Buffer.from(JSON.stringify({iss:'https://securetoken.google.com/'+project,aud:project,sub:'person'})).toString('base64url')+'.sig';
  const provider=user=>()=>Response.json({users:[user]});
  assert.equal(await accountAllowed(req(),config),false);
  assert.equal(await accountAllowed(req(token('another-project')),config),false);
  const valid=req(token(config.projectId));assert.equal(await accountAllowed(valid,config,provider({localId:'person',emailVerified:false})),false);
  assert.equal(await accountAllowed(valid,config,provider({localId:'person',emailVerified:true})),true);
  assert.equal(await accountAllowed(valid,config,()=>new Response(null,{status:401})),false);
});
