import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createPrintingAdapters} from '../../src/integration/printing-adapters.mjs';
import {applicationContext,applicationSettings,applicationSessionKey} from '../../src/integration/application-context.mjs';
import {profiles,environment,BAMBU,U1} from './fixtures.mjs';
const base=fileURLToPath(new URL('../../',import.meta.url)),P=await profiles(base);

// Audit F-01. The application composition handed the printing adapters two different session keys — the
// bare epoch from the settings authority and epoch:generation from the project context — so every 3MF
// target failed with PRINTING_CONTEXT_STALE. The regression drives the adapters through the same two
// functions the composition root uses, on a controller-shaped object, instead of a fixture that hands
// both getters one prepared key.
function controllerLike(env){
 const state=structuredClone(env.current.state);state.content.app.name='Kiểm tra 3MF';
 return {epoch:0,projectContextGeneration:0,projectId:env.current.projectId,session:{user:{id:env.current.userId}},remote:{settings:env.auth.settings},
  doc:{state,history:{current:{stateHash:env.current.headHash}}},visible:{lease:env.model},assets:new Map(),editingAllowed:()=>true};
}
const compose=(env,controller)=>createPrintingAdapters({settings:()=>applicationSettings(controller),context:()=>applicationContext(controller),
 kernelLeases:env.kernelLeases,finalScene:()=>env.scene,runtime:()=>env.runtime});

test('F-01: the settings authority and the project context publish one session key',()=>{
 const controller=controllerLike(environment(P.bambu));
 assert.equal(applicationSettings(controller).sessionKey,applicationContext(controller).sessionKey);
 assert.equal(applicationSessionKey(controller),'0:0');
 controller.epoch=3;controller.projectContextGeneration=2;
 assert.equal(applicationSettings(controller).sessionKey,'3:2');assert.equal(applicationContext(controller).sessionKey,'3:2');
 controller.session.user=null;assert.equal(applicationSettings(controller),null);assert.equal(applicationContext(controller),null);
});

for(const [label,profile,adapterId] of [['Bambu',P.bambu,BAMBU],['Snapmaker U1',P.u1,U1]])
test('F-01: a '+label+' 3MF target reaches ready through the application composition and keeps both design colours',async()=>{
 const env=environment(profile),controller=controllerLike(env),adapter=compose(env,controller);
 const report=await adapter.refresh();assert.equal(report.selection.status,'ready',JSON.stringify(report.selection));
 const described=adapter.describe(adapterId,applicationContext(controller));assert.equal(described.status,'ready',JSON.stringify(described));
 assert.deepEqual(described.materialTable.materials.map(m=>[m.slot,m.color]),[[1,'#FF0000'],[2,'#0000FF']]);
 assert.equal(described.provenance.projectId,env.current.projectId);assert.equal(described.provenance.qualification.slicer,'unverified');
});

test('F-01 counter-case: opening another project and coming back is still a different context until it is prepared again',async()=>{
 const env=environment(P.bambu),controller=controllerLike(env),adapter=compose(env,controller);
 await adapter.refresh();const first=adapter.describe(BAMBU,applicationContext(controller));assert.equal(first.status,'ready');
 controller.projectContextGeneration++; // what project.open does, even A -> B -> A
 const stale=adapter.describe(BAMBU,applicationContext(controller));assert.notEqual(stale.status,'ready');assert.match(stale.reasonCode,/^PRINTING_(REFRESH_REQUIRED|CONTEXT_STALE)$/);
 const again=await adapter.refresh();assert.equal(again.selection.status,'ready');assert.notEqual(again.selection.key,first.key,'a new context is a new preparation');
 controller.epoch++; // sign-out / sign-in
 assert.notEqual(adapter.describe(BAMBU,applicationContext(controller)).status,'ready');
});
