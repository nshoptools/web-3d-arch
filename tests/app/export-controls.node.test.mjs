import test from 'node:test';import assert from 'node:assert/strict';
import {createAppController} from '../../src/app/controller.mjs';
import {newDocument,verifyDocument,validateState,contentEdit} from '../../src/app/documents.mjs';
import {configureExport,exportOptionsFor,exportConfigurationView,validateExportConfiguration} from '../../src/app/export-configuration.mjs';
import {sha256,uuid,VERSION} from '../../src/app/common.mjs';
import {namedTestAdapters,deferred} from './test-doubles.mjs';
import {applicationContext} from '../../src/integration/application-context.mjs';

// Controller/history are real. This suite intentionally uses a Node CAS store and
// labelled synthetic exporters, not browser persistence or geometry qualification.
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
async function fixture(t){
 const f=namedTestAdapters();const controls={...f.controls,mode:'normal',confirms:0,retired:0};
 let c;
 const artifact=async input=>{
  const options=exportOptionsFor(input.formatId,input.state),bytes=new TextEncoder().encode('Explicit TEST export bytes'),digest=await sha256(bytes);
  return {version:VERSION,ticket:input.ticket,bytes,filename:options.filename,mimeType:'application/octet-stream',metadata:{schema:'arch-app-export/1',formatId:input.formatId,projectId:input.ticket.projectId,revision:input.ticket.revision,bytes:bytes.length,sha256:controls.badHash?'0'.repeat(64):digest,options,qualification:{mesh:'unverified',inspection:options.inspection},warnings:['Explicit TEST serializer; geometry unverified.']}};
 };
 const exporter={version:VERSION,capabilities:[],formats:()=>[{id:'stl-union',label:'TEST STL route',extension:'stl',enabled:true,verdict:'unverified',prerequisite:'matching-model'}],async export(input){
  controls.input=input;if(controls.wait)await controls.wait.promise;
  if(controls.mode==='prepared')return {status:'prepared-proposal',version:VERSION,ticket:input.ticket,proposalHash:'a'.repeat(64),changes:['Explicit TEST displacement; no bytes prepared'],async confirm(control){assert.equal(control.ticket,input.ticket);controls.confirms++;controls.confirmEntered?.resolve();if(controls.confirmWait)await controls.confirmWait.promise;return artifact(input);},release(){controls.retired++;}};
  return artifact(input);
 }};
 c=createAppController({origin:'https://test.invalid',deviceId:uuid(),adapters:{...f.adapters,exporter,download:{async save(r){if(controls.downloadWait)await controls.downloadWait.promise;if(controls.downloadFailure)throw Object.assign(Error(),{code:'TEST_DOWNLOAD_FAILED'});controls.downloads.push({...r,bytes:r.bytes.slice()});}}}});
 c.store=memoryStore();c.session={...c.session,status:'signed-in',user:{id:'TEST-export-user',name:'TEST',role:'member'}};c.remote.settings={values:{}};c.api.userId=c.session.user.id;c.emit();
 ok(await c.dispatch({type:'project.create',product:'keychain'}));
 t.after(()=>c.dispose());return {c,controls,build:async()=>ok(await c.dispatch({type:'geometry.build'})),configure:async(field,value)=>c.dispatch({type:'export.configure',id:'stl-union',projectRevision:c.doc.state.revision,field,value})};
}

