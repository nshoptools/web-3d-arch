import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,uid} from '../server/helpers.mjs';
import {ApiClient,verifyOnlineLease,moneyMicros,moneyText,createAppController,createEngineAdapter} from '../../src/app/index.mjs';
import {RemoteServices} from '../../src/app/remote.mjs';
import {newDocument,setParameter,appendDocument,moveDocument,verifyDocument,contentEdit,validateState} from '../../src/app/documents.mjs';
import {planHistoryMove,restoreDomainSnapshot} from '../../src/storage/index.mjs';
import {validateProject,effectiveValues} from '../../src/domain/index.mjs';
function clientAPI(f,c){
 const api=new ApiClient({origin:f.app.origin,fetchImpl:async(url,options)=>{
  const headers={...options.headers,Cookie:[...c.cookies].map(([k,v])=>k+'='+v).join('; ')};
  const r=await fetch(url,{...options,headers});
  for(const v of r.headers.getSetCookie()){const kv=v.split(';')[0],i=kv.indexOf('=');c.cookies.set(kv.slice(0,i),kv.slice(i+1));}
  return r;
 }});
 return api;
}
async function remoteFixture(t,cRole='a'){
 const f=await setup(t);f.provider.metadata.models[0].qualities=['test'];f.provider.metadata.models[0].sizes=['1x1'];f.provider.metadata.prices.currency='USD';
 const api=clientAPI(f,f[cRole]);api.bind(await f[cRole].ok('GET','/api/v1/me'));
 const ctx={id:uid(),revision:4};const remote=new RemoteServices(api,{context:()=>ctx,now:f.clock});await remote.refresh();
 return {f,api,remote,ctx};
}
import {analyticalARCHBox} from './test-doubles.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
test('native lease adapter keeps KernelLease and uses independent transport generations',async()=>{
 let released=0,generation=100;
 const kernelLeases=new WeakMap(),client={async build(request,{generation}){const b=analyticalARCHBox(3,2,1,generation);return {id:5,epoch:7,generation,bytes:()=>b,release(){released++;}};},async cancel(){}};
 const a=createEngineAdapter({client,readArchSnapshot,kernelLeases,identity:{id:'TEST-client',version:'1'},nextTransportGeneration:()=>++generation,selectRecipe:()=>({kind:'svg',source:'<svg/>',thicknessMm:1,longEdgeMm:3,toleranceMm:0.004})});
 const ticket={id:uid(),userId:'u',projectId:'p',revision:9,generation:2};
 const model=await a.build({ticket,state:{},assets:new Map(),signal:new AbortController().signal,onProgress(){}});
 assert.equal(model.generation,101);assert.equal(model.ticket.generation,2);assert.equal(kernelLeases.get(model).epoch,7);assert.equal(released,0);
 model.release();model.release();assert.equal(released,1);assert.equal(kernelLeases.has(model),false);
});
test('exact VN money decimals, precision, no grouping or nonfinite coercion',()=>{
 for(const raw of ['1.000001','1,000001'])assert.equal(moneyMicros(raw),1000001);
 for(const raw of ['NaN','1,000.1','1e3','-1','1.0000001',' 1','01','1000001'])assert.throws(()=>moneyMicros(raw));
 assert.equal(moneyText(1000001),'1.000001');assert.equal(moneyText(0),'0');
});
test('three-step domain undo+redo monotonically advances revisions, strict stale branch blocked',async()=>{
 let {document:d,assets}=await newDocument('keychain');
 for(const size of ['51','52','53'])({document:d,assets}=await appendDocument(d,setParameter(d.state,'size',size),assets,{type:'parameter.set',id:'size',value:size}));
 assert.equal(d.state.revision,3);const stale=await planHistoryMove(d.history,'undo');
 for(const size of [52,51,45]){({document:d,assets}=await moveDocument(d,assets,'undo'));assert.equal(effectiveValues(d.state).size,size);}
 assert.equal(d.state.revision,6);
 for(const size of [51,52,53]){({document:d,assets}=await moveDocument(d,assets,'redo'));assert.equal(effectiveValues(d.state).size,size);}
 assert.equal(d.state.revision,9);await verifyDocument(d,assets);
 await assert.rejects(()=>restoreDomainSnapshot(d.state,d.state,stale,{validateDomain:validateProject}),{code:'STALE_HISTORY_BRANCH'});
});
test('history budget requires explicit acceptance and preserves current',async()=>{
 let {document:d,assets}=await newDocument('keychain');
 for(let i=0;i<20;i++)({document:d,assets}=await appendDocument(d,setParameter(d.state,'size',String(51+i)),assets,{type:'parameter.set',id:'size',value:String(51+i)}));
 const state=setParameter(d.state,'size','99');
 await assert.rejects(()=>appendDocument(d,state,assets,{type:'edit'}),{code:'HISTORY_PRUNING_REQUIRED'});
 const result=await appendDocument(d,state,assets,{type:'edit'},{acceptPruning:true});assert.equal(result.document.history.transactions.length,20);assert.equal(effectiveValues(result.document.state).size,99);
});
test('nominal mm, layer schedule and raw decimals survive document history; invalid content is atomic',async()=>{
 let {document:d,assets}=await newDocument('clicky');
 for(const [id,value]of [['pinD','1,7'],['socketD','5.5'],['clr','0,05']])({document:d,assets}=await appendDocument(d,setParameter(d.state,id,value),assets,{type:'set',id,value}));
 const before=JSON.stringify(d);assert.throws(()=>setParameter(d.state,'clr','0,0.5'));assert.equal(JSON.stringify(d),before);
 assert.equal(effectiveValues(d.state).pinD.mm,1.7);assert.equal(effectiveValues(d.state).socketD.mm,5.5);assert.equal(effectiveValues(d.state).clr,0.05);
 assert.throws(()=>contentEdit(d.state,a=>{a.editor.strokeWidthPx='NaN';}));
});
test('real HTTP settings routes/ETags retain both copies; user scopes and owner mutations',async t=>{
 const {f,api,remote}=await remoteFixture(t,'owner');
 const other=new RemoteServices(clientAPI(f,f.owner));other.api.bind(await f.owner.ok('GET','/api/v1/me'));await other.refresh();
 await remote.settingsUpdate({units:'in'});await assert.rejects(()=>other.settingsUpdate({language:'vi'}),{code:'SETTINGS_CONFLICT'});
 assert.equal(other.conflicts[0].incoming.language,'vi');assert.equal(other.conflicts[0].current.units,'in');
 await remote.importSettings('merge','{"schemaVersion":1,"values":{"fontSize":18}}',true);
 assert.equal(remote.settings.values.fontSize,18);await remote.resetSettings(true);assert.deepEqual(remote.settings.values,{});
 const inviteURL=await remote.invite({issuer:f.idp.origin,subject:'controller-invite'});assert.ok(inviteURL.startsWith(f.app.origin+'/#invite='));
 assert.ok((await remote.listUsers()).some(u=>u.id===f.a.user.id));
 await remote.updateUser(f.b.user.id,{active:false,confirmed:true});assert.equal((await f.b.request('GET','/api/v1/me')).status,401);
 await assert.rejects(()=>remote.updateUser(f.a.user.id,{active:false,delete:true,confirmed:true}),{code:'ONE_ACCOUNT_ACTION_REQUIRED'});
 const policy=await remote.read('/api/v1/policy');await remote.updatePolicy(policy.version,policy,true);assert.equal(remote.policy.version,policy.version+1);
 await assert.rejects(()=>api.request('https://example.com/api/v1/me'),{code:'URL_ORIGIN_BLOCKED'});
});
test('actual backend BYOK quote/consent/submit/artifact: options explicit, no prepare charge, no shared fallback',async t=>{
 const {f,remote,ctx}=await remoteFixture(t);f.provider.mode='success';
 assert.equal(remote.registry()[0].connected,false);await remote.connect('test-provider','named-test-only-secret');
 await remote.setBudget({currency:'USD',perOperation:'0.001',perDay:'0.01',perMonth:'0.1'});
 const request={providerId:'test-provider',modelId:'test-image',prompt:'Controlled test fixture',operationId:uid(),quality:'test',size:'1x1'};
 await assert.rejects(()=>remote.prepare({...request,size:undefined}),{code:'AI_OPTIONS_REQUIRED'});
 const quote=await remote.prepare(request);assert.equal(f.provider.calls.length,0);assert.equal(quote.maximumCost,'0.00006');
 await assert.rejects(()=>remote.submit({jobId:quote.jobId,quoteHash:'bad',consent:true}),{code:'CONSENT_REQUIRED'});
 await remote.submit({jobId:quote.jobId,quoteHash:quote.quoteHash,consent:true});
 await f.a.poll({id:quote.jobId},'succeeded');assert.equal(f.provider.calls.length,1);
 const list=await remote.queryJobs();assert.equal(list.jobs[0].accountingBasis,'actual');
 const artifact=await remote.artifact(list.jobs[0].artifacts[0].id);assert.equal(artifact.mediaType,'image/png');assert.ok(artifact.bytes.length>0);
 ctx.revision++;await assert.rejects(()=>remote.artifact(list.jobs[0].artifacts[0].id),{code:'AI_RESULT_STALE'});
 await remote.disconnect('test-provider');assert.equal(remote.registry()[0].connected,false);
 assert.equal((await f.b.ok('GET','/api/v1/ai/credentials')).credentials.length,0);
});
test('actual unknown job cancellation/close keeps outstanding reservation and reason',async t=>{
 const {f,remote}=await remoteFixture(t);await remote.connect('test-provider','TEST-only-unknown');
 await remote.setBudget({currency:'USD',perOperation:'0.001',perDay:'0.01',perMonth:'0.1'});
 const q=await remote.prepare({providerId:'test-provider',modelId:'test-image',prompt:'TEST unknown',operationId:uid(),quality:'test',size:'1x1'});
 await remote.submit({jobId:q.jobId,quoteHash:q.quoteHash,consent:true});await f.a.poll({id:q.jobId},'running');await remote.cancel(q.jobId);
 assert.equal(remote.jobs.get(q.jobId).state,'unknown');const liability=remote.jobs.get(q.jobId).accounting.reservedMicros;
 await assert.rejects(()=>remote.closeUnknown(q.jobId,'',true),{code:'CONFIRMATION_REQUIRED'});
 await remote.closeUnknown(q.jobId,'Track provider separately',true);assert.equal(remote.jobs.get(q.jobId).accounting.reservedMicros,liability);assert.ok(liability>0);await remote.queryJobs();assert.equal(remote.registry()[0].reserved,moneyText(liability));
});
test('actual signed offline lease verifies identity, tampering rejected; same-origin OIDC preparation route returns real URL',async t=>{
 const {f,api}=await remoteFixture(t);const me=await f.a.ok('GET','/api/v1/me');
 const reply=(await api.request('/api/v1/offline/lease',{method:'POST',body:{deviceId:f.a.deviceId}})).value;
 assert.equal((await verifyOnlineLease(reply,me)).userId,f.a.user.id);
 await assert.rejects(()=>verifyOnlineLease(reply,{...me,user:f.b.user}),{code:'LEASE_IDENTITY'});
 const bad=structuredClone(reply);bad.lease.signature=(bad.lease.signature[0]==='A'?'B':'A')+bad.lease.signature.slice(1);
 await assert.rejects(()=>verifyOnlineLease(bad,me),{code:'LEASE_SIGNATURE'});
 const start=await api.request('/api/v1/auth/start',{method:'POST',authStart:true,body:{deviceId:f.a.deviceId,reauth:true}});assert.equal(new URL(start.value.authorizationUrl).origin,f.idp.origin);
});
