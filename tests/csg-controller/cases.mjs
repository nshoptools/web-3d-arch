import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Driver,unchanged} from './driver.mjs';
import {readSnapshot} from './support/mesh-oracle.mjs';
import {readGenerated,chooseCuboid,authoredFile,assertOriginal,verifyReplayBindings,sha256} from './fixtures.mjs';
const source=await readFile(new URL('./hai-mau-co-lo.svg',import.meta.url));
const withoutRevision=s=>{const v=structuredClone(s);delete v.revision;return v;};
function oneCommit(before,after){
 assert.equal(after.state.revision,before.state.revision+1);assert.equal(after.headRevision,before.headRevision+1);
 assert.equal(after.history.cursor,before.history.cursor+1);assert.equal(after.history.transactions.length,before.history.transactions.length+1);
 assert.equal(after.history.transactions.at(-1).command.type,'mesh.apply');
 assert.equal(after.visible.kind,'mesh-scene');assert.equal(after.visible.ticket.revision,after.state.revision);
 assert.equal(after.snapshot.project.visibleModelStale,false);assert.equal(after.snapshot.project.stats.verdict,'pass');
 assert.equal(after.snapshot.controller.pendingChange,null);
}
async function setup(driver,{operation,target}){
 await driver.idle();await driver.command({type:'project.create',product:'keychain'});await driver.idle();
 await driver.importOriginal({name:'hai-mau-co-lo.svg',mediaType:'image/svg+xml',bytes:source},'source');
 await driver.build();
 const generated=await driver.checkpoint('generated'),model=await driver.model('generated');
 assert.equal(generated.state.content.app.source.raw.hash,sha256(source));
 const parsed=readGenerated(model,generated),fixture=chooseCuboid(parsed,{operation,target});
 await driver.write('authored-fixture.json',fixture);
 const baseline=await driver.stl('generated.stl');
 return {generated,fixture,baseline,parsed};
}
async function importMesh(driver,fixture,format){
 const file=authoredFile(fixture,format);
 await writeFile(join(driver.runtime.dir,file.name),file.bytes,{flag:'wx'});
 await driver.importOriginal(file,'mesh');
 // All mutations below go through the normal public command. No private state edits.
 for(const [id,value] of [['impOp',fixture.operation==='import-as-part'?'them':fixture.operation==='union'?'han':'tru'],['impScale','100'],['impX','0'],['impY','0'],['impZ','0'],['impRX','0'],['impRY','0'],['impRZ','0'],['impOn',true]]){
  const current=(await driver.snapshot()).project.parameters.find(p=>p.id===id);
  assert.ok(current,'declared import parameter');
  if(current.value===value){driver.steps.push({name:'explicit-transform-selection',id,value,unchanged:true});continue;}
  const command={type:'parameter.set',id,value};
  const result=await driver.command(command,{expectProposal:true});
  if(!result.ok){const proposal=driver.proposal(result,['product source update']);await driver.write('parameter-'+id+'-consent.json',{command,proposal});await driver.approve(proposal);}
  await driver.idle();assert.equal((await driver.snapshot()).project.parameters.find(p=>p.id===id).value,value);
 }
 if(fixture.resolvedTargetId)await driver.command({type:'selection.set',blockId:fixture.resolvedTargetId});
 const before=await driver.checkpoint('before-apply');assertOriginal(before,file);
 assert.equal(before.state.content.app.mesh.applied,false);assert.ok(before.snapshot.project.importedMesh.unappliedFields.length>0);
 return {file,before,command:{type:'mesh.apply',unit:'millimeter',...(fixture.targetId?{targetId:fixture.targetId}:{}),materialId:fixture.materialId}};
}
async function firstProposal(driver,command,before,label){
 const result=await driver.command(command,{expectProposal:true}),p=driver.proposal(result,['đơn vị và vật liệu khối nhập']);
 await driver.checkProposal(p);await driver.write(label+'-proposal.json',p);
 const at=await driver.checkpoint(label+'-checkpoint');unchanged(before,at);
 assert.equal(at.state.content.app.mesh.applied,false);return p;
}
async function secondProposal(driver,first,before,label){
 const result=await driver.approve(first,{expectProposal:true}),p=driver.proposal(result,['áp dụng khối nhập']);
 await driver.checkProposal(p);
 assert.notEqual(p.retry.id,first.retry.id);assert.notEqual(p.outputHash,first.outputHash);
 assert.equal(p.jobId,first.jobId,'native input and CSG proposal retain the exact original job via handoff');
 await driver.write(label+'-proposal.json',p);const at=await driver.checkpoint(label+'-checkpoint');unchanged(before,at);
 assert.equal(at.state.content.app.mesh.applied,false);return p;
}
function volumeDelta(baseline,result,fixture){
 const actual=result.oracle.volume-baseline.oracle.volume,expected=fixture.expectedVolumeDelta;
 // Independent float32 download precision allowance; far smaller than the
 // authored cut/addition. This is not a whole-pipeline error qualification.
 const tolerance=Math.max(.00005,Math.abs(expected)*.002);
 assert.ok(Math.abs(actual-expected)<=tolerance,JSON.stringify({actual,expected,tolerance}));
 return {actual,expected,tolerance};
}
async function replay(driver,committed,fixture,file,exported){
 await driver.command({type:'project.save'});await driver.idle();const saved=await driver.checkpoint('saved');
 assert.equal(saved.state.revision,committed.state.revision);assert.equal(saved.savedRevision,committed.state.revision);
 await driver.command({type:'project.open',id:committed.projectId});await driver.idle();
 const opened=await driver.checkpoint('opened');assert.equal(opened.visible,null);
 assert.deepEqual(opened.state,committed.state);assert.equal(opened.headRevision,saved.headRevision);
 await driver.build();const rebuilt=await driver.checkpoint('replayed');
 assert.equal(rebuilt.headRevision,saved.headRevision,'rebuild cannot append journal head');
 assert.deepEqual(rebuilt.state,committed.state);assert.deepEqual(rebuilt.history,saved.history);
 verifyReplayBindings(rebuilt,fixture,file);
 assert.deepEqual(opened.snapshot.project.importedMesh.targets,committed.state.content.app.mesh.metadata.meshCsg.operation.targetOptions,'original target choices survive reopen before build');
 assert.deepEqual(rebuilt.snapshot.project.importedMesh.targets,opened.snapshot.project.importedMesh.targets,'derived geometry must not replace original choices');
 const replayed=await driver.stl('replayed.stl');
 assert.equal(replayed.signature,exported.signature,'exact geometry across replay; transport generation/header is not geometry identity');
 await driver.rescue('csg-originals.arch-project.zip',file);
 return rebuilt;
}
export const CASES=[
 {id:'STL-TWO-APPROVALS-REPLAY-HISTORY',async run(runtime){
  const d=new Driver(runtime);try{
   const {fixture,baseline}=await setup(d,{operation:'difference',target:'main-body'});
   const {file,before,command}=await importMesh(d,fixture,'stl');
   const p1=await firstProposal(d,command,before,'input'),p2=await secondProposal(d,p1,before,'csg');
   await d.approve(p2);const committed=await d.checkpoint('committed');oneCommit(before,committed);verifyReplayBindings(committed,fixture,file);
   const exported=await d.stl('subtracted.stl'),delta=volumeDelta(baseline,exported,fixture);
   const rebuilt=await replay(d,committed,fixture,file,exported);
   await d.command({type:'history.undo'});await d.idle();const undone=await d.checkpoint('undone');
   assert.equal(undone.state.revision,rebuilt.state.revision+1);assert.equal(undone.headRevision,rebuilt.headRevision+1);
   assert.deepEqual(withoutRevision(undone.state),withoutRevision(before.state));assert.equal(undone.history.cursor,before.history.cursor);
   assert.equal(undone.state.content.app.mesh.applied,false);assert.equal(undone.snapshot.project.visibleModelStale,true);
   await d.command({type:'history.redo'});await d.idle();const redone=await d.checkpoint('redone');
   assert.equal(redone.state.revision,undone.state.revision+1);assert.equal(redone.headRevision,undone.headRevision+1);
   assert.deepEqual(withoutRevision(redone.state),withoutRevision(committed.state));assert.equal(redone.history.cursor,committed.history.cursor);
   await d.build();const redoneBuilt=await d.checkpoint('redone-replayed');assert.equal(redoneBuilt.headRevision,redone.headRevision);
   const final=await d.stl('redone.stl');assert.equal(final.signature,exported.signature);
   return {delta,history:{before:before.state.revision,committed:committed.state.revision,undo:undone.state.revision,redo:redone.state.revision},
    exactTwoApprovals:true,exactOneCsgCommit:true,original:sha256(file.bytes),replayGeometry:final.signature};
  }finally{await d.saveSteps();}
 }},
 {id:'OBJ-EXPLICIT-TARGET-MATERIAL-UNION',async run(runtime){
  const d=new Driver(runtime);try{
   const {fixture,baseline}=await setup(d,{operation:'union',target:'exact-region'});
   const {file,before,command}=await importMesh(d,fixture,'obj');
   const p1=await firstProposal(d,command,before,'input'),p2=await secondProposal(d,p1,before,'csg');
   await d.approve(p2);const committed=await d.checkpoint('committed');oneCommit(before,committed);
   const {recipe}=verifyReplayBindings(committed,fixture,file);
   assert.ok(recipe.input.parser.sourceMaterialAssignments.some(r=>r.sourceName==='authored_named_material'));
   const exported=await d.stl('union.stl'),delta=volumeDelta(baseline,exported,fixture);
   await replay(d,committed,fixture,file,exported);
   return {delta,materialId:fixture.materialId,targetId:fixture.resolvedTargetId,original:sha256(file.bytes),geometryHash:exported.signature,exactTwoApprovals:true};
  }finally{await d.saveSteps();}
 }},
 {id:'STL-SEPARATE-PART-EXPLICIT-MATERIAL',async run(runtime){
  const d=new Driver(runtime);try{
   const {fixture,baseline,parsed}=await setup(d,{operation:'import-as-part'});
   const {file,before,command}=await importMesh(d,fixture,'stl');
   const missing=await d.command({type:'mesh.apply',unit:'millimeter'},{expectProposal:true});
   assert.equal(missing.ok,false);assert.equal(missing.diagnostic.code,'MESH_MATERIAL_REQUIRED');
   unchanged(before,await d.checkpoint('missing-material-refused'));
   const p1=await firstProposal(d,command,before,'input'),p2=await secondProposal(d,p1,before,'separate-part');
   await d.approve(p2);const committed=await d.checkpoint('committed');oneCommit(before,committed);verifyReplayBindings(committed,fixture,file);
   const added=readSnapshot(await d.model('separate-part'));
   assert.equal(added.parts.length,parsed.parsed.parts.length+1,'exactly one separate imported part');
   assert.deepEqual(added.vertices.slice(0,parsed.parsed.vertices.length),parsed.parsed.vertices,'generated represented vertices remain exact');
   assert.deepEqual(added.faces.slice(0,parsed.parsed.faces.length),parsed.parsed.faces,'generated represented facets/order remain exact');
   const exported=await d.stl('separate-part.stl'),delta=volumeDelta(baseline,exported,fixture);
   await replay(d,committed,fixture,file,exported);
   return {delta,materialId:fixture.materialId,noInventedTarget:true,generatedGeometryExact:true,original:sha256(file.bytes),exactTwoApprovals:true};
  }finally{await d.saveSteps();}
 }},
 {id:'CANCEL-INPUT-AND-CSG-PROPOSAL',async run(runtime){
  const d=new Driver(runtime);try{
   const {fixture}=await setup(d,{operation:'difference',target:'exact-body'}),{file,before,command}=await importMesh(d,fixture,'stl');
   const first=await firstProposal(d,command,before,'cancel-input');
   await d.command({type:'proposal.discard',id:first.retry.id});await d.idle();
   const discardedFirst=await d.checkpoint('input-discarded');unchanged(before,discardedFirst);
   assert.equal(discardedFirst.snapshot.controller.pendingChange,null);assert.equal(discardedFirst.snapshot.job,null);
   const stale1=await d.command(first.retry,{expectProposal:true});assert.equal(stale1.ok,false);assert.equal(stale1.diagnostic.code,'STALE_CONFIRMATION');
   unchanged(before,await d.checkpoint('input-stale-retry'));
   const secondInput=await firstProposal(d,command,before,'retry-input'),second=await secondProposal(d,secondInput,before,'cancel-csg');
   await d.command({type:'proposal.discard',id:second.retry.id});await d.idle();
   const discardedSecond=await d.checkpoint('csg-discarded');unchanged(before,discardedSecond);
   assert.equal(discardedSecond.snapshot.controller.pendingChange,null);assert.equal(discardedSecond.snapshot.job,null);
   const stale2=await d.command(second.retry,{expectProposal:true});assert.equal(stale2.ok,false);assert.equal(stale2.diagnostic.code,'STALE_CONFIRMATION');
   unchanged(before,await d.checkpoint('csg-stale-retry'));
   await d.command({type:'viewport.action',action:'fit'});
   await d.command({type:'project.save'});await d.idle();const saved=await d.checkpoint('cancel-saved');
   assert.equal(saved.state.revision,before.state.revision);assert.equal(saved.headRevision,before.headRevision+1,'only explicit save advances head');
   await d.command({type:'project.open',id:before.projectId});await d.idle();const opened=await d.checkpoint('cancel-opened');
   assert.equal(opened.state.content.app.mesh.applied,false);assert.equal(opened.state.content.app.mesh.metadata.meshCsg,undefined);
   assert.deepEqual(opened.state,before.state);assert.equal(opened.headRevision,saved.headRevision);assertOriginal(opened,file);
   await d.rescue('cancelled-originals.arch-project.zip',file);
   return {firstRejected:stale1.diagnostic.code,secondRejected:stale2.diagnostic.code,headDuringProposals:before.headRevision,
    currentBytesRetained:true,noHiddenCommit:true,leaseLimit:'Visible lease remains byte-identical/live; native allocator leak totals are not inferred from this observer'};
  }finally{await d.saveSteps();}
 }}
];