test('configuration: exact decimals, seven explicit formats, fixed section/3MF poses, no implicit inspection',async()=>{
 const {document}=await newDocument('keychain'),state=document.state;
 for(const id of ['svg-color','svg-section','stl-union','stl-material-zip','3mf-bambu-project','3mf-snapmaker-project','png-viewport']){
  const v=exportConfigurationView(id,state,false);assert.equal(v.projectRevision,0);assert.ok(v.fields.every(f=>!f.enabled&&f.reason));assert.equal(exportOptionsFor(id,state).inspection,false);
 }
 for(const id of ['constructor','__proto__','unknown'])assert.equal(exportOptionsFor(id,state),undefined);
 const change=(s,field,value,id='stl-union')=>contentEdit(s,a=>{a.exportOptions=configureExport(s,{id,projectRevision:s.revision,field,value});});
 let s=change(state,'errorMm','0,003');assert.equal(exportOptionsFor('stl-union',s).errorMm,.003);
 s=change(s,'pose','pattern-down-x');assert.deepEqual(exportOptionsFor('stl-union',s).pose,{kind:'pattern-down-x',restOnBed:true});
 assert.throws(()=>change(s,'restOnBed',false),{code:'EXPORT_PATTERN_DOWN_REST'});
 assert.throws(()=>change(state,'pose','pattern-down-x','svg-section'),{code:'EXPORT_FIELD_LOCKED'});
 assert.throws(()=>change(state,'restOnBed',true,'3mf-bambu-project'),{code:'EXPORT_FIELD_LOCKED'});
 for(const value of ['1e-3','0.003 tail','0,0.3','NaN','0.0000001','0.004001'])assert.throws(()=>change(state,'errorMm',value));
 for(const value of ['bad.stlx','con.stl','\u0000.stl'])assert.throws(()=>change(state,'filename',value));
 assert.equal(change(state,'filename','Thử: tên.stl').content.app.exportOptions.formats['stl-union'].filename,'Thử: tên.stl');
 let section=change(state,'sectionMode','sequence','svg-section');section=change(section,'stepMm','0.004','svg-section');
 assert.throws(()=>change(section,'stepMm','0.003','svg-section'),{code:'EXPORT_SECTION_BUDGET'});
 assert.throws(()=>change(section,'zMm','0.3','svg-section'),{code:'EXPORT_FIELD_LOCKED'});
 assert.deepEqual(exportOptionsFor('svg-section',section).section,{mode:'sequence',startMm:0,endMm:1,stepMm:.004,units:'mm',side:'front',color:'material'});
});

test('configuration commit is CAS/history data; malformed, stale or unknown commands cannot relabel a model',async t=>{
 const f=await fixture(t);await f.build();const c=f.c,old=c.visible.lease,start=c.doc.state.revision;
 ok(await f.configure('inspection',true));assert.equal(c.doc.state.revision,start+1);assert.equal(c.visible.lease,old);assert.equal(c.getSnapshot().project.visibleModelStale,true);
 assert.equal(c.getSnapshot().exports.find(f=>f.id==='stl-union').reasonCode,'STALE_REVISION');
 const before=JSON.stringify(c.doc),head=c.headRevision;
 for(const command of [{projectRevision:start,field:'filename',value:'stale.stl'},{projectRevision:start+1,field:'constructor',value:'x'},{projectRevision:start+1,field:'inspection',value:'true'}]){
  const r=await c.dispatch({type:'export.configure',id:'stl-union',...command});assert.equal(r.ok,false);assert.equal(JSON.stringify(c.doc),before);assert.equal(c.headRevision,head);
 }
 ok(await f.configure('inspection',true));assert.equal(c.headRevision,head,'identical input is not another history commit');
 ok(await c.dispatch({type:'history.undo'}));assert.equal(exportOptionsFor('stl-union',c.doc.state).inspection,false);
 ok(await c.dispatch({type:'history.redo'}));assert.equal(exportOptionsFor('stl-union',c.doc.state).inspection,true);
 ok(await c.dispatch({type:'project.open',id:c.projectId}));assert.equal(exportOptionsFor('stl-union',c.doc.state).inspection,true);
 const corrupt=structuredClone(c.doc.state);corrupt.content.app.exportOptions.formats['stl-union'].invented=true;assert.throws(()=>validateState(corrupt));
 assert.throws(()=>validateExportConfiguration({version:2,formats:{}}),{code:'EXPORT_CONFIGURATION_VERSION'});
});

test('receipt owns actual bytes/hash/revision/warnings; metadata download is exact and project scoped',async t=>{
 const f=await fixture(t),c=f.c;ok(await f.configure('inspection',true));await f.build();ok(await c.exportFile('stl-union'));
 const [receipt]=c.getSnapshot().exportReceipts,download=f.controls.downloads[0];
 assert.equal(receipt.sha256,await sha256(download.bytes));assert.equal(receipt.byteLength,download.bytes.length);assert.equal(receipt.filename,download.filename);assert.equal(receipt.projectRevision,c.doc.state.revision);assert.equal(receipt.inspection,true);assert.equal(receipt.verdict,'unverified');assert.ok(receipt.metadataAvailable);assert.equal(receipt.warnings.length,1);
 ok(await c.dispatch({type:'export.receipt',id:receipt.id}));const doc=JSON.parse(new TextDecoder().decode(f.controls.downloads[1].bytes));assert.equal(doc.artifact.sha256,receipt.sha256);assert.equal(doc.exporter.schema,'arch-app-export/1');assert.match(doc.delivery,/OS persistence not verified/);
 await c.dispatch({type:'project.open',id:c.projectId});assert.equal(c.getSnapshot().exportReceipts.length,0);const count=f.controls.downloads.length;
 assert.equal((await c.dispatch({type:'export.receipt',id:receipt.id})).ok,false);assert.equal(f.controls.downloads.length,count);
});

