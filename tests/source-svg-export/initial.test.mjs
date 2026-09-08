import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {kernel,sources,driver,close,roots,log} from './native-harness.mjs';
import {scenario,SVG,text} from './scenario.mjs';
test.after(close);
for(const kind of ['svg','text','emoji','raster'])test('actual committed '+kind+' exports before any model',{timeout:60000},async()=>{
 const e=await scenario({kernel,sources,driver});try{await e.ingest(kind);const r=await e.refresh();assert.equal(r.descriptor.status,'ready');const out=await e.export(),artifact=out.artifact??out;assert.equal(e.live.model,null);assert.match(text(artifact.bytes),/<svg/);if(kind==='svg')assert.equal(text(artifact.bytes),SVG);assert.equal(roots.size,0);const dir=path.join(process.env.PROJECT_REVIEW_RUN,'evidence/source-initial-'+(process.env.SOURCE_SVG_LABEL??'attempt'));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,kind+'.svg'),artifact.bytes);fs.writeFileSync(path.join(dir,kind+'.json'),JSON.stringify({descriptor:r.descriptor,metadata:artifact.metadata,changes:out.changes??[],noModel:true},null,2));}finally{await e.close();}
});
