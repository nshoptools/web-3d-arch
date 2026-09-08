import test from 'node:test';import assert from 'node:assert/strict';
import {setup,deferred} from '../server/helpers.mjs';
import {createAppController,ApiClient} from '../../src/app/index.mjs';
import {RemoteServices} from '../../src/app/remote.mjs';
async function controller(t,f,who){
 const client=f[who],downloads=[];
 const api=new ApiClient({origin:f.app.origin,fetchImpl:async(url,options)=>fetch(url,{...options,headers:{...options.headers,Cookie:[...client.cookies].map(([k,v])=>k+'='+v).join('; ')}})});
 const me=await client.ok('GET','/api/v1/me');api.bind(me);
 const c=createAppController({origin:f.app.origin,deviceId:'settings-test',adapters:{download:{save:async r=>downloads.push(r)}}});
 c.api=api;c.remote=new RemoteServices(api);c.session={status:'signed-in',user:me.user,deviceMode:'private'};c.emit();
 t.after(()=>c.dispose());return {c,downloads};
}
test('settings export is available without a project, uses real per-user HTTP/SQLite values, and roundtrips',async t=>{
 const f=await setup(t),a=await controller(t,f,'a'),b=await controller(t,f,'b');
 await a.c.remote.refresh();await a.c.remote.settingsUpdate({language:'vi',fontSize:18});
 const option=a.c.getSnapshot().exports.find(x=>x.id==='settings');assert.equal(option.enabled,true);assert.equal(option.prerequisite,'account-settings');assert.equal(a.c.doc,null);
 assert.equal((await a.c.exportFile('settings')).ok,true);assert.equal((await b.c.exportFile('settings')).ok,true);
 const read=x=>JSON.parse(new TextDecoder().decode(x.downloads[0].bytes)),adoc=read(a),bdoc=read(b);
 assert.equal(a.downloads[0].mimeType,'application/json');assert.equal(a.downloads[0].filename,'settings.json');
 assert.equal(adoc.values.language,'vi');assert.equal(adoc.values.fontSize,18);assert.notDeepEqual(adoc.values,bdoc.values);
 await a.c.remote.resetSettings(true);await a.c.remote.importSettings('replace',JSON.stringify(adoc),true);assert.equal(a.c.remote.settings.values.fontSize,18);
 a.c.online=false;a.c.emit();assert.equal(a.c.getSnapshot().exports.find(x=>x.id==='settings').enabled,false);
 const count=a.downloads.length;assert.equal((await a.c.exportFile('settings')).ok,false);assert.equal(a.downloads.length,count);
});
test('settings response held across account retirement never reaches download',async t=>{
 const f=await setup(t),{c,downloads}=await controller(t,f,'a'),ready=deferred(),continueRead=deferred(),read=c.remote.read.bind(c.remote);
 c.remote.read=async p=>{const result=await read(p);ready.resolve();await continueRead.promise;return result;};
 const pending=c.exportFile('settings');await ready.promise;await c.invalidate('signed-out');continueRead.resolve();
 const result=await pending;assert.equal(result.ok,false);assert.equal(result.diagnostic.code,'ACCESS_CHANGED');assert.equal(downloads.length,0);
 assert.equal(c.getSnapshot().exports.find(x=>x.id==='settings').enabled,false);
});
