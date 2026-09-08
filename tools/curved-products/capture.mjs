import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import crypto from 'node:crypto';
const repo=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
const input=process.argv[2]??path.join(repo,'tmp/reviews/codex/runs/20260908-product-source-bridge-wave1/evidence/source-node-final');
const out=path.join(run,'inputs',process.env.CURVED_CORPUS??'corpus');fs.mkdirSync(out,{recursive:true});
const imp=p=>import(pathToFileURL(path.join(process.env.CURVED_BORROW_ROOT??repo,p)));
const {M,client,operation,setLive,controlFor,noOwned}=await imp('tests/product-app/harness.mjs');
const {createProductAdapters}=await imp('src/integration/product-adapters.mjs');
const {createProductSourceContexts}=await imp('src/integration/product-source-contexts.mjs');
client.serviceCapabilities={geometryVersions:{mechanicsAbi:2,mechanicsSemantics:3,sourceAbi:1,sourceSemantics:2,datumExtension:1}};
let live;const kernel={operation,ensureRuntime:async()=>client};
// Deliberately absent decoders/shapers: these callbacks must never run. Replay
// borrows PSB's committed font outlines and the root's canonical SVG service.
const forbidden=()=>{throw Error('Unexpected source preparation during frozen replay');};
const bridge=createProductSourceContexts({kernel,sources:{source:{ingest:forbidden},raster:{prepareRecipe:forbidden}},context:()=>live});
const adapter=createProductAdapters({operation,kernelLeases:new WeakMap(),context:()=>live,withPreparedSource:bridge.withPreparedSource});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const files=[];
const save=(name,bytes,origin)=>{fs.writeFileSync(path.join(out,name),bytes);files.push({path:name,sha256:hash(bytes),bytes:bytes.length,origin});};
for(const family of ['text','emoji'])for(const product of ['keychain','clicky','strap','lego','charm'])for(const mode of ['noi','chim','phang','phang2']){
 const id=`${family}-${product}-${mode}`;let stateFile=path.join(input,id+'.json');if(!fs.existsSync(stateFile))stateFile=path.join(input,id+'-failure.json');
 const original=fs.readFileSync(stateFile),captured=JSON.parse(original),state=captured.state;
 const projectId=state.content.app.source.metadata.productBindings.projectId;
 live={userId:'user-a',projectId,state};setLive(live);const c=controlFor(state),assets=new Map();
 for(const h of state.content.app.source.assetHashes){let f=path.join(input,id+'-assets',h);if(!fs.existsSync(f))f=path.join(input,'assets',h);assets.set(h,new Uint8Array(fs.readFileSync(f)));}
 await adapter.prepareRecipe({...c,state,assets},async p=>{
  if(p.recipe.source.kind!=='snapshot')throw Error('Fixture must have exactly one committed source');
  const lease=[...client.roots].find(x=>x.id===p.recipe.source.id);if(!lease)throw Error('source lease missing');
  save(id+'.aprq',p.recipe.packed,'current root createProductAdapters.packProductRequest, unchanged captured state');
  save(id+'.arch',lease.bytes().slice(),'current root SVG canonicalizer on PSB committed numeric SVG');
  save(id+'.state.json',original,path.relative(repo,stateFile));
 });noOwned();console.log(id);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,source:'PSB-03 actual Inter O and selected Noto monochrome grinning face',files},null,2)+'\n');
