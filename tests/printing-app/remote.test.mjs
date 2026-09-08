// Real RemoteServices mapping and server settings validator; controlled in-memory API transport, no network/account claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {RemoteServices} from '../../src/app/remote.mjs';
import {validateSettings} from '../../src/server/settings.mjs';
import {createPrintingAdapters} from '../../src/integration/printing-adapters.mjs';
import {profiles,environment,clone,BAMBU} from './fixtures.mjs';
const P=await profiles(fileURLToPath(new URL('../../',import.meta.url)));
test('actual remote settings update/import/reset binds the latest response document',async()=>{
 const e=environment(P.bambu),calls=[];let revision=2,values={};
 const api={epoch:1,userId:e.auth.userId,async request(path,{body,etag}){
  calls.push(path);assert.equal(etag,'"r'+revision+'"');let next;
  if(path.endsWith('/import')){assert.equal(body.confirm,'import:'+body.mode);next=body.mode==='merge'?{...values,...body.document.values}:body.document.values;}
  else if(path.endsWith('/reset')){assert.equal(body.confirm,'reset-settings');next={};}else next=body.values;
  validateSettings(next);values=clone(next);return {value:{schemaVersion:1,revision:++revision,values:clone(values)},etag:'"r'+revision+'"'};
 }};
 const remote=new RemoteServices(api);remote.settings={schemaVersion:1,revision,values:{}};remote.settingsETag='"r'+revision+'"';
 e.adapter.dispose();e.bindings.settings=()=>e.auth?{...e.auth,settings:remote.settings}:null;e.adapter=createPrintingAdapters(e.bindings);
 await remote.settingsUpdate({printerProfiles:[clone(P.bambu)]});assert.equal((await e.adapter.list())[0].id,P.bambu.payload.id);
 await remote.importSettings('replace',{schemaVersion:1,values:{printerProfiles:[clone(P.u1)]}},true);assert.equal((await e.adapter.list())[0].id,P.u1.payload.id);
 assert.notEqual(e.adapter.describe(BAMBU,e.current).status,'ready');
 await remote.resetSettings(true);assert.deepEqual(await e.adapter.list(),[]);
 assert.deepEqual(calls,['/api/v1/settings','/api/v1/settings/import','/api/v1/settings/reset']);
 remote.clear();e.auth=null;e.current=null;e.adapter.reset();assert.deepEqual(await e.adapter.list(),[]);
});
test('user A to B to A with fresh authority invalidates in-flight profile validation and keys',async()=>{
 const e=environment(P.bambu);await e.adapter.refresh();const first=e.adapter.describe(BAMBU,e.current),a=e.auth.userId;
 const pending=e.adapter.list();e.auth={...e.auth,userId:'test-member-b',sessionKey:{}};e.current={...e.current,userId:e.auth.userId,sessionKey:e.auth.sessionKey};
 await assert.rejects(pending,{code:'PRINTING_CONTEXT_STALE'});assert.notEqual(e.adapter.describe(BAMBU,e.current).status,'ready');
 e.adapter.reset();e.auth={...e.auth,userId:a,sessionKey:{}};e.current={...e.current,userId:a,sessionKey:e.auth.sessionKey};
 await e.adapter.refresh();const last=e.adapter.describe(BAMBU,e.current);assert.equal(last.status,'ready');assert.notEqual(last.key,first.key);
});
test('imported profile qualification and calibration claims never become printing evidence',async()=>{
 const e=environment(P.bambu),p=e.auth.settings.values.printerProfiles[0];p.payload.qualified=true;p.payload.fit='verified';
 const {sealed}=await import('../../src/printing/src/contracts.mjs');e.auth.settings.values.printerProfiles=[await sealed(p.payload)];
 e.auth.settings.values.calibrationProfiles=[{printerIdentity:'claimed-printer',nozzle:.4,material:'PLA',slicer:'claimed',profileHash:p.sha256,qualified:true,fit:'verified'}];
 validateSettings(e.auth.settings.values);const r=await e.adapter.refresh();assert.equal(r.printers[0].qualified,false);assert.equal(r.selection.provenance.qualification.calibration,'unverified');assert.equal(r.selection.provenance.qualification.physicalFit,'unqualified');
});
