import assert from 'node:assert/strict';
import {createServer as netServer} from 'node:net';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {idp,defaultPolicy} from '../server/helpers.mjs';
import {backendKeys,hostConfig,wire,dir} from './helpers.mjs';
export async function freePort(){const s=netServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
export async function startArtifact(t,directory){
 const root=dir('portable-http'),identity=await idp(Date.now),keys=backendKeys(),port=await freePort();
 const policy=defaultPolicy();policy.allowedProviders=[];
 const {createBackend}=await import(pathToFileURL(resolve(directory,'src/server/app.mjs')).href);
 const {createHost}=await import(pathToFileURL(resolve(directory,'src/host/server.mjs')).href);
 const app=createBackend({databasePath:resolve(root,'backend.sqlite'),origin:'https://localhost:'+port,
  ...keys,testOnly:true,oidc:identity.config,providers:[],runtime:{maintenance:{enabled:true}},
  bootstrap:{issuer:identity.origin,subject:'synthetic-owner',policy}});
 t.after(async()=>{await app.close();await identity.close();});
 await app.listen(0);
 const logs=[],host=createHost(hostConfig(directory,{origin:app.origin,port,backendPort:app.server.address().port}),{logger:x=>logs.push(x)});
 await host.listen();t.after(()=>host.close());
 const f={root,identity,app,host,logs,origin:host.origin,request:(method,path,body,headers)=>wire(host.origin,method,path,body,headers)};
 f.client=()=>new Client(f);return f;
}
export class Client{
 constructor(f){this.f=f;this.cookies=new Map();this.csrf=null;}
 async request(method,path,body,headers={}){
  const r=await this.f.request(method,path,body,{cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; '),
   ...(!['GET','HEAD'].includes(method)?{origin:this.f.origin}:{}),...(this.csrf?{'x-csrf-token':this.csrf}:{}),...headers});
  for(const line of r.headers['set-cookie']||[]){const first=line.split(';')[0],at=first.indexOf('=');this.cookies.set(first.slice(0,at),first.slice(at+1));}
  return r;
 }
 async login(subject='synthetic-owner',inviteToken){
  const start=await this.request('POST','/api/v1/auth/start',{deviceId:crypto.randomUUID(),...(inviteToken?{inviteToken}:{})});
  assert.equal(start.status,200);
  const r=await this.request('GET',this.f.identity.issue(subject,start.json.authorizationUrl));assert.equal(r.status,303);
  const me=await this.request('GET','/api/v1/me');assert.equal(me.status,200);this.csrf=me.json.csrfToken;this.userId=me.json.user.id;return me;
 }
}
