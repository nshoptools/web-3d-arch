import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as history from '../../src/storage/history.mjs';
import {sha256,parseJSON,canonicalJSON} from '../../src/storage/common.mjs';
const root=await realpath(process.env.PROJECT_ROOT),run=await realpath(process.env.PROJECT_REVIEW_RUN);
const runRelative=relative(root,run);
assert.ok(runRelative&&!isAbsolute(runRelative)&&!runRelative.startsWith('..'));
const domain=await import(pathToFileURL(join(root,'src/domain/index.mjs')).href);
const hashes={};
for(const name of (await readdir(join(root,'src/domain'))).filter(n=>n.endsWith('.mjs')))
  hashes[name]=await sha256(await readFile(join(root,'src/domain',name)));
await writeFile(join(run,'evidence/domain-adapter-input-hashes.json'),JSON.stringify(hashes,null,2));
function setSize(state,size){
  const command={id:'parameters.set',args:{changes:[{id:'size',value:size}]}};
  const preview=domain.previewCommand(state,command);assert.equal(preview.ok,true,JSON.stringify(preview.issues));
  const result=domain.commitPreview(state,preview);assert.equal(result.ok,true,JSON.stringify(result.issues));return result;
}
test('read-only main domain: reproduce exact strict undo limitation',()=>{
  const initial=domain.createProject({product:'keychain'});
  const a=setSize(initial,51),b=setSize(a.state,52);
  const undoneB=domain.undoTransaction(b.state,b.transaction);assert.equal(undoneB.ok,true);
  assert.equal(undoneB.state.revision,3);assert.equal(domain.effectiveValues(undoneB.state).size,51);
  const undoneA=domain.undoTransaction(undoneB.state,a.transaction);
  assert.equal(undoneA.ok,false);assert.equal(undoneA.issues[0].code,'stale-history');
});
test('candidate adapter + actual validateProject: three undo/redo, monotonic revision and branch fences',async()=>{
  let state=domain.createProject({product:'keychain',content:{raw:'001,700',text:'Giữ nguồn 🇻🇳'}});
  const snapshots=new Map();
  const ref=async s=>{const r=await history.snapshotReference(s);snapshots.set(r.stateHash,s);return r;};
  const original=await ref(state);let ledger=history.createHistory(original);
  for(const size of [51,52,53]){
    const edit=setSize(state,size);
    const plan=await history.planHistoryAppend(ledger,{id:'size-'+size,after:await ref(edit.state),command:edit.transaction.command});
    ledger=await history.acceptHistoryAppend(ledger,plan);state=edit.state;
  }
  const beforeUndo=state,trace=[];
  for(const direction of ['undo','undo','undo','redo','redo','redo']){
    const plan=await history.planHistoryMove(ledger,direction);
    const result=await history.restoreDomainSnapshot(state,snapshots.get(plan.target.stateHash),plan,{validateDomain:domain.validateProject});
    ledger=await history.acceptHistoryMove(ledger,plan,result.appliedReference);state=result.candidate;
    assert.equal(result.requiresAtomicProjectCommit,true);assert.equal(result.geometryVerified,false);
    trace.push({revision:state.revision,size:domain.effectiveValues(state).size});
    assert.deepEqual(state.content,{raw:'001,700',text:'Giữ nguồn 🇻🇳'});
  }
  assert.deepEqual(trace.map(t=>t.revision),[4,5,6,7,8,9]);
  assert.deepEqual(trace.slice(0,2).map(t=>t.size),[52,51]);
  assert.equal(trace[2].size,domain.effectiveValues(snapshots.get(original.stateHash)).size);
  assert.deepEqual(trace.slice(3).map(t=>t.size),[51,52,53]);
  assert.equal(await history.domainStateFingerprint(state),await history.domainStateFingerprint(beforeUndo));
  const stale=await history.planHistoryMove(ledger,'undo');
  const foreignBranch=setSize(state,60).state;
  await assert.rejects(()=>history.restoreDomainSnapshot(foreignBranch,snapshots.get(stale.target.stateHash),stale,{validateDomain:domain.validateProject}),{code:'STALE_HISTORY_BRANCH'});
  const forged={...stale,targetCursor:0};
  const result=await history.restoreDomainSnapshot(state,snapshots.get(stale.target.stateHash),stale,{validateDomain:domain.validateProject});
  await assert.rejects(()=>history.acceptHistoryMove(ledger,forged,result.appliedReference),{code:'HISTORY_PLAN_CHANGED'});
  const badTarget=structuredClone(snapshots.get(stale.target.stateHash));badTarget.product='invalid';
  await assert.rejects(()=>history.restoreDomainSnapshot(state,badTarget,stale,{validateDomain:domain.validateProject}),{code:'HISTORY_TARGET'});
  await writeFile(join(run,'evidence/domain-history-trace.json'),JSON.stringify({trace,domainFiles:hashes,geometryVerified:false,mainModified:false},null,2));
});
test('number tokens retain exact decimal value or refuse before mutation',()=>{
  for(const token of ['0.05','0.02','1.7','5.5','1.7000','1e-2','100e-2','-0'])
    assert.equal(typeof parseJSON('{"n":'+token+'}').n,'number');
  for(const token of ['9007199254740993','0.10000000000000001','1e309','1e-400'])
    assert.throws(()=>parseJSON('{"n":'+token+'}'),{code:'NUMBER_LOSS'});
  assert.equal(parseJSON('{"raw":"1,7"}').raw,'1,7');
  assert.throws(()=>parseJSON('{"constructor":1}'),{code:'UNSAFE_KEY'});
  assert.throws(()=>parseJSON('{"x":1,"x":2}'),{code:'DUPLICATE_KEY'});
});
