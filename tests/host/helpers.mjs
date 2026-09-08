import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:http';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { createHost } from '../../src/host/server.mjs';
import { digest } from '../../src/host/core.mjs';
import { MIME } from '../../src/host/manifest.mjs';

export const run=process.env.PROJECT_REVIEW_RUN;
export const dependency=fileURLToPath(new URL('../../',import.meta.url));
const runRelative=run&&relative(dependency,resolve(run));
assert.ok(runRelative&&!isAbsolute(runRelative)&&!runRelative.startsWith('..')&&process.env.HOST_TEST_RUN_ID&&run.endsWith(process.env.HOST_TEST_RUN_ID),'host run must be explicitly scoped inside project');
export const {createBackend}=await import(pathToFileURL(join(dependency,'src/server/app.mjs')).href);
export const {idp,defaultPolicy}=await import(pathToFileURL(join(dependency,'tests/server/helpers.mjs')).href);
export const tlsRoot=process.env.HOST_TEST_TLS;
assert.ok(tlsRoot,'synthetic TLS fixture required');
export const ca=readFileSync(join(tlsRoot,'synthetic-cert.pem'));
export const wasm=Buffer.from('0061736d010000000105016000017f030201000707010372756e00000a06010400412a0b','hex');
export function directory(label){return mkdtempSync(join(run,'evidence',label+'-'));}
export function fixture(label='https'){
  const root=directory(label),webroot=join(root,'public-build');
  mkdirSync(webroot);
  const assets=[];
  function add(file,bytes,cache='revalidate'){
    bytes=Buffer.from(bytes);
    const path=join(webroot,file);mkdirSync(resolve(path,'..'),{recursive:true});writeFileSync(path,bytes);
    const mime=MIME['.'+file.split('.').pop()];
    const a={url:'/'+file,file,sha256:digest(bytes),bytes:bytes.length,mime,cache};assets.push(a);return a;
  }
  const wasmAsset=add('engine-'+digest(wasm).slice(0,16)+'.wasm',wasm,'immutable');
  const data=add('public.json','{"publicFixture":true}');
  const worker=add('worker.mjs',"self.onmessage=async()=>{try{const r=await fetch("+JSON.stringify(wasmAsset.url)+");const m=await WebAssembly.instantiateStreaming(r);const d=await (await fetch('/public.json')).json();self.postMessage({isolated:self.crossOriginIsolated,shared:new SharedArrayBuffer(16).byteLength,result:m.instance.exports.run(),fetched:d.publicFixture});}catch(e){self.postMessage({error:e.name});}};");
  add('fixture-font.ttf',readFileSync(join(run,'inputs/font/PatrickHand.ttf')));
  add('app.mjs',"window.fixtureLoaded=true;");
  add('style.css','body { font-family: sans-serif; }');
  add('index.html','<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><script src="/app.mjs" type="module"></script></head><body><p>Public host test</p></body></html>');
  const manifest={schemaVersion:1,buildId:'synthetic-build-v1',assets,navigations:{'/':'/index.html','/settings':'/index.html'}};
  const manifestPath=join(root,'public-manifest.json');
  function save(){writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
  save();
  const config={schemaVersion:1,origin:'https://localhost:0',bindAddress:'127.0.0.1',port:0,backendPort:1,webroot,manifestPath,
    tlsKeyPath:join(tlsRoot,'synthetic-key.pem'),tlsCertPath:join(tlsRoot,'synthetic-cert.pem'),serviceWorker:true};
  return {root,webroot,manifest,save,config,add,worker,wasmAsset,data};
}
export async function start(t,{handler,backend=false,browserIdp=false,config={},label}={}){
  const f=fixture(label),upstream=createServer();
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  let app;
  t.after(async()=>{upstream.closeAllConnections();if(upstream.listening)await new Promise(r=>upstream.close(r));});
  f.records=[];
  if(handler)upstream.on('request',handler);
  f.host=createHost({...f.config,backendPort:upstream.address().port,...config},{logger:r=>f.records.push(r)});
  await f.host.listen();
  f.origin=f.host.origin;
  f.upstream=upstream;
  if(backend){
    f.idp=await idp(Date.now);
    let oidc=f.idp.config;
    if(browserIdp) {
      f.authorizeServer=createServer((req,res)=>{
        try{
          const authorizationUrl=f.idp.origin+req.url;
          const callback=f.idp.issue('owner-subject',authorizationUrl);
          res.setHeader('Cache-Control','no-store');
          res.setHeader('Referrer-Policy','no-referrer');
          res.statusCode=302;res.setHeader('Location',f.origin+callback);res.end();
        }catch{res.statusCode=400;res.end();}
      });
      await new Promise(r=>f.authorizeServer.listen(0,'127.0.0.1',r));
      f.authorizationOrigin='http://127.0.0.1:'+f.authorizeServer.address().port;
      oidc={...oidc,authorizationEndpoint:f.authorizationOrigin+'/authorize'};
    }
    const policy=defaultPolicy();policy.allowedProviders=[];
    app=createBackend({databasePath:join(f.root,'host-integration.sqlite'),origin:f.origin,testOnly:true,clock:Date.now,
      oidc,providers:[],vaultKeys:new Map([['synthetic',randomBytes(32)]]),activeVaultKey:'synthetic',
      csrfKey:randomBytes(32),leaseKey:generateKeyPairSync('ed25519').privateKey,
      bootstrap:{issuer:f.idp.origin,subject:'owner-subject',policy}});
    // Reuse the frozen backend's exact HTTP request listener on an OS-assigned loopback socket.
    for(const listener of app.server.listeners('request'))upstream.on('request',listener);
    f.app=app;
  }
  t.after(async()=>{
    await f.host.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));
    if(app)await app.close();
    if(f.idp)await f.idp.close();
    if(f.authorizeServer){f.authorizeServer.closeAllConnections();await new Promise(r=>f.authorizeServer.close(r));}
  });
  f.request=(method,path,body,headers={})=>wire(f.origin,method,path,body,headers);
  return f;
}
export function wire(origin,method,path,body,headers={}){
  const u=new URL(origin);
  const bytes=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
  return new Promise((resolve,reject)=>{
    const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:u.port,method,path,ca,agent:false,
      headers:{host:u.host,...(bytes?{'content-type':'application/json','content-length':bytes.length}:{}),...headers}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
        const raw=Buffer.concat(chunks);let json;
        try{json=JSON.parse(raw);}catch{}
        resolve({status:res.statusCode,headers:res.headers,raw,json,tlsProtocol:res.socket?.getProtocol?.()});
      });res.on('error',reject);
    });
    req.setTimeout(10000,()=>req.destroy(new Error('test timeout')));req.on('error',reject);req.end(bytes);
  });
}
export class SecureClient {
  constructor(f){this.f=f;this.cookies=new Map();}
  async request(method,path,body,headers={}){
    const r=await this.f.request(method,path,body,{...(!['GET','HEAD'].includes(method)?{origin:this.f.origin}:{}),
      cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; '),...(this.csrf?{'x-csrf-token':this.csrf}:{}),...headers});
    for(const line of r.headers['set-cookie']||[]){const kv=line.split(';')[0],i=kv.indexOf('=');this.cookies.set(kv.slice(0,i),kv.slice(i+1));}
    return r;
  }
  async login(subject='owner-subject',inviteToken){
    const start=await this.request('POST','/api/v1/auth/start',{deviceId:crypto.randomUUID(),...(inviteToken?{inviteToken}:{})});
    assert.equal(start.status,200);
    const callback=this.f.idp.issue(subject,start.json.authorizationUrl);
    const r=await this.request('GET',callback);
    assert.equal(r.status,303);
    const me=await this.request('GET','/api/v1/me');assert.equal(me.status,200);
    this.csrf=me.json.csrfToken;return {start,callback:r,me};
  }
}
