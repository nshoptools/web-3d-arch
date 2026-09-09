import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppController} from '../../src/app/controller.mjs';
import {sha256,uuid,canonicalJSON} from '../../src/app/common.mjs';
import {verifyDocument} from '../../src/app/documents.mjs';
import {effectiveValues} from '../../src/domain/index.mjs';
import {openProjectStore} from '../../src/storage/store.mjs';
import {readRecord,atomic} from '../../src/storage/idb.mjs';
import {encoder} from '../../src/storage/common.mjs';
import {namedTestAdapters} from './test-doubles.mjs';
import {createMemoryIndexedDB} from './memory-indexeddb.mjs';
// Project load/save data-safety regressions (audit F1-F4). Controller, domain, history and
// src/storage are real; persistence is an in-memory IndexedDB double or a memory CAS recorder.
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r;};
const VN=/[àáạảãâầấậẩẫăằắặẳẵđèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/i;
const T=Date.UTC(2026,8,9);

async function storeFixture(){
 globalThis.indexedDB??=createMemoryIndexedDB();
 const userId='TEST-data-safety-'+crypto.randomUUID(),deviceId='TEST-device';
 const store=await openProjectStore({userId,deviceId,now:()=>T+1000,policy:{backend:'idb',coordination:'cas-only'}});
 await store.unlock({userId,deviceId,authVersion:1,verifiedAt:T,expiresAt:T+3600000,verified:true});return store;
}
const generation=(revision,text)=>({projectId:'p',expectedRevision:revision,transactionId:'tx-'+crypto.randomUUID(),engine:{id:'TEST-fixture',version:'1'},domainSchemaVersion:1,
 document:{title:'Dự án '+revision,revision},assets:[{kind:'source',bytes:encoder.encode(text)}]});

test('F1 storage: a commit on the recovered previous generation retains the unreadable newest generation until it is discarded',async()=>{
 const store=await storeFixture();
 const first=await store.commit(generation(0,'first bytes')),second=await store.commit(generation(1,'second bytes'));
 assert.equal((await store.pendingTransactions({projectId:'p'})).length,0);
 const current=await store.load('p');assert.equal(current.manifestHash,second.manifestHash);
 const object=await readRecord(store.db,'objects',current.manifest.sources[0]),blob=(await readRecord(store.db,'blobs',object.locator)).blob;
 await atomic(store.db,['blobs'],'readwrite',t=>{t.store('blobs').delete(object.locator);}); // transient byte loss of the newest generation
 const recovered=await store.load('p');
 assert.equal(recovered.recoveredPrevious,true);assert.equal(recovered.manifestHash,first.manifestHash);assert.equal(recovered.headRevision,2);
 const third=await store.commit(generation(2,'third bytes'));
 assert.equal(third.head.previousHash,first.manifestHash,'verified previous stays the documented fallback');
 assert.ok(third.supersededRetained,'commit must report the retained superseded generation');
 assert.equal(third.supersededRetained.manifestHash,second.manifestHash);assert.equal(third.supersededRetained.revision,2);
 assert.ok(await readRecord(store.db,'manifests',second.manifestHash),'newest generation manifest must survive post-commit cleanup');
 const pending=await store.pendingTransactions({projectId:'p'});
 assert.equal(pending.length,1);assert.equal(pending[0].manifestHash,second.manifestHash);assert.equal(pending[0].conflict.reason,'SUPERSEDED_UNREADABLE_GENERATION');
 await atomic(store.db,['blobs'],'readwrite',t=>{t.store('blobs').put({locator:object.locator,blob});}); // the transient fault clears
 const retained=await store.loadRetainedManifest('p',second.manifestHash);
 assert.equal(retained.status,'editable');assert.equal(new TextDecoder().decode(retained.assets[0].bytes),'second bytes');
 const rescue=await store.rescueInventory('p');
 assert.ok(rescue.manifests.some(m=>m.actualHash===second.manifestHash&&m.verified),'whole-project rescue packages the retained generation');
 assert.equal((await store.load('p')).manifestHash,third.manifestHash);
 await store.discardPending(pending[0].id);
 assert.equal(await readRecord(store.db,'manifests',second.manifestHash),undefined,'explicit discard releases the retained generation');
 assert.equal((await store.pendingTransactions({projectId:'p'})).length,0);
 await assert.rejects(()=>store.loadRetainedManifest('p',second.manifestHash),{code:'HISTORY_REFERENCE'});
 assert.equal((await store.load('p')).manifestHash,third.manifestHash);
 const fourth=await store.commit(generation(3,'fourth bytes'));assert.equal(fourth.supersededRetained,null);
 store.close();
});

function memoryStore(){
 const records=new Map(),controls={canEdit:true,loadFailures:new Map(),loadCalls:[],afterCommit:null,conflictOnce:false,recovered:null,supersededOnce:null,discarded:[]};
 const expected=id=>(records.get(id)?.headRevision??0)+(controls.recovered?.id===id?1:0);
 return {controls,records,capabilities:{selectedBackend:'TEST-memory',database:{readOnly:false}},close(){},
  status:()=>({canEdit:controls.canEdit,canRescue:true,capabilities:{database:{readOnly:false}}}),
  async listProjects(){return [...records].map(([projectId,r])=>({projectId,revision:r.headRevision,manifestHash:'0'.repeat(64),title:r.manifest.document.title}));},
  async load(id){
   controls.loadCalls.push(id);const failures=controls.loadFailures.get(id)??0;
   if(failures>0){controls.loadFailures.set(id,failures-1);throw Object.assign(Error('TEST transient read failure'),{code:'TEST_IO_READ'});}
   const r=records.get(id);if(!r)return {status:'empty'};const copy=structuredClone(r);
   if(controls.recovered?.id===id){
    const head={...copy.head,revision:copy.head.revision+1,currentHash:controls.recovered.unreadableHash,previousHash:'1'.repeat(64)};
    return {...copy,head,headRevision:head.revision,recoveredPrevious:true,issues:[{manifestHash:controls.recovered.unreadableHash,code:'MISSING_ASSET'}]};
   }
   return copy;
  },
  async commit(input,{signal}={}){
   assert.ok(!signal?.aborted);const revision=expected(input.projectId);
   if(controls.conflictOnce||input.expectedRevision!==revision){controls.conflictOnce=false;throw Object.assign(Error('TEST CAS conflict'),{code:'CONFLICT',details:{conflict:true,currentHead:{revision:revision+1},candidateManifestHash:'a'.repeat(64),transactionId:input.transactionId,committed:false}});}
   const assets=[];for(const a of input.assets){const bytes=a.bytes.slice(),hash=await sha256(bytes);assets.push({hash,byteLength:bytes.length,kind:a.kind,bytes});}
   await verifyDocument(input.document,new Map(assets.map(a=>[a.hash,a])));assert.ok(!signal?.aborted);
   const head={revision:revision+1,transactionId:input.transactionId,currentHash:'2'.repeat(64),previousHash:null};
   records.set(input.projectId,{status:'editable',head,headRevision:head.revision,assets,manifest:{revision:head.revision,document:structuredClone(input.document),engine:input.engine,assets:assets.map(({bytes,...a})=>a),dependencies:[]}});
   const result={head};if(controls.supersededOnce){result.supersededRetained=controls.supersededOnce;controls.supersededOnce=null;}
   controls.afterCommit?.();return result;
  },
  async discardPending(id){controls.discarded.push(id);},
  async pendingTransactions(){return [];}
 };
}
async function fixture(t){
 const doubles=namedTestAdapters(),c=createAppController({origin:'https://test.invalid',deviceId:uuid(),adapters:doubles.adapters}),store=memoryStore();
 c.store=store;c.session={...c.session,status:'signed-in',user:{id:'TEST-data-safety-user',name:'TEST',role:'member'}};c.remote.settings={values:{}};c.remote.settingsUpdate=async()=>{};c.api.userId=c.session.user.id;c.emit();
 ok(await c.dispatch({type:'project.create',product:'keychain'}));t.after(()=>c.dispose());return {c,store};
}

test('F1 controller: opening a recovered previous generation warns in Vietnamese and the first save reports the retained newer generation',async t=>{
 const {c,store}=await fixture(t);const id=c.projectId,stored=store.records.get(id),unreadableHash='f'.repeat(64);
 store.controls.recovered={id,unreadableHash};
 ok(await c.dispatch({type:'project.open',id}));
 const warning=c.getSnapshot().diagnostics.find(d=>d.code==='RECOVERED_PREVIOUS');
 assert.ok(warning);assert.equal(warning.severity,'warning');assert.match(warning.message,VN);
 assert.match(warning.message,/mới nhất/);assert.match(warning.message,/trước/);
 assert.match(warning.detail,new RegExp('Bản lưu '+(stored.headRevision+1)+' không đọc được'));
 assert.equal(c.headRevision,stored.headRevision+1);
 store.controls.supersededOnce={transactionId:'superseded:'+unreadableHash,manifestHash:unreadableHash,revision:stored.headRevision+1};
 ok(await c.dispatch({type:'parameter.set',id:'size',value:'57'}));store.controls.recovered=null;
 assert.equal(c.headRevision,stored.headRevision+2);
 const retained=c.getSnapshot().diagnostics.find(d=>d.code==='SUPERSEDED_GENERATION_RETAINED');
 assert.ok(retained);assert.equal(retained.severity,'warning');assert.match(retained.message,VN);assert.match(retained.detail,/superseded:/);
});

test('F2: a CAS conflict is reported in Vietnamese with a reopen instruction, recorded, and its retained candidate is released',async t=>{
 const {c,store}=await fixture(t);const before=canonicalJSON(c.doc),head=c.headRevision;
 store.controls.conflictOnce=true;
 const r=await c.dispatch({type:'parameter.set',id:'size',value:'56'});
 assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'CONFLICT');
 assert.notEqual(r.diagnostic.message,'CONFLICT');assert.match(r.diagnostic.message,VN);assert.match(r.diagnostic.message,/tab/);assert.match(r.diagnostic.message,/mở lại/);
 assert.equal(canonicalJSON(c.doc),before);assert.equal(c.headRevision,head);
 const conflict=c.getSnapshot().controller.conflicts.at(-1);
 assert.equal(conflict.projectId,c.projectId);assert.equal(conflict.expectedRevision,head);assert.equal(conflict.currentRevision,head+1);assert.equal(conflict.candidateDiscarded,true);
 assert.deepEqual(store.controls.discarded,[conflict.transactionId]);
 ok(await c.dispatch({type:'project.open',id:c.projectId}));ok(await c.dispatch({type:'parameter.set',id:'size',value:'56'}));
 assert.equal(effectiveValues(c.doc.state).size,56);
});

