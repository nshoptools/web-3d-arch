import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {uid,png,hash,deferred} from './helpers.mjs';
// Resolve real dependencies in main, or the explicitly frozen inputs when running a disjoint candidate.
const source=new URL('../../src/app/remote.mjs',import.meta.url),local=new URL('../../src/app/common.mjs',import.meta.url);
const common=existsSync(local)?local:new URL('../../../../inputs/main/src/app/common.mjs',import.meta.url);
assert.ok(existsSync(common),'Candidate needs its checked inputs/main/src/app/common.mjs; outputs stay in caller RunId');
const text=readFileSync(source,'utf8').replace("'./common.mjs'",JSON.stringify(common.href));
const {RemoteServices}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
function fixture(){
 const ctx={id:uid(),revision:1},calls=[],gates={},api={epoch:0,userId:'synthetic-member-a'},op=uid(),jobId=uid();
 api.request=async(path,o={})=>{
  calls.push({path,options:o});if(gates[path])await gates[path].promise;
  if(path==='/api/v1/ai/references'){
   const b=o.body;assert.equal(b.sha256,hash(Buffer.from(b.base64,'base64')));assert.equal(b.byteLength,png.length);
   return {value:{reference:{version:'arch-ai-reference/1',id:b.uploadId,revision:1,sha256:b.sha256,byteLength:b.byteLength,mediaType:b.mediaType,width:1,height:1,projectId:b.projectId,projectRevision:b.projectRevision,expiresAt:Date.now()+1800000}}};
  }
  if(path==='/api/v1/ai/jobs'){const b=o.body;return {value:{job:{id:jobId,ownerId:api.userId,projectId:b.projectId,projectRevision:b.projectRevision,quoteHash:'quote',sequence:1,quote:{currency:'USD',maxCostMicros:70000,expiresAt:Date.now()+60000,recipient:'https://api.x.ai/v1/images/edits',dataToSend:['prompt','options','reference '+b.reference.sha256],unknowns:[]},accounting:{reservedMicros:0}}}};}
  if(path==='/api/v1/ai/artifacts/art')return {value:{id:'art',jobId,byteLength:png.length,sha256:hash(png),mediaType:'image/png'}};
  if(path==='/api/v1/ai/jobs/'+jobId)return {value:{job:{id:jobId,ownerId:api.userId,projectId:ctx.id,projectRevision:'1',sequence:1,accounting:{reservedMicros:0}}}};
  if(path==='/api/v1/ai/artifacts/art/download')return {bytes:png,mediaType:'image/png'};
  throw Error('unexpected route');
 };
 const remote=new RemoteServices(api,{context:()=>ctx});remote.providers=[{id:'xai',allowed:true,displayName:'xAI',models:[{id:'image',version:'v1',referenceImages:true,referenceOptions:[{quality:'medium',size:'1k'}],qualities:['low','medium'],sizes:['1k']}]}];remote.credentials=[{id:uid(),providerId:'xai',status:'active',label:'mine',masked:'****1234'}];
 const request={providerId:'xai',modelId:'image',prompt:'paint a pavilion',quality:'medium',size:'1k',operationId:op,reference:new File([png],'source.png',{type:'image/png'})};
 return {remote,request,api,ctx,calls,gates};
}
test('B03 remote: existing AIImageRequest File binds actual bytes/hash once across concurrent prepare',async()=>{
 const f=fixture(),before=Buffer.from(await f.request.reference.arrayBuffer()),[a,b]=await Promise.all([f.remote.prepare(f.request),f.remote.prepare(f.request)]);
 assert.deepEqual(a,b);assert.equal(a.maximumCost,'0.07');assert.equal(f.calls.length,2);assert.equal(f.calls[0].path,'/api/v1/ai/references');assert.equal(f.calls[1].options.body.reference.sha256,hash(before));
 assert.equal(f.calls[1].options.idempotencyKey,f.request.operationId);assert.ok(before.equals(Buffer.from(await f.request.reference.arrayBuffer())));assert.equal(f.remote.registry()[0].models[0].supportsReference,true);
});
test('B03 remote: no network for unsupported reference quality, format or byte limit',async()=>{
 for(const patch of [{quality:'low'},{reference:new File(['x'],'x.webp',{type:'image/webp'})},{reference:new File([new Uint8Array(8_000_001)],'x.png',{type:'image/png'})}]){
  const f=fixture();await assert.rejects(f.remote.prepare({...f.request,...patch}),/REFERENCE_/);assert.equal(f.calls.length,0);
 }
});
test('B03 remote: source revision and logout changing during File read publish neither upload nor job',async()=>{
 for(const kind of ['source','logout']){
  const f=fixture(),gate=deferred();
  class Delayed extends File{async arrayBuffer(){await gate.promise;return super.arrayBuffer();}}
  const p=f.remote.prepare({...f.request,reference:new Delayed([png],'x.png',{type:'image/png'})});
  if(kind==='source')f.ctx.revision++;else{f.api.epoch++;f.api.userId='different';}
  gate.resolve();await assert.rejects(p,kind==='source'?/AI_PROJECT_STALE/:/ACCESS_CHANGED/);assert.equal(f.calls.length,0);
 }
});
test('B03 remote: late upload response after source replacement cannot prepare an AI job',async()=>{
 const f=fixture(),gate=deferred();f.gates['/api/v1/ai/references']=gate;
 const p=f.remote.prepare(f.request);while(!f.calls.length)await new Promise(r=>setTimeout(r,1));
 f.ctx.revision++;gate.resolve();await assert.rejects(p,/AI_PROJECT_STALE/);assert.equal(f.calls.length,1);
});
test('B03 remote: late prepared response after logout cannot enter current job cache',async()=>{
 const f=fixture(),gate=deferred();f.gates['/api/v1/ai/jobs']=gate;
 const p=f.remote.prepare(f.request);while(f.calls.length<2)await new Promise(r=>setTimeout(r,1));
 f.api.epoch++;f.remote.clear();gate.resolve();await assert.rejects(p,/ACCESS_CHANGED/);assert.equal(f.remote.jobs.size,0);
});
test('B03 remote: checked artifact download must still match project/epoch after the final await',async()=>{
 for(const kind of ['source','logout']){
  const f=fixture(),gate=deferred();f.gates['/api/v1/ai/artifacts/art/download']=gate;
  const p=f.remote.artifact('art');while(f.calls.length<3)await new Promise(r=>setTimeout(r,1));
  if(kind==='source')f.ctx.revision++;else f.api.epoch++;
  gate.resolve();await assert.rejects(p,kind==='source'?/AI_PROJECT_STALE/:/ACCESS_CHANGED/);
 }
});
test('B03 remote: operation id cannot swap reference File during concurrent preparation',async()=>{
 const f=fixture(),gate=deferred();f.gates['/api/v1/ai/references']=gate;
 const p=f.remote.prepare(f.request);while(!f.calls.length)await new Promise(r=>setTimeout(r,1));
 await assert.rejects(f.remote.prepare({...f.request,reference:new File([png],'other.png',{type:'image/png'})}),/IDEMPOTENCY_CONFLICT/);
 gate.resolve();await p;assert.equal(f.calls.length,2);
});
