import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {SOURCE_DATUMS} from '../src/source-datums.mjs';
import {root,evidence} from '../tools/test-env.mjs';
const domain=await import(pathToFileURL(path.join(process.env.PROJECT_ROOT,'src/domain/index.mjs')));
const {createMechanicsDomainAdapter,DATUMS}=await import(pathToFileURL(path.join(root,'src/kernel/mechanics/src/domain-adapter.mjs')));
const encode=createMechanicsDomainAdapter(domain);let cases=0;
for(const[k,v]of Object.entries(SOURCE_DATUMS))assert.equal(DATUMS[k],v);
for(const regular of [.16,.2,.25])for(const[field,featureId]of[['artH','source:art.bottom'],['rimH','source:rim.bottom'],['flatTop','source:flat.bottom'],['bandCap','source:core-cap.top']]){
  let p=domain.createProject({product:'keychain',sourceKind:'svg',schedule:domain.createSchedule({firstLayerHeight:.27,layerHeight:regular})});
  const before=JSON.stringify(p),change=domain.previewCommand(p,{id:'parameters.set',args:{changes:[{id:field,value:{heightMode:'layers',layers:3,datum:{kind:'feature',featureId},referenceLayer:2}}]}});assert.ok(change.ok);assert.equal(JSON.stringify(p),before);p=domain.commitPreview(p,change).state;
  const saved=JSON.stringify(p),a=encode(p),id=domain.CATALOG.fields.findIndex(f=>f.id===field)+1,r=a.records.find(r=>r.fieldId===id);assert.equal(JSON.stringify(p),saved);assert.equal(r.mode,2);assert.equal(r.datum,SOURCE_DATUMS[featureId]);assert.equal(r.referenceLayer,2);assert.equal(r.layerCount,3);assert.deepEqual(a.sourceRecipeBindings.find(r=>r.fieldId===id),r);cases++;
}
let p=domain.createProject({product:'keychain',sourceKind:'svg'});const change=domain.previewCommand(p,{id:'parameters.set',args:{changes:[{id:'artH',value:{heightMode:'mm',mm:1.7,datum:{kind:'feature',featureId:'source:art.bottom'},referenceLayer:9}}]}});assert.ok(change.ok);p=domain.commitPreview(p,change).state;const mm=encode(p).records.find(r=>r.fieldId===27);assert.equal(mm.value,1.7);assert.equal(mm.mode,1);assert.equal(mm.datum,128);assert.equal(mm.referenceLayer,9);cases++;
fs.writeFileSync(path.join(evidence,'domain-bindings.json'),JSON.stringify({passed:cases,total:cases,sourceDatumExtension:1,projectMutated:false,nominalMmRetained:true},null,2)+'\n');console.log(`domain bindings ${cases}/${cases}`);
