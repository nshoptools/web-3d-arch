import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {inspectSTL,verifyReceipt,inspectRescue} from './support/readback.mjs';
import {inspectMesh} from './support/mesh-oracle.mjs';
import {geometryHash,sha256} from './fixtures.mjs';
export const DEADLINES=Object.freeze({startup:60000,command:45000,download:45000,idle:45000,case:300000});
export function deadline(promise,ms,phase){
 let timer;return Promise.race([promise,new Promise((_,no)=>{timer=setTimeout(()=>no(Error(phase+'_DEADLINE_'+ms)),ms);})]).finally(()=>clearTimeout(timer));
}
export class Driver{
 constructor(runtime){Object.assign(this,{runtime,page:runtime.page,steps:[],last:null});}
 async write(name,value){await writeFile(join(this.runtime.dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
 async record(name,action){
  const start=performance.now();try{const result=await deadline(action(),DEADLINES.command,name);this.steps.push({name,durationMs:performance.now()-start,result});return result;}
  catch(error){this.steps.push({name,durationMs:performance.now()-start,error:String(error.stack??error)});throw error;}
 }
 async snapshot(){return this.page.evaluate(()=>csgAcceptance.snapshot());}
 async idle(){
  await this.page.waitForFunction(()=>globalThis.csgAcceptance&&(!csgAcceptance.snapshot().job||csgAcceptance.snapshot().controller.pendingChange),undefined,{timeout:DEADLINES.idle});
  const s=await this.snapshot();assert.equal(s.controller.pendingChange,null,'unexpected pending proposal before next ordinary command');
 }
 async command(command,{expectProposal=false}={}){
  const r=await this.record(command.type+(command.id?':'+command.id:''),()=>this.page.evaluate(command=>csgAcceptance.dispatch(command),command));
  if(!expectProposal)assert.equal(r.ok,true,JSON.stringify(r));
  return r;
 }
 async checkpoint(name){
  const point=await deadline(this.page.evaluate(()=>csgAcceptance.checkpoint()),DEADLINES.command,'checkpoint');
  assert.equal(point.headRevision,point.durable.headRevision);
  assert.deepEqual(point.state,point.durable.state,'visible document must equal actual durable document');
  assert.deepEqual(point.history,point.durable.history,'history equals durable journal');
  for(const a of point.durable.assets)assert.equal(a.actualSHA256,a.hash,'verified stored bytes');
  await this.write(name+'.json',point);this.last=point;return point;
 }
 async model(name){
  const reply=await this.page.evaluate(()=>csgAcceptance.modelBytes()),bytes=Buffer.from(reply.base64,'base64');
  assert.ok(bytes.length>128&&bytes.length<=16*1024*1024);await writeFile(join(this.runtime.dir,name+'.arch'),bytes,{flag:'wx'});
  return bytes;
 }
 async importOriginal(file,purpose){
  const r=await this.record('import-'+purpose,()=>this.page.evaluate(({file,purpose})=>csgAcceptance.importFile(file,purpose),{
   file:{name:file.name,mediaType:file.mediaType,base64:file.bytes.toString('base64')},purpose}));
  if(!r.ok){
   assert.equal(purpose,'source','original mesh intake must not smuggle in unit or CSG consent');
   const p=this.proposal(r,['source import','product source update']);await this.approve(p);
  }
  await this.idle();return r;
 }
 proposal(result,kinds){
  assert.equal(result.ok,false,'an explicit approval is mandatory');
  assert.equal(result.diagnostic.code,'PROPOSAL_REQUIRED',JSON.stringify(result));
  const retry=result.confirmation?.retry;
  assert.deepEqual(Object.keys(retry??{}).sort(),['confirmed','id','type']);assert.equal(retry.type,'proposal.accept');assert.equal(retry.confirmed,true);
  assert.ok(Array.isArray(result.confirmation.changes)&&result.confirmation.changes.length>0);
  return {retry,description:result.confirmation,kinds};
 }
 async checkProposal(p){
  const s=await this.snapshot(),pending=s.controller.pendingChange;
  assert.equal(pending?.id,p.retry.id);assert.ok(p.kinds.includes(pending.kind),JSON.stringify(pending));
  assert.match(pending.outputHash,/^[0-9a-f]{64}$/);assert.ok(s.job?.id);
  p.jobId=s.job.id;p.outputHash=pending.outputHash;return p;
 }
 async approve(p,{expectProposal=false}={}){
  await this.checkProposal(p);
  const result=await this.command(p.retry,{expectProposal});
  if(!expectProposal)await this.idle();return result;
 }
 async build(){await this.idle();await this.command({type:'geometry.build'});await this.idle();const s=await this.snapshot();assert.equal(s.project.visibleModelStale,false);assert.equal(s.project.visibleModelRevision,s.project.revision);assert.equal(s.project.stats.verdict,'pass','actual checker must qualify model');return s;}
 async download(id,name){
  const events=[];let resolveFirst;const first=new Promise(r=>resolveFirst=r),listener=d=>{events.push(d);resolveFirst(d);};
  this.page.on('download',listener);let conditioning=null;
  try{
   let r=await this.record('export-'+id,()=>this.page.evaluate(id=>csgAcceptance.exportFile(id),id));
   if(!r.ok){
    assert.equal(id,'stl-union','only STL serialization consent is allowed here');
    const p=this.proposal(r,['export conditioning','export approximation']);await this.checkProposal(p);
    assert.equal(events.length,0,'no download before consent');
    const before=await this.checkpoint(name+'-pre-export-consent');
    conditioning={id:p.retry.id,hash:p.outputHash,changes:p.description.changes,explicitlyApproved:true};
    r=await this.approve(p);const after=await this.checkpoint(name+'-post-export-consent');
    unchanged(before,after,{model:true});
   }
   assert.equal(r.ok,true,JSON.stringify(r));
   const download=events[0]??await deadline(first,DEADLINES.download,'download');
   assert.equal(await download.failure(),null);const path=join(this.runtime.dir,name);await download.saveAs(path);await this.idle();
   assert.equal(events.length,1,'exactly one real browser download');const bytes=await readFile(path);
   const record={filename:download.suggestedFilename(),path,sha256:sha256(bytes),bytes:bytes.length,conditioning};
   await this.write(name+'.download.json',record);return {bytes,record};
  }finally{this.page.off('download',listener);}
 }
 async receipt(formatId,artifact,name){
  const s=await this.snapshot(),receipt=s.exportReceipts.find(r=>r.formatId===formatId&&r.projectRevision===s.project.revision);
  assert.ok(receipt,'current export receipt');const pending=this.page.waitForEvent('download',{timeout:DEADLINES.download});
  const result=await this.command({type:'export.receipt',id:receipt.id});assert.equal(result.ok,true);
  const download=await pending;assert.equal(await download.failure(),null);
  const path=join(this.runtime.dir,name);await download.saveAs(path);const bytes=await readFile(path);
  const document=verifyReceipt(bytes,artifact,{projectId:s.project.id,revision:s.project.revision,formatId});
  assert.equal(document.artifact.inspection,false,'normal export, not inspection-only artifact');
  await this.write(name+'.download.json',{filename:download.suggestedFilename(),path,sha256:sha256(bytes),bytes:bytes.length});
  return document;
 }
 async stl(name){
  const d=await this.download('stl-union',name),parsed=inspectSTL(d.bytes),oracle=inspectMesh(parsed.mesh),signature=geometryHash(parsed.mesh);
  const receipt=await this.receipt('stl-union',d.bytes,name+'.receipt.json');
  await this.write(name+'.readback.json',{sha256:parsed.sha256,geometryHash:signature,bounds:parsed.bounds,oracle,receipt,
   limits:'Independent finite/manifold/winding/vertex-link/volume checks; no new global self-intersection, fit or whole-pipeline-error proof'});
  return {...d,parsed,oracle,signature,receipt};
 }
 async rescue(name,file){
  const d=await this.download('project',name),r=inspectRescue(d.bytes),h=sha256(file.bytes);
  assert.equal(r.state.content.app.mesh.raw.hash,h);
  assert.deepEqual(r.files.get('assets/'+h+'.bin'),file.bytes,'original imported bytes survive actual rescue package');
  const snapshot=await this.snapshot();assert.equal(r.metadata.projectId,snapshot.project.id);assert.equal(r.state.revision,snapshot.project.revision);
  await this.write(name+'.readback.json',{manifest:r.metadata.selectedManifestHash,revision:r.state.revision,entries:r.files.size,originalSHA256:h});
  return r;
 }
 async saveSteps(){await this.write('steps.json',this.steps);await this.write('subscription-events.json',await this.page.evaluate(()=>csgAcceptance.events()));}
}
export function unchanged(a,b,{model=true}={}){
 assert.equal(b.projectId,a.projectId);assert.equal(b.headRevision,a.headRevision);assert.deepEqual(b.state,a.state);assert.deepEqual(b.history,a.history);
 assert.deepEqual(b.durable.head,a.durable.head);assert.deepEqual(b.sourceHashes,a.sourceHashes);
 if(model)assert.deepEqual(b.visible,a.visible,'pending/cancel cannot replace or release the visible lease');
}

