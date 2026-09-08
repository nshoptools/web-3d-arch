import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppController} from '../../src/app/controller.mjs';
import {sha256,uuid} from '../../src/app/common.mjs';
import {verifyDocument} from '../../src/app/documents.mjs';
import {createEditor} from '../../src/editing/index.mjs';
import {namedTestAdapters} from './test-doubles.mjs';
import {adoptionCases,ok} from './source-adoption.cases.mjs';
// Explicit Node-only memory commit recorder: controller/domain/history/bytes are real;
// browser suite supplies actual authenticated backend + IDB/OPFS instead of this recorder.
function memoryStore(){
 const records=new Map();return {capabilities:{selectedBackend:'TEST-memory',database:{readOnly:false}},
  status:()=>({canEdit:true,canRescue:true,capabilities:{database:{readOnly:false}}}),close(){},
  async listProjects(){return [...records].map(([projectId,r])=>({projectId,revision:r.headRevision,title:r.manifest.document.title}));},
  async load(id){return structuredClone(records.get(id)??{status:'empty'});},
  async commit(input,{signal}={}){
   assert.ok(!signal?.aborted);const old=records.get(input.projectId),revision=old?.headRevision??0;
   if(input.expectedRevision!==revision)throw Object.assign(Error('TEST CAS'),{code:'CONFLICT'});
   const assets=[];for(const a of input.assets){const bytes=a.bytes.slice(),hash=await sha256(bytes);assets.push({hash,byteLength:bytes.length,kind:a.kind,bytes});}
   await verifyDocument(input.document,new Map(assets.map(a=>[a.hash,a])));assert.ok(!signal?.aborted);
   const head={revision:revision+1,transactionId:input.transactionId},record={status:'editable',head,headRevision:head.revision,assets,
    manifest:{document:structuredClone(input.document),engine:input.engine,assets:assets.map(({bytes,...a})=>a),dependencies:[]}};
   records.set(input.projectId,record);return {head};
  }
 };
}
function createNodeEditingClient(){let editor;return {async initialize(input){editor=await createEditor(input);return editor.token();},prepare:(c,control)=>editor.prepare(c,control),commit:(id,token)=>editor.commit(id,token),dispose(){editor=null;}};}
for(const [name,body]of Object.entries(adoptionCases))test('source adoption: '+name,async()=>{
 const test=namedTestAdapters(),c=createAppController({origin:'https://test.invalid',deviceId:uuid(),adapters:test.adapters});
 c.store=memoryStore();c.session={...c.session,status:'signed-in',user:{id:'TEST-unit-user',name:'TEST',role:'member'}};
 c.remote.settings={values:{}};c.remote.settingsUpdate=async()=>{};c.api.userId='TEST-unit-user';c.emit();
 try{ok(await c.dispatch({type:'project.create',product:'keychain'}));await body({c,...test,createEditingClient:createNodeEditingClient});}
 finally{await c.dispose();}
});
