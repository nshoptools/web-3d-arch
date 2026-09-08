import test from 'node:test';import assert from 'node:assert/strict';
import {createAppController} from '../../src/app/controller.mjs';
import {newDocument} from '../../src/app/documents.mjs';
import {domainStateFingerprint} from '../../src/storage/history.mjs';
import {VERSION} from '../../src/app/common.mjs';
import {scheduleApplicationPreparation} from '../../src/integration/preparation-scheduler.mjs';
import {namedTestAdapters,deferred} from './test-doubles.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
const ok=r=>assert.equal(r.ok,true,JSON.stringify(r));
async function fixture(t,preparation){
 const f=namedTestAdapters(),c=createAppController({origin:'https://test.invalid',deviceId:'TEST-device',adapters:{...f.adapters,preparation}});
 const d=await newDocument('keychain');c.doc=d.document;c.assets=d.assets;c.projectId='TEST-project';
 c.store={status:()=>({canEdit:true,canRescue:true,capabilities:{database:{readOnly:false}}}),close(){}};
 c.session={...c.session,status:'signed-in',user:{id:'TEST-user',name:'TEST',role:'member'}};c.emit();
 t.after(()=>c.dispose());return {c,controls:f.controls};
}
async function advance(c){const state={...c.doc.state,revision:c.doc.state.revision+1};c.doc={...c.doc,state,history:{...c.doc.history,current:{...c.doc.history.current,stateHash:await domainStateFingerprint(state)}}};c.job?.abort.abort();c.emit();}

test('model qualification uses the visible owned lease and same cancellable job; verdict does not mutate native stats',async t=>{
 const entered=deferred(),wait=deferred(),verdicts=new WeakMap();let c,input;
 ({c}=await fixture(t,{async prepare(){},async qualifyModel(i){input=i;assert.equal(c.visible.lease,i.model);assert.equal(c.job.id,i.ticket.id);entered.resolve();await wait.promise;verdicts.set(i.model,'pass');},modelVerdict:m=>verdicts.get(m)??'unverified'}));
 const build=c.dispatch({type:'geometry.build'});await entered.promise;
 assert.equal(c.job.stage,'Kiểm tra mô hình');assert.equal(c.getSnapshot().project.stats.verdict,'unverified');
 wait.resolve();ok(await build);assert.equal(c.job,null);assert.equal(c.getSnapshot().project.stats.verdict,'pass');assert.equal(input.model.stats.verdict,'unverified');
 await advance(c);assert.equal(c.getSnapshot().project.stats.verdict,'unverified');
});
test('failed independent qualification keeps the actual model visible with failed evidence and ends its job',async t=>{
 let failed=null;const {c}=await fixture(t,{async prepare(){},async qualifyModel(i){failed=i.model;throw Object.assign(Error(),{code:'TEST_MESH_FAILED'});},modelVerdict:m=>m===failed?'fail':'unverified'});
 const r=await c.dispatch({type:'geometry.build'});assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'TEST_MESH_FAILED');assert.equal(c.visible.lease,failed);assert.equal(c.job,null);assert.equal(c.getSnapshot().project.stats.verdict,'fail');
});
test('a cancelled qualification cannot finish or replace the next build; each old lease releases once',async t=>{
 const entered=deferred(),wait=deferred();let calls=0,first;
 const {c,controls}=await fixture(t,{async prepare(){},async qualifyModel(i){if(++calls===1){first=i;entered.resolve();await wait.promise;}},modelVerdict:()=> 'unverified'});
 const old=c.dispatch({type:'geometry.build'});await entered.promise;
 ok(await c.dispatch({type:'job.cancel',id:c.job.id}));ok(await c.dispatch({type:'geometry.build'}));const current=c.visible.lease;
 wait.resolve();assert.equal((await old).ok,false);assert.equal(first.signal.aborted,true);assert.equal(c.visible.lease,current);assert.equal(c.job,null);assert.equal(controls.releases.filter(x=>x===first.ticket.id).length,1);
});
test('source preparation owns copied inputs, uses no history transaction and refreshes the checked printer list',async t=>{
 const entered=deferred(),wait=deferred();let input;
 const {c}=await fixture(t,{async prepare(i){input=i;entered.resolve();await wait.promise;}});
 c.assets.set('TEST-only-asset',{bytes:new Uint8Array([1,2])});c.adapters.printing={version:VERSION,capabilities:[],async list(){return [{id:'TEST-profile',label:'TEST sealed profile',filamentSlots:2,qualified:false}];}};
 const document=c.doc,task=c.prepareCurrent();await entered.promise;assert.ok(Object.isFrozen(input.state));assert.equal(input.ticket.id,c.job.id);c.assets.get('TEST-only-asset').bytes[0]=9;assert.equal(input.assets.get('TEST-only-asset')[0],1);
 wait.resolve();await task;assert.equal(c.doc,document);assert.equal(c.printers[0].id,'TEST-profile');assert.equal(c.job,null);
});
test('scheduler coalesces progress, waits for foreground jobs/proposals and prepares the latest head',async t=>{
 const entered=deferred(),wait=deferred();let count=0;const revisions=[];
 const {c}=await fixture(t,{async prepare(i){revisions.push(i.ticket.revision);if(++count===1){entered.resolve();await wait.promise;}}});
 const stop=scheduleApplicationPreparation(c);t.after(stop);await entered.promise;
 c.emit();c.emit();await advance(c);await advance(c);assert.equal(count,1);wait.resolve();
 for(let i=0;i<30&&count<2;i++)await tick();assert.equal(count,2);assert.deepEqual(revisions,[0,2]);
 await tick();c.emit();await tick();assert.equal(count,2);
 c.pendingOperation={id:'TEST-proposal',release(){}};await advance(c);await tick();assert.equal(count,2);c.pendingOperation=null;c.emit();
 for(let i=0;i<30&&count<3;i++)await tick();assert.equal(count,3);
});
test('a source preparation retired by access change cannot restore printers or attach its error to a later account',async t=>{
 const entered=deferred(),wait=deferred();let listCalls=0;
 const {c}=await fixture(t,{async prepare(){entered.resolve();await wait.promise;throw Object.assign(Error(),{code:'TEST_OLD_ACCOUNT_FAILURE'});}});
 c.adapters.printing={version:VERSION,capabilities:[],async list(){listCalls++;return [];}};
 const stop=scheduleApplicationPreparation(c);t.after(stop);await entered.promise;await c.invalidate();wait.resolve();await tick();await tick();
 assert.equal(listCalls,1);assert.deepEqual(c.printers,[]);assert.equal(c.diagnostics.some(d=>d.code==='TEST_OLD_ACCOUNT_FAILURE'),false);assert.equal(c.job,null);
});
test('invalid source preparation still retires an earlier account-settings printer list',async t=>{
 const {c}=await fixture(t,{async prepare(){throw Object.assign(Error(),{code:'TEST_SOURCE_UNAVAILABLE'});}});
 c.printers=[{id:'OLD'}];c.adapters.printing={version:VERSION,capabilities:[],async list(){return [];}};
 await assert.rejects(c.prepareCurrent(),{code:'TEST_SOURCE_UNAVAILABLE'});assert.deepEqual(c.printers,[]);assert.equal(c.job,null);
});
