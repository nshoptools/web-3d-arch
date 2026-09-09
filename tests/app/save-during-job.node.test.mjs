import test from 'node:test';import assert from 'node:assert/strict';
import {createAppController} from '../../src/app/controller.mjs';
import {diagnostic,sha256,uuid} from '../../src/app/common.mjs';
import {verifyDocument} from '../../src/app/documents.mjs';
import {createThreeViewportAdapter} from '../../src/app/parent-adapters.mjs';
import {ViewportError} from '../../src/viewport/arch-view.mjs';
import {effectiveValues} from '../../src/domain/index.mjs';
import {namedTestAdapters,deferred} from './test-doubles.mjs';

// Audit F-02, F-06, R-01 and the Grok "three errors after a successful rebuild" finding.
// Controller, domain and history are real; the store is a Node CAS recorder and the
// engine an analytical cuboid double, so a build can be held open on purpose.
function memoryStore(){const rows=new Map();return {
 close(){},status:()=>({canEdit:true,canRescue:true,capabilities:{database:{readOnly:false}}}),async listProjects(){return [];},
 async load(id){return structuredClone(rows.get(id)??{status:'empty'});},
 async commit(input,{signal}={}){
  assert.ok(!signal?.aborted);const before=rows.get(input.projectId)?.headRevision??0;assert.equal(input.expectedRevision,before);
  const assets=await Promise.all(input.assets.map(async a=>({...a,bytes:a.bytes.slice(),hash:await sha256(a.bytes),byteLength:a.bytes.length})));
  await verifyDocument(input.document,new Map(assets.map(a=>[a.hash,a])));assert.ok(!signal?.aborted);
  const head={revision:before+1,transactionId:input.transactionId};rows.set(input.projectId,{status:'editable',head,headRevision:head.revision,assets,manifest:{document:structuredClone(input.document),engine:input.engine,assets:assets.map(({bytes,...a})=>a),dependencies:[]}});return {head};
 }
};}
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r;};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function untilJob(c){for(let i=0;i<100&&!c.job;i++)await tick();assert.ok(c.job,'a job started');return c.job;}
async function fixture(t,overrides=()=>({})){
 const f=namedTestAdapters();
 const c=createAppController({origin:'https://test.invalid',deviceId:uuid(),adapters:{...f.adapters,...overrides(f)}});
 c.store=memoryStore();c.session={...c.session,status:'signed-in',user:{id:'TEST-save-user',name:'TEST',role:'member'}};c.remote.settings={values:{}};c.api.userId=c.session.user.id;c.emit();
 ok(await c.dispatch({type:'project.create',product:'keychain'}));
 t.after(()=>c.dispose());return {c,f};
}

test('F-02: saving while a build runs keeps the build; the model then lands on the saved revision',async t=>{
 const {c,f}=await fixture(t);f.controls.delay=deferred();
 const build=c.dispatch({type:'geometry.build'});const job=await untilJob(c);
 ok(await c.dispatch({type:'project.save'}));
 assert.equal(c.job,job,'the job survives the save');assert.equal(job.abort.signal.aborted,false,'the job is not cancelled by the save');
 assert.equal(c.doc.savedRevision,c.doc.state.revision);
 f.controls.delay.resolve();ok(await build);
 const s=c.getSnapshot();
 assert.equal(s.project.visibleModelRevision,s.project.revision);assert.equal(s.project.visibleModelStale,false);assert.equal(s.project.savedRevision,s.project.revision);
 assert.deepEqual(s.diagnostics.filter(d=>d.severity==='error'),[],'a successful build after a save reports no problem');
 assert.equal(f.controls.releases.length,0,'the model lease is the live one, not a released one');
});

test('F-02 counter-case: a design edit while a build runs still retires that build',async t=>{
 const {c,f}=await fixture(t);f.controls.delay=deferred();
 const build=c.dispatch({type:'geometry.build'});const job=await untilJob(c);
 ok(await c.dispatch({type:'parameter.set',id:'size',value:'60'}));
 assert.equal(job.abort.signal.aborted,true,'a changed design cancels the build of the old one');
 f.controls.delay.resolve();const r=await build;assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'STALE_JOB');
 assert.equal(c.getSnapshot().project.visibleModelRevision,null,'no model of the old design is published');
 assert.equal(f.controls.releases.length,1,'the retired lease is released');
});