test('F3: a commit that becomes durable while the lease expires is reflected locally and reported as committed',async t=>{
 const {c,store}=await fixture(t);const id=c.projectId,before=c.headRevision;
 store.controls.afterCommit=()=>{store.controls.canEdit=false;};
 const r=await c.dispatch({type:'parameter.set',id:'size',value:'55'});
 assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'PROJECT_LOCKED');
 assert.equal(store.records.get(id).headRevision,before+1,'the generation is durable in storage');
 assert.equal(c.headRevision,before+1,'local head must follow the durable commit');
 assert.equal(effectiveValues(c.doc.state).size,55,'local document must follow the durable commit');
 const warning=c.getSnapshot().diagnostics.find(d=>d.code==='COMMIT_DURABLE_BEFORE_LOCK');
 assert.ok(warning);assert.equal(warning.severity,'warning');assert.match(warning.message,VN);
 assert.equal(c.getSnapshot().capabilities.find(x=>x.id==='project.write').available,false);
});

test('F4: transient library read failures are retried on the next refresh; stored-data problems stay cached with a Vietnamese reason',async t=>{
 const {c,store}=await fixture(t);const id=c.projectId;
 const future=structuredClone(store.records.get(id));future.manifest.document.version=99;store.records.set('TEST-future',future);
 c.libraryCache.clear();store.controls.loadFailures.set(id,1);
 await c.refreshLibrary();
 assert.ok(!c.library.some(e=>e.id===id),'a project whose read failed is not listed yet');
 const transient=c.getSnapshot().controller.unrecognizedProjects.find(u=>u.id===id);
 assert.equal(transient.code,'TEST_IO_READ');assert.equal(transient.transient,true);assert.match(transient.reason,VN);assert.match(transient.reason,/thử lại/);
 const unsupported=c.getSnapshot().controller.unrecognizedProjects.find(u=>u.id==='TEST-future');
 assert.equal(unsupported.code,'APP_DOCUMENT_VERSION');assert.equal(unsupported.transient,false);assert.match(unsupported.reason,VN);
 await c.refreshLibrary();
 assert.ok(c.library.some(e=>e.id===id),'a transient read failure must be retried on the next refresh');
 assert.ok(!c.getSnapshot().controller.unrecognizedProjects.some(u=>u.id===id));
 assert.equal(store.controls.loadCalls.filter(x=>x==='TEST-future').length,1,'a stored-data problem stays cached for its revision');
 assert.ok(c.getSnapshot().controller.unrecognizedProjects.some(u=>u.id==='TEST-future'));
});
