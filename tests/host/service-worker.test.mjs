import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { serviceWorker } from '../../src/host/service-worker.mjs';
import { digest } from '../../src/host/core.mjs';
import { APP_CSP } from '../../src/host/headers.mjs';

const origin='https://localhost:44321', bytes=Buffer.from('<!doctype html><p>public</p>'), path='/';
const build={buildId:'frozen-v1',entries:new Map([[path,{bytes,mime:'text/html; charset=utf-8',hash:digest(bytes),html:true}]])};
function wrapped(response,url=origin+'/',redirected=false) {
  Object.defineProperty(response,'url',{value:url,configurable:true});
  Object.defineProperty(response,'redirected',{value:redirected,configurable:true});
  const clone=response.clone.bind(response);
  response.clone=()=>wrapped(clone(),url,redirected);
  return response;
}
function response({body=bytes,status=200,url=origin+'/',redirected=false,headers={}}={}) {
  return wrapped(new Response(body,{status,headers:{
    'content-length':String(bytes.length),'content-type':'text/html; charset=utf-8',
    'x-arch-public':'1','x-arch-build':'frozen-v1','cache-control':'public, max-age=0, must-revalidate',
    'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp',
    'cross-origin-resource-policy':'same-origin','content-security-policy':APP_CSP,...headers}}),url,redirected);
}
function harness(){
  const listeners={},cache=new Map(),fetches=[];let next=response(),offline=false;
  const runtime={URL,Request,Response,Uint8Array,crypto:webcrypto,
    self:{location:{origin},clients:{claim:async()=>{}},addEventListener:(name,fn)=>listeners[name]=fn},
    caches:{open:async()=>({put:async(k,v)=>cache.set(k,v),match:async k=>cache.get(k)})},
    fetch:async request=>{fetches.push(request);if(offline)throw new Error('synthetic offline');return next;}};
  runInNewContext(serviceWorker(build).toString(),runtime,{timeout:1000});
  return {cache,fetches,set:r=>{next=r;},offline:()=>{offline=true;},
    dispatch:(url=origin+'/',options={})=>{let promise;listeners.fetch({request:new Request(url,options),respondWith:p=>{promise=p;}});return promise;}};
}
test('WEB-01 generated SW verifies exact public bytes and retains COI on offline shell',async()=>{
  const h=harness();assert.equal((await h.dispatch()).status,200);
  assert.equal(h.fetches[0].credentials,'omit');assert.equal(h.fetches[0].redirect,'error');assert.equal(h.fetches[0].cache,'no-store');
  assert.equal(h.cache.size,1);h.offline();const cached=await h.dispatch();
  assert.equal(cached.headers.get('cross-origin-embedder-policy'),'require-corp');
  assert.equal(await cached.text(),bytes.toString());
});
test('WEB-01 generated SW bypasses APIs/auth, queries, unsafe methods, range and Authorization',()=>{
  const h=harness();
  for(const url of ['/api/v1/me','/api/v1/auth/callback?code=synthetic','/api/v1/health','/?invite=synthetic','/unknown','/host-sw.js'])
    assert.equal(h.dispatch(origin+url),undefined);
  assert.equal(h.dispatch(origin+'/',{method:'POST',body:'{}'}),undefined);
  assert.equal(h.dispatch(origin+'/',{headers:{range:'bytes=0-1'}}),undefined);
  assert.equal(h.dispatch(origin+'/',{headers:{authorization:'synthetic'}}),undefined);
  assert.equal(h.dispatch('https://elsewhere.invalid/'),undefined);
  assert.equal(h.fetches.length,0);assert.equal(h.cache.size,0);
});
test('WEB-01 SW never admits login final 200, redirects/errors/private responses or mixed build/hash/header caches',async()=>{
  const patches=[
    {url:origin+'/login',redirected:true},{status:302,body:null},{status:401},{status:500},
    {headers:{'cache-control':'no-store'}},{headers:{'cache-control':'private'}},
    {headers:{'x-arch-build':'new-build'}},{headers:{'x-arch-public':'0'}},
    {headers:{'content-type':'text/plain'}},{headers:{'cross-origin-embedder-policy':'unsafe-none'}},
    {headers:{'cross-origin-opener-policy':'unsafe-none'}},{headers:{'content-security-policy':''}},
    {body:Buffer.alloc(bytes.length,120)},{body:Buffer.alloc(bytes.length+100000,120)}
  ];
  for(const patch of patches){
    const h=harness();h.set(response(patch));const r=await h.dispatch();
    assert.equal(h.cache.size,0);
    if((patch.status??200)===200)assert.equal(r.type,'error');
  }
});
test('WEB-01 poisoned offline CacheStorage body is rechecked; online errors never fall back to cached shell',async()=>{
  const h=harness();await h.dispatch();
  h.set(response({status:401}));assert.equal((await h.dispatch()).status,401);
  h.cache.set(origin+'/',response({body:Buffer.alloc(bytes.length,120)}));h.offline();
  assert.equal((await h.dispatch()).type,'error');
});
