import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from '../server/helpers.mjs';
import {createAppController} from '../../src/app/controller.mjs';
import {isVerifiedLease} from '../../src/app/http.mjs';
import {profile,asFile,deferred} from './printer-fixtures.mjs';

async function controllerFor(t,f){
 let client=f.a;const requests=[],downloads=[];
 // Only local project storage and OS download are test doubles. No project,
 // engine, Worker or printer is invented. Settings/auth use actual HTTP/SQLite.
 const storeFactory=async()=>({
  async unlock(proof){assert.equal(isVerifiedLease(proof),true);},
  status:()=>({canEdit:true,canRescue:false,writeBlocked:false,capabilities:{database:{readOnly:false}}}),
  listProjects:async()=>[],close(){},commit(){assert.fail('profile management must not mutate project storage');}
 });
 let beforeRequest=null;
 const controller=createAppController({origin:f.app.origin,deviceId:client.deviceId,clock:f.clock,storeFactory,
  fetchImpl:async(url,init)=>{
   assert.equal(new URL(url).origin,f.app.origin);const path=new URL(url).pathname;
   requests.push({path,method:init.method});
   if(beforeRequest)await beforeRequest(path,init);
   return fetch(url,{...init,headers:{...init.headers,Cookie:[...client.cookies].map(([k,v])=>k+'='+v).join('; ')}});
  },adapters:{download:{async save(v){downloads.push({...v,bytes:v.bytes.slice()});}}}});
 t.after(()=>controller.dispose());
 assert.equal((await controller.initialize()).ok,true);assert.equal(controller.doc,null);assert.equal(controller.store!==null,true);
 await controller.profileLibrary.refresh();
 return {controller,requests,downloads,set beforeRequest(v){beforeRequest=v;},set client(v){client=v;controller.deviceId=v.deviceId;}};
}
async function prepared(c,p){
 const r=await c.importFile(asFile(p),'printer-profile');
 assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'PROFILE_CONFIRMATION_REQUIRED');assert.equal(r.confirmation.retry.confirmed,true);return r.confirmation.retry;
}

test('AppBridge UI-C11 uses actual auth/settings HTTP without a project; accept/download/delete never write domain storage',async t=>{
 const f=await setup(t),h=await controllerFor(t,f),c=h.controller,p=await profile();
 const retry=await prepared(c,p);assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,0);
 assert.equal((await c.dispatch(retry)).ok,true);assert.equal(c.doc,null);assert.equal(c.headRevision,0);
 assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,1);
 let view=c.getSnapshot().printerProfiles;assert.equal(view.items.length,1);assert.equal(view.items[0].qualified,false);
 assert.equal((await c.dispatch({type:'printer.profile-export',key:view.items[0].key,settingsRevision:view.settingsRevision,original:true})).ok,true);
 assert.equal(h.downloads.length,1);assert.equal(c.getSnapshot().exportReceipts.length,0);assert.deepEqual(JSON.parse(new TextDecoder().decode(h.downloads[0].bytes)),p);
 const remove=await c.dispatch({type:'printer.profile-delete',key:view.items[0].key,settingsRevision:view.settingsRevision,confirmed:false});
 assert.equal(remove.ok,false);assert.equal((await c.dispatch(remove.confirmation.retry)).ok,true);
 assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,2);assert.equal(c.doc,null);
 assert.deepEqual((await f.b.ok('GET','/api/v1/settings')).values,{});
 assert.equal(h.requests.filter(r=>r.method==='PUT'&&r.path==='/api/v1/settings').length,2);
 assert.equal(f.provider.calls.length,0);
});

test('AppBridge preflight binding is awaited and late HTTP response cannot mutate a new account context',async t=>{
 const f=await setup(t),h=await controllerFor(t,f),c=h.controller;
 // Explicit policy test double proves routing, not a fresh-HTTPS policy proof.
 let deny=false,count=0;
 c.onlineSession={async preflight(){count++;if(deny)throw Object.assign(new Error('synthetic denied preflight'),{code:'ONLINE_SESSION_REQUIRED'});},close(){}};
 let retry=await prepared(c,await profile());deny=true;
 const blocked=await c.dispatch(retry);assert.equal(blocked.ok,false);assert.equal(blocked.diagnostic.code,'ONLINE_SESSION_REQUIRED');
 assert.equal(h.requests.some(r=>r.method==='PUT'),false);assert.ok(count>=2);
 c.onlineSession=null;
 retry=await prepared(c,await profile());
 const gate=deferred(),entered=deferred();
 h.beforeRequest=async(path,init)=>{if(path==='/api/v1/settings'&&init.method==='PUT'){entered.resolve();await gate.promise;}};
 const old=c.dispatch(retry);await entered.promise;
 await c.invalidate('signed-out');h.client=f.b;h.beforeRequest=null;
 assert.equal((await c.initialize()).ok,true);const nextEpoch=c.epoch;
 gate.resolve();const stale=await old;assert.equal(stale.ok,false);assert.equal(c.epoch,nextEpoch);
 assert.equal(c.api.userId,f.b.user.id);assert.equal(c.doc,null);
 assert.deepEqual((await f.b.ok('GET','/api/v1/settings')).values,{});
 assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,0);
});

test('AppBridge revoked account fails the real settings write and awaits private reset before returning',async t=>{
 const f=await setup(t),h=await controllerFor(t,f),c=h.controller;
 const retry=await prepared(c,await profile());
 await f.owner.ok('POST','/api/v1/owner/users/'+f.a.user.id,{action:'revoke-sessions',confirm:'revoke-sessions:'+f.a.user.id});
 const gate=deferred(),entered=deferred();c.adapters.reset=()=>{entered.resolve();return gate.promise;};
 let settled=false;const action=c.dispatch(retry).then(r=>{settled=true;return r;});
 await entered.promise;assert.equal(settled,false);assert.equal(c.api.userId,null);gate.resolve();
 const result=await action;assert.equal(result.ok,false);assert.equal(result.diagnostic.code,'SESSION_INVALID');assert.match(result.diagnostic.message,/đăng nhập lại/);assert.equal(c.getSnapshot().printerProfiles.enabled,false);
 await f.a.login('member-a');assert.equal((await f.a.ok('GET','/api/v1/settings')).revision,0);
});
