import {EngineClient} from '/src/core/engine-client.mjs';
import {createMeshQualificationClient} from '/src/core/mesh-qualification-client.mjs';
import {readArchSnapshot} from '/src/viewport/arch-view.mjs';
import {scenarios,encodeArch,cuboid} from '/review/analytic-shapes.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
const summary=r=>({verdict:r.verdict,code:r.code,checks:r.checks,diagnostics:r.diagnostics,stats:r.stats});
function signedVolume(bytes){const s=readArchSnapshot(bytes);let sum=0;for(let i=0;i<s.triangles.length;i+=3){const t=Array.from(s.triangles.subarray(i,i+3),j=>Array.from(s.vertices.subarray(j*3,j*3+3)));const [a,b,c]=t;sum+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}return sum/6;}
export async function run(){
 const trace=[],artifacts=[],client=new EngineClient({moduleURL:'/runtime/arch-kernel.mjs',workerURL:'/src/core/engine-worker.mjs'}),checker=createMeshQualificationClient();let generation=0;
 const save=async(name,b,metadata=null)=>{const bytes=new Uint8Array(b);artifacts.push({name,bytes:Array.from(bytes),sha256:await sha(bytes),metadata});};
 const expectReject=async(name,p,codes)=>{let code='resolved';try{await p;}catch(e){code=e.code??e.message;}trace.push({name,code});need(codes.includes(code),name+':'+code);};
 let source;
 try{
  for(const [name,mesh,expected] of scenarios()){const bytes=encodeArch(mesh),before=await sha(bytes),report=await checker.check(bytes);trace.push({name,expected,...summary(report)});need(report.verdict===expected,'ANALYTIC_'+name);need(await sha(bytes)===before,'INPUT_VIEW_MUTATED');}
  const bytes=encodeArch(cuboid()),controller=new AbortController(),pending=checker.check(bytes,{signal:controller.signal});controller.abort();await expectReject('real-worker-cancel',pending,['CANCELLED']);
  const late=checker.check(bytes);await checker.reset();await expectReject('real-worker-reset',late,['PRIVATE_RESET']);
  need((await checker.check(bytes)).verdict==='pass','FRESH_WORKER_AFTER_RESET');
  const watchdog=createMeshQualificationClient({workerURL:'/review/idle-worker.mjs',timeoutMs:100});await expectReject('watchdog-100ms',watchdog.check(bytes),['MESH_WATCHDOG']);await watchdog.reset();
  const malformed=createMeshQualificationClient({workerURL:'/review/wrong-id-worker.mjs'});await expectReject('worker-stale-id',malformed.check(bytes),['MESH_WORKER_PROTOCOL']);await malformed.reset();
  await client.start();need(client.serviceCapabilities.finalSceneGeometry===true,'NO_ACTUAL_AFGM');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#ff0000" d="M0 0H10V10H0Z"/><path fill="#0000ff" d="M10 0H20V10H10Z"/></svg>';
  source=await client.build({kind:'svg',source:svg,thicknessMm:2,toleranceMm:.001},{generation:++generation});
  const before=source.bytes().slice(),sourceHash=await sha(before),parts=readArchSnapshot(before).parts;need(parts.length===2,'EXPECTED_TWO_ANALYTIC_PARTS');await save('adjacent-source.arch',before);
  const sourceReport=await checker.check(source.bytes());need(sourceReport.verdict==='pass','SOURCE_QUALIFICATION');
  let releaseMessages=0;const nativePost=client.worker.postMessage.bind(client.worker);client.worker.postMessage=(msg,...args)=>{if(msg.type==='release'&&msg.id===source.id)releaseMessages++;return nativePost(msg,...args);};
  for(const [name,mode,expectedGroups] of [['full-distinct-identities','distinct',2],['equal-slot-color-distinct-identities','equal-color',2],['same-full-material-union','merged',1],['neutral-analytical-union','neutral',1]]){
   const mapping=parts.map((p,i)=>({part:i,source:p.sourceIndex,slot:mode==='distinct'?i+1:1,rgba:mode==='distinct'?p.color:0xffffffff,materialSource:mode==='merged'?1:mode==='neutral'?0xffffffff:101+i}));
   const result=await client.finalSceneGeometry(source,{revision:'1',expectedRevision:'1',mapping},{generation:++generation});
   const report=await checker.check(result.bytes),volume=signedVolume(result.bytes);
   need(result.metadata.sourceSnapshotSha256===sourceHash&&result.metadata.sourceSnapshotId===source.id&&result.metadata.sourceSnapshotGeneration===source.generation,'NATIVE_SOURCE_BINDING');
   need(result.metadata.groups.length===expectedGroups,'MATERIAL_GROUP_COLLAPSE');need(report.verdict==='pass','AFGM_QUALIFICATION_'+name);need(Math.abs(volume-400)<1e-9,'ANALYTIC_VOLUME_'+name);
   need(readArchSnapshot(result.bytes).generation===source.generation,'AFGM_GENERATION');
   need(await sha(source.bytes().slice())===sourceHash&&releaseMessages===0,'SOURCE_MUTATION_OR_RELEASE');
   await save(name+'.arch',result.bytes,result.metadata);trace.push({name,expectedGroups,volumeMm3:volume,expectedVolumeMm3:400,metadata:result.metadata,...summary(report)});
  }
  const mapping=parts.map((p,i)=>({part:i,source:p.sourceIndex,slot:i+1,rgba:p.color,materialSource:i+1}));
  await expectReject('native-duplicate-membership',client.finalSceneGeometry(source,{revision:'1',expectedRevision:'1',mapping:[mapping[0],mapping[0]]},{generation:++generation}),['MATERIAL_MAPPING_INVALID']);
  await expectReject('native-missing-membership',client.finalSceneGeometry(source,{revision:'1',expectedRevision:'1',mapping:mapping.slice(0,1)},{generation:++generation}),['FINAL_SNAPSHOT_COUNTS']);
  await expectReject('native-stale-source-index',client.finalSceneGeometry(source,{revision:'1',expectedRevision:'1',mapping:mapping.map((p,i)=>i===0?{...p,source:p.source+100}:p)},{generation:++generation}),['MATERIAL_MAPPING_STALE_SOURCE']);
  await expectReject('native-revision-mismatch',client.finalSceneGeometry(source,{revision:'1',expectedRevision:'2',mapping},{generation:++generation}),['STALE_REVISION']);
  const unionPending=client.finalSceneGeometry(source,{revision:'1',expectedRevision:'1',mapping},{generation:++generation});await client.cancel();await expectReject('native-union-cancel',unionPending,['CANCELLED']);
  need(await sha(source.bytes().slice())===sourceHash&&releaseMessages===0,'SOURCE_AFTER_FAILURES');
  source.release();source.release();need(releaseMessages===1,'DOUBLE_RELEASE');let releasedCode;try{source.bytes();}catch(e){releasedCode=e.code;}need(releasedCode==='SNAPSHOT_RELEASED','RELEASED_BYTES');source=null;
  trace.push({name:'root-lease-ownership',releaseMessages,sourceUnchanged:true});
  return {crossOriginIsolated,trace,artifacts,capabilities:client.serviceCapabilities};
 }finally{source?.release();await checker.reset();client.dispose();}
}