test('mismatched metadata and failed delivery never become receipts',async t=>{
 const f=await fixture(t);await f.build();f.controls.badHash=true;
 const r=await f.c.exportFile('stl-union');assert.equal(r.diagnostic.code,'EXPORT_RECEIPT_IDENTITY');assert.equal(f.controls.downloads.length,0);assert.equal(f.c.getSnapshot().exportReceipts.length,0);
 f.controls.badHash=false;f.controls.downloadFailure=true;assert.equal((await f.c.exportFile('stl-union')).diagnostic.code,'TEST_DOWNLOAD_FAILED');assert.equal(f.c.getSnapshot().exportReceipts.length,0);
});

test('prepared export emits no file before exact consent, then confirms and releases once',async t=>{
 const f=await fixture(t);await f.build();f.controls.mode='prepared';const before=JSON.stringify(f.c.doc);
 assert.equal((await f.c.exportFile('stl-union')).diagnostic.code,'PROPOSAL_REQUIRED');assert.equal(f.controls.confirms,0);assert.equal(f.controls.downloads.length,0);assert.equal(f.c.getSnapshot().exportReceipts.length,0);
 const id=f.c.pendingOperation.id;ok(await f.c.dispatch({type:'proposal.accept',id,confirmed:true}));assert.equal(f.controls.confirms,1);assert.equal(f.controls.retired,1);assert.equal(f.controls.downloads.length,1);assert.equal(f.c.getSnapshot().exportReceipts.length,1);assert.equal(JSON.stringify(f.c.doc),before);
 assert.equal((await f.c.dispatch({type:'proposal.accept',id,confirmed:true})).ok,false);assert.equal(f.controls.confirms,1);
});

test('changing a field retires prepared output; rejected delayed prepared result is released',async t=>{
 const f=await fixture(t);await f.build();f.controls.mode='prepared';await f.c.exportFile('stl-union');const id=f.c.pendingOperation.id;
 ok(await f.configure('inspection',true));assert.equal(f.controls.retired,1);assert.equal((await f.c.dispatch({type:'proposal.accept',id,confirmed:true})).ok,false);assert.equal(f.controls.confirms,0);
 await f.build();f.controls.wait=deferred();const pending=f.c.exportFile('stl-union');
 ok(await f.configure('filename','changed.stl'));f.controls.wait.resolve();assert.equal((await pending).ok,false);assert.equal(f.controls.retired,2);assert.equal(f.controls.confirms,0);assert.equal(f.controls.downloads.length,0);
});

test('project ABA during late export cannot publish a file or private receipt',async t=>{
 const f=await fixture(t);await f.build();const first=f.c.projectId,before=applicationContext(f.c);f.controls.wait=deferred();
 const pending=f.c.exportFile('stl-union');ok(await f.c.dispatch({type:'project.create',product:'strap'}));ok(await f.c.dispatch({type:'project.open',id:first}));
 const after=applicationContext(f.c);assert.equal(after.projectId,before.projectId);assert.equal(after.headHash,before.headHash);assert.notEqual(after.sessionKey,before.sessionKey);
 f.controls.wait.resolve();assert.equal((await pending).ok,false);assert.equal(f.controls.downloads.length,0);assert.equal(f.c.getSnapshot().exportReceipts.length,0);
});

test('confirmed export resumes a cancellable job and cancellation cannot publish delayed bytes',async t=>{
 const f=await fixture(t);await f.build();f.controls.mode='prepared';await f.c.exportFile('stl-union');
 f.controls.confirmWait=deferred();f.controls.confirmEntered=deferred();const id=f.c.pendingOperation.id;
 const accepting=f.c.dispatch({type:'proposal.accept',id,confirmed:true});await f.controls.confirmEntered.promise;
 const job=f.c.getSnapshot().job;assert.equal(job.stage,'export');assert.equal(job.cancellable,true);
 ok(await f.c.dispatch({type:'job.cancel',id:job.id}));f.controls.confirmWait.resolve();assert.equal((await accepting).ok,false);
 assert.equal(f.controls.downloads.length,0);assert.equal(f.controls.retired,1);assert.equal(f.c.getSnapshot().exportReceipts.length,0);assert.equal(f.c.getSnapshot().job,null);
});
