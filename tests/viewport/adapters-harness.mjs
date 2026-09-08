import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createPNGEncoder} from '../../src/core/png-client.mjs';
import {createProject} from '../../src/domain/index.mjs';
import {readStoredZip} from '../../src/storage/zip.mjs';
const source='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#0099cc" fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/><path fill="#ee7733" d="M10 0H20V10H10Z"/></svg>';
const expect=(value,message)=>{if(!value)throw new Error(message);};
const base64=bytes=>{let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function runAdapterChecks(){
  const phase=label=>console.info('adapter-phase: '+label);
  const original=new TextEncoder().encode(source),sourceHash=await hash(original),assets=new Map([[sourceHash,original]]),progress=[];
  let generation=0,recipeAllowed=true;
  const control=()=>({version:'arch-app-adapters/1',ticket:{id:'job-'+(++generation),userId:'user-one',projectId:'project-one',revision:0,generation},signal:new AbortController().signal,onProgress:p=>progress.push(p)});
  const adapters=createKernelAdapters({moduleURL:'/arch-kernel.mjs',workerURL:'/src/core/engine-worker.mjs',selectRecipe:async({state,assets})=>{
    if(!recipeAllowed)throw Object.assign(new Error('ENGINE_FEATURE_SCOPE_UNSUPPORTED'),{code:'ENGINE_FEATURE_SCOPE_UNSUPPORTED'});
    return {kind:'svg',source:new TextDecoder().decode(assets.get(state.content.app.source.raw.hash)),thicknessMm:2,longEdgeMm:20,toleranceMm:.004};
  }});
  const png=createPNGEncoder({workerURL:'/src/core/png-worker.mjs'});let model;
  try{
    phase('source-ingest');
    const sourceControl=control(),ingested=await adapters.source.ingest({...sourceControl,file:{name:'analytical.svg',mediaType:'image/svg+xml',bytes:original},purpose:'source'});
    expect(ingested.kind==='svg'&&ingested.preview.png.length>8&&!ingested.raster,'preview must not authorize vector conversion');
    expect(JSON.stringify(ingested.ticket)===JSON.stringify(sourceControl.ticket),'echo exact source ticket');
    const state=createProject({sourceKind:'svg',content:{app:{source:{kind:'svg',raw:{hash:sourceHash}},materials:ingested.materials}}});
    phase('geometry-build');const buildControl=control();model=await adapters.engine.build({...buildControl,state,assets});
    expect(JSON.stringify(model.ticket)===JSON.stringify(buildControl.ticket),'echo exact model ticket');
    const before=await hash(new Uint8Array(model.bytes()));
    phase('stl-export');const artifact=await adapters.exporter.export({...control(),formatId:'stl-parts-zip',state,model});
    const zip=readStoredZip(artifact.bytes),manifest=JSON.parse(new TextDecoder().decode(zip.get('manifest.json')));
    expect(manifest.parts.length===2&&manifest.units==='mm','explicit parts manifest');
    expect(manifest.fitQualification==='unqualified','no invented fit claim');
    recipeAllowed=false;let scopeError;try{await adapters.engine.build({...control(),state,assets});}catch(e){scopeError=e.code;}
    expect(scopeError==='ENGINE_FEATURE_SCOPE_UNSUPPORTED','unsupported active recipe cannot become bare extrusion');
    expect(await hash(new Uint8Array(model.bytes()))===before,'failed build retains prior manufacturing bytes');
    phase('source-conversion');const converted=await adapters.source.convert({...control(),target:'raster',state,source:state.content.app.source,assets});
    expect(converted.status==='proposal'&&converted.result.raster.data instanceof Uint8ClampedArray,'explicit conversion proposal');
    phase('png-worker');const rgba=converted.result.raster,prior=await hash(rgba.data),encoded=await png(rgba);
    expect(encoded[0]===137&&await hash(rgba.data)===prior,'PNG Worker must preserve caller RGBA');
    const cancelled=new AbortController();cancelled.abort();let cancelError;try{await png(rgba,{signal:cancelled.signal});}catch(e){cancelError=e.code;}
    expect(cancelError==='CANCELLED','cancelled PNG cannot produce output');
    expect(await hash(original)===sourceHash,'source bytes preserved through import/build/export/conversion');
    const files=manifest.parts.map(p=>({name:p.file,base64:base64(zip.get(p.file))}));
    model.release();let released;try{model.bytes();}catch(e){released=e.code;}expect(released==='LEASE_RELEASED','primary released once');model.release();model=null;
    phase('private-reset');adapters.reset();png.reset();recipeAllowed=true;
    model=await adapters.engine.build({...control(),state,assets});expect(model.generation===1,'new user Worker has a fresh native generation');
    const result={scope:'component adapters with explicitly authorized analytic recipe; no full product/UI claim',parts:files,sourceHash,originalPreserved:true,privateWorkerReset:true,progress:progress.length};
    model.release();model=null;return result;
  }finally{model?.release();adapters.reset();png.reset();}
}
