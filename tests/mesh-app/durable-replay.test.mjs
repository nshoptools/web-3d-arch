import test from 'node:test';import assert from 'node:assert/strict';
import {meshReplayDocumentMatches} from '../../src/mesh-import/src/app-csg-transaction.mjs';
const historyAsset='a'.repeat(64),dependency='b'.repeat(64),extra='c'.repeat(64);
const stored={state:{revision:5,value:'unchanged'},history:{assets:{[historyAsset]:20},cursor:1,transactions:[{id:'exact-transaction'}]},snapshots:{first:historyAsset},savedRevision:5,title:'test'};
test('opened empty retention list and manifest dependencies do not create a false stale head',()=>{
 assert.equal(meshReplayDocumentMatches(stored,{...stored,retainedAssets:[]},[]),true);
 assert.equal(meshReplayDocumentMatches(stored,{...stored,retainedAssets:[dependency]},[historyAsset,dependency]),true);
 assert.equal(meshReplayDocumentMatches(stored,{...stored,retainedAssets:[extra]},[]),false);
 assert.equal(Object.hasOwn(stored,'retainedAssets'),false);
});
test('retention normalization cannot hide a changed state, history, snapshots, save marker or metadata',()=>{
 for(const patch of [{state:{...stored.state,revision:6}},{state:{...stored.state,value:'other'}},{history:{...stored.history,cursor:0}},{history:{...stored.history,transactions:[]}},{snapshots:{first:extra}},{savedRevision:4},{title:'changed'}])assert.equal(meshReplayDocumentMatches(stored,{...stored,retainedAssets:[],...patch},[]),false);
 assert.throws(()=>meshReplayDocumentMatches(stored,stored,['not-a-hash']),{code:'MESH_REPLAY_DURABLE_DEPENDENCIES'});
});
