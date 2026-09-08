import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync,spawn } from 'node:child_process';
import { mkdtempSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { defaultPolicy } from './helpers.mjs';
import {cliCommand} from './cli-command.mjs';
const cli=fileURLToPath(new URL('../../src/server/cli.mjs',import.meta.url));
const command=action=>cliCommand(cli,action);
test('AI-01 CLI: explicit adapter opt-in starts real production registry without reading AI keys or making inference calls',async t=>{
  const root=mkdtempSync(join(process.env.PROJECT_REVIEW_RUN,'evidence','adapter-cli-'));
  const policyPath=join(root,'policy.json'),p=defaultPolicy();p.allowedProviders=['xai-imagine'];writeFileSync(policyPath,JSON.stringify(p));
  const env={...process.env,BACKEND_DATA_DIR:join(root,'data'),BACKEND_KEYS_FILE:join(root,'synthetic-vault-keys.json'),
    BACKEND_POLICY_FILE:policyPath,BACKEND_OWNER_ISSUER:'https://identity.example.invalid',BACKEND_OWNER_SUBJECT:'adapter-cli-test-owner',
    BACKEND_ORIGIN:'https://app.example.invalid',BACKEND_PORT:'0',BACKEND_OIDC_FILE:'',BACKEND_AI_ADAPTERS:'xai-imagine'};
  for(const action of ['generate-keys','bootstrap']){
    const r=spawnSync('pwsh.exe',['-NoProfile','-Command',command(action)],{env,windowsHide:true,encoding:'utf8',timeout:15000});
    assert.equal(r.status,0,'synthetic bootstrap '+action);
  }
  const child=spawn('pwsh.exe',['-NoProfile','-Command',command('serve')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',errors='',nodePid;
  child.stderr.on('data',bytes=>{errors+=bytes;});
  const stop=async()=>{
    if(nodePid&&child.exitCode===null){process.kill(nodePid);await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}
  };t.after(stop);
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('adapter CLI start timeout')),15000);
    child.stdout.on('data',b=>{output+=b;for(const line of output.split(/\r?\n/)){
      try{const item=JSON.parse(line);if(item.status==='listening'){nodePid=item.pid;clearTimeout(timer);resolve(item);}}catch{}
    }});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('adapter CLI exited before ready'));});
  });
  assert.equal(ready.aiEnabled,true);assert.deepEqual(ready.aiProviders,['xai-imagine']);assert.equal(ready.address,'127.0.0.1');
  const health=await new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:ready.port,path:'/api/v1/health',headers:{Host:'app.example.invalid'}},res=>{
      let body='';res.on('data',b=>{body+=b;});res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(body)}));
    });req.on('error',reject);req.end();
  });
  assert.equal(health.status,200);assert.deepEqual(health.json.capabilities.aiProviders,['xai-imagine']);
  assert.equal(output.includes('PRIVATE KEY'),false);assert.equal(errors.includes('PRIVATE KEY'),false);
  await stop();
});

