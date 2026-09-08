import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {export3MFProject} from '../src/exporter.mjs';
import {sealed,hashData} from '../src/contracts.mjs';
const run=process.env.PROJECT_REVIEW_RUN;
const factory=(await import(pathToFileURL(join(run,'work/build-printing-wasm-cross/arch3mf.mjs')))).default;
const module=await factory({wasmBinary:await readFile(join(run,'work/build-printing-wasm-cross/arch3mf.wasm'))});
await mkdir(join(run,'evidence/slicer-inputs'),{recursive:true});
for(const shape of ['adjacent','cube']){
 const r=JSON.parse(await readFile(join(run,'inputs/printing/bambu-'+shape+'.request.json')));
 const recipe={id:'analytic-clear-placement-v1',translationMm:[100,100,0],sourceHashes:r.sourceHashes};
 for(let i=0;i<r.mesh.vertices.length;i+=3){r.mesh.vertices[i]+=100;r.mesh.vertices[i+1]+=100;}
 r.revision=r.mesh.revision='analytic-clear-placement-v1';
 r.sourceHashes=[...r.sourceHashes,{id:recipe.id,sha256:await hashData(recipe)}];
 if(shape==='cube')r.schedule=await sealed({...r.schedule.payload,firstLayerHeight:0.25,origin:{firstLayerHeight:'user',layerHeight:'user'}});
 const result=await export3MFProject(r,module);
 await writeFile(join(run,'evidence/slicer-inputs','centered-'+shape+'.3mf'),result.bytes);
 await writeFile(join(run,'evidence/slicer-inputs','centered-'+shape+'.json'),JSON.stringify({recipe,metadata:result.metadata,report:result.report},null,2));
}