test('F-02: a pending consent survives a save and is still accepted afterwards',async t=>{
 const {c}=await fixture(t);
 for(let i=0;i<20;i++)ok(await c.dispatch({type:'parameter.set',id:'size',value:String(50+i)}));
 const r=await c.dispatch({type:'parameter.set',id:'size',value:'99'});
 assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'HISTORY_PRUNING_REQUIRED');assert.ok(r.confirmation);
 const id=c.pendingChange.id,revision=c.doc.state.revision;
 ok(await c.dispatch({type:'project.save'}));
 assert.equal(c.pendingChange?.id,id,'the question is still open after the save');
 assert.equal(c.pendingChange.headRevision,c.headRevision,'the consent follows the head the save wrote');
 assert.equal(c.doc.savedRevision,revision);
 ok(await c.dispatch(r.confirmation.retry));assert.equal(effectiveValues(c.doc.state).size,99);
 assert.equal(c.pendingChange,null);assert.equal(c.doc.state.revision,revision+1);
});

test('F-02: saving while an export runs keeps the export; the file is delivered',async t=>{
 const {c,f}=await fixture(t);ok(await c.dispatch({type:'geometry.build'}));
 const gate=deferred();const exporter={...f.adapters.exporter,async export(input){await gate.promise;return f.adapters.exporter.export(input);}};
 c.adapters={...c.adapters,exporter};
 const pending=c.exportFile('stl');await untilJob(c);
 ok(await c.dispatch({type:'project.save'}));
 gate.resolve();ok(await pending);
 assert.equal(f.controls.downloads.length,1);assert.equal(c.getSnapshot().exportReceipts.length,1);
});

test('preempted turns are information, not problems: cancelled or superseded codes never reach the warning strip',()=>{
 for(const code of ['CANCELLED','SOURCE_SVG_CANCELLED','RASTER_CANCELLED','PRODUCT_CANCELLED','MESH_CANCELLED','GENERATED_BASE_CANCELLED','SUPERSEDED','PRINTING_REFRESH_SUPERSEDED','PROFILE_IMPORT_SUPERSEDED','ABORTED'])
  assert.equal(diagnostic(Object.assign(new Error(code),{code})).severity,'info',code);
 for(const code of ['UPSTREAM_ABORTED','REQUEST_ABORTED','STALE_JOB','SUPERSEDED_GENERATION_RETAINED','WEBGL_UNAVAILABLE','TEST_BUILD_FAILURE'])
  assert.equal(diagnostic(Object.assign(new Error(code),{code})).severity,'error',code);
 const aborted=new Error('aborted');aborted.name='AbortError';assert.equal(diagnostic(aborted).code,'CANCELLED');assert.equal(diagnostic(aborted).severity,'info');
});

test('F-06: diagnostics carry a monotonic sequence, so a rolled-over list still tells which entries are new',async t=>{
 const {c}=await fixture(t);
 for(let i=1;i<=25;i++)c.report(Object.assign(new Error('TEST'),{code:'TEST_PROBLEM_'+i}));
 const list=c.getSnapshot().diagnostics;assert.equal(list.length,20);assert.equal(list.at(-1).code,'TEST_PROBLEM_25');
 for(let i=1;i<list.length;i++)assert.ok(list[i].sequence>list[i-1].sequence,'sequence is strictly increasing');
 // The strip rule: only entries after the last seen sequence are new, even when the length does not move.
 const seen=list.at(-1).sequence;
 c.report(Object.assign(new Error('TEST'),{code:'TEST_PROBLEM_26'}));
 const after=c.getSnapshot().diagnostics;assert.equal(after.length,20);
 assert.deepEqual(after.filter(d=>d.sequence>seen).map(d=>d.code),['TEST_PROBLEM_26']);
 // A note the controller states itself is sequenced the same way.
 c.note({code:'TEST_NOTE',message:'TEST',severity:'warning'});
 assert.equal(c.getSnapshot().diagnostics.at(-1).sequence,seen+2);
});

test('R-01: a renderer that cannot start is reported and the interface keeps its document and model',async t=>{
 const {c,f}=await fixture(t,f=>({viewport:{...f.adapters.viewport,attach(){throw new ViewportError('WEBGL_UNAVAILABLE');}}}));
 ok(await c.dispatch({type:'geometry.build'}));
 const release=c.attachViewport({});
 assert.equal(typeof release,'function');release();
 const s=c.getSnapshot();
 const problem=s.diagnostics.find(d=>d.code==='WEBGL_UNAVAILABLE');assert.ok(problem,'the failure is a diagnostic');assert.equal(problem.severity,'error');
 assert.equal(s.project.visibleModelRevision,s.project.revision,'the model is still published');
 ok(await c.exportFile('stl'));assert.equal(f.controls.downloads.length,1,'geometry export still works without a renderer');
 // The real viewport adapter publishes the reason on the capability when the renderer constructor throws.
 const adapter=createThreeViewportAdapter({ThreeViewport:class{constructor(){throw new ViewportError('WEBGL_UNAVAILABLE');}}});
 assert.throws(()=>adapter.attach({}),{code:'WEBGL_UNAVAILABLE'});
 const capability=adapter.capabilities.find(x=>x.id==='viewport.webgl');assert.equal(capability.available,false);assert.match(capability.reason,/WebGL/);
});
