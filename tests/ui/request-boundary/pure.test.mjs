import assert from 'node:assert/strict';import test from 'node:test';import path from 'node:path';import {pathToFileURL} from 'node:url';import {env,safe} from './support.mjs';
const {run}=env(),input=safe(run,process.env.ARCH_UI_TEST_INPUT);
const {accountIdentity,projectIdentity,requestKey,fileKey}=await import(pathToFileURL(path.join(input,'src/ui/core/identity.ts')));
const {createRequestContext}=await import(pathToFileURL(path.join(input,'src/ui/core/request-context.ts')));
function clock(){
 let snapshot={session:{status:'signed-in',user:{id:'A'}},project:{id:'P1',revision:0}};const listeners=new Set();
 const bridge={getSnapshot:()=>snapshot,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}};
 return {bridge,context:createRequestContext(bridge),update(values,notify=true){snapshot={...snapshot,...values};if(notify)for(const f of [...listeners])f();},get listeners(){return listeners.size;}};
}
test('File object identity distinguishes identical metadata and different bytes',async()=>{
 const options={type:'image/png',lastModified:1234},a=new File([new Uint8Array([1,2])],'same.png',options),b=new File([new Uint8Array([3,4])],'same.png',options);
 for(const k of ['name','size','type','lastModified'])assert.equal(a[k],b[k]);assert.notDeepEqual(new Uint8Array(await a.arrayBuffer()),new Uint8Array(await b.arrayBuffer()));
 assert.equal(fileKey(a),fileKey(a));assert.notEqual(fileKey(a),fileKey(b));assert.equal(fileKey(null),fileKey(undefined));assert.equal(fileKey(null),'no-file');
});
test('tuple keys keep arbitrary separators, quotes, backslashes and scalar types distinct',()=>{
 for(const s of ['|','::','\u001f','\u0000','","','\\','💬'])assert.notEqual(requestKey(['a'+s+'b','c']),requestKey(['a','b'+s+'c']));
 assert.notEqual(requestKey([true]),requestKey(['true']));assert.notEqual(requestKey([1]),requestKey(['1']));assert.notEqual(requestKey(['']),requestKey([]));
 const prompt='Dấu | :: \u001f, "quoted" \\ Việt';assert.deepEqual(JSON.parse(requestKey([prompt,1,false,null])),[prompt,1,false,null]);
});
test('account/project identity is unambiguous and excludes edit revision',()=>{
 const a={session:{status:'signed-in',user:{id:'A|B'}},project:{id:'P1',revision:1}},b=structuredClone(a);b.project.revision++;
 assert.equal(projectIdentity(a),projectIdentity(b));b.project.id='P2';assert.notEqual(projectIdentity(a),projectIdentity(b));assert.equal(accountIdentity(a),accountIdentity(b));
 b.session.user.id='A';assert.notEqual(accountIdentity(a),accountIdentity(b));
});
test('context is inactive before start and retires both counters on cleanup',()=>{
 const c=clock();assert.deepEqual(c.context.read(),{account:0,project:0,active:false});const stop=c.context.start();const started=c.context.read();assert.equal(c.listeners,1);assert.equal(started.active,true);
 stop();const end=c.context.read();assert.equal(c.listeners,0);assert.equal(end.active,false);assert.ok(end.account>started.account&&end.project>started.project);stop();assert.deepEqual(c.context.read(),end);
});
test('account A→B→A notifications remain visible even with equal final identity',()=>{
 const c=clock(),stop=c.context.start(),before=c.context.read();
 c.update({session:{status:'signed-in',user:{id:'B'}}});c.update({session:{status:'signed-in',user:{id:'A'}}});
 const after=c.context.read();assert.equal(after.account,before.account+2);assert.equal(after.project,before.project+2);stop();
});
test('project P1→P2→P1 notifications retire earlier work without account change',()=>{
 const c=clock(),stop=c.context.start(),before=c.context.read();c.update({project:{id:'P2',revision:0}});c.update({project:{id:'P1',revision:0}});
 const after=c.context.read();assert.equal(after.account,before.account);assert.equal(after.project,before.project+2);stop();
});
test('ordinary edit notifications do not replace account/project ownership',()=>{
 const c=clock(),stop=c.context.start(),before=c.context.read();c.update({project:{id:'P1',revision:7}});assert.deepEqual(c.context.read(),before);stop();
});
test('read observes current bridge identity even before React processes its subscription',()=>{
 const c=clock(),stop=c.context.start(),before=c.context.read();c.update({session:{status:'expired',user:{id:'A'}}},false);assert.ok(c.context.read().account>before.account);stop();
});
test('restart owns one subscription and an older cleanup cannot retire its replacement',()=>{
 const c=clock(),oldStop=c.context.start(),before=c.context.read(),newStop=c.context.start();assert.equal(c.listeners,1);const next=c.context.read();assert.ok(next.account>before.account);
 oldStop();assert.deepEqual(c.context.read(),next);newStop();assert.equal(c.context.read().active,false);assert.equal(c.listeners,0);
});
test('only latest navigation owns publication; retirement invalidates navigation',()=>{
 const c=clock(),stop=c.context.start(),a=c.context.beginNavigation(),b=c.context.beginNavigation();assert.equal(c.context.isCurrentNavigation(a),false);assert.equal(c.context.isCurrentNavigation(b),true);stop();assert.equal(c.context.isCurrentNavigation(b),false);
});
