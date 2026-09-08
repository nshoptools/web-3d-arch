import {scoped} from './online-policy.browser.mjs';
import {adoptionCases,ok,check} from './source-adoption.cases.mjs';
import {canonicalJSON} from '../../src/app/common.mjs';
import {readRecord} from '../../src/storage/idb.mjs';
export const sourceAdoptionBrowserCases=Object.fromEntries(Object.entries(adoptionCases).filter(([name])=>name!=='initialProvenanceAfterEdits').map(([name,body])=>['adoption'+name[0].toUpperCase()+name.slice(1),()=>scoped(async context=>{
 ok(await context.c.initialize());ok(await context.c.dispatch({type:'project.create',product:'keychain'}));return body(context);
})]));
// Independent provenance scenarios keep the normal per-case timeout with the full 20-transaction budget.
for(const kind of ['sourceConversion','rasterPreparation'])sourceAdoptionBrowserCases['adoptionInitialProvenance'+kind[0].toUpperCase()+kind.slice(1)]=()=>scoped(async context=>{
 ok(await context.c.initialize());ok(await context.c.dispatch({type:'project.create',product:'keychain'}));
 return adoptionCases.initialProvenanceAfterEdits({...context,provenanceKinds:[kind]});
});
sourceAdoptionBrowserCases.adoptionOnlineLossBeforePublication=()=>scoped(async({c,control,adapters,controls})=>{
 ok(await c.initialize());ok(await c.dispatch({type:'project.create',product:'keychain'}));
 const id=c.projectId,store=c.store,before=await store.load(id);let called=0;
 adapters.source.prepareAdoption=async input=>{called++;control.lost=true;return {version:input.version,ticket:input.ticket,productBindings:{},materials:[],materialDefaults:[]};};
 const result=await c.importFile(new File(['<svg/>'],'loss.svg',{type:'image/svg+xml'}));check(!result.ok&&called===1,'network loss rejected adoption');
 check(canonicalJSON(await readRecord(store.db,'heads',id))===canonicalJSON(before.head),'committed head retained');
 check(!c.job&&!c.pendingOperation&&c.store.status().canRescue&&!c.store.status().canEdit,'no orphan; rescue only');
 const rescued=await store.rescueInventory(id);check(rescued.projectId===id,'authorized read-only rescue remains available');
 control.lost=false;return {realFetchAborted:true,unchangedHead:true,resetCount:controls.resetCount,readOnlyRescue:true,storageCapabilities:store.capabilities,capability:{id:'storage.opfs',status:store.capabilities.opfs.status,details:store.capabilities.opfs}};
});
