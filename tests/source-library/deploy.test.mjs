import fs from 'node:fs';import path from 'node:path';import test from 'node:test';import assert from 'node:assert/strict';
import {deploySourceLibrary} from '../../tools/assets/source-library/deploy.mjs';import {environment,safe,readJSON,writeJSON} from '../../tools/assets/source-library/common.mjs';
const {root,run}=environment(),library=safe(root,process.env.ARCH_LIBRARY_CANDIDATE),prefix='src/assets/source-library';
test('deployment refuses output outside assigned run before writing',()=>{
 assert.throws(()=>deploySourceLibrary({library,output:path.join(root,'src/assets/source-library-invalid-output')}),/Path escapes root/);
});
test('deployment hashes real source bytes and never publishes ready on corruption',()=>{
 const original=readJSON(path.join(library,prefix,'catalog.json')),fullManifest=readJSON(path.join(library,prefix,'deployment.json'));
 const collection=structuredClone(original.collections.find(c=>c.style==='monochrome')),font=original.fonts.find(f=>f.id===collection.defaultFontId);
 const p=original.previews.find(p=>p.collectionId===collection.id&&p.itemId==='1f600');collection.items=[collection.items.find(i=>i.id===p.itemId)];collection.components=[];collection.aliases=[];
 const wanted=new Set([font.sha256,font.license.asset.sha256,p.sha256]),records=fullManifest.records.filter(r=>wanted.has(r.sha256));
 const catalog={...original,fonts:[font],collections:[collection],previews:[p],defaultFontId:font.id,defaultCollectionId:collection.id};
 const manifest={...fullManifest,records,totalUniqueBytes:records.reduce((n,r)=>n+r.bytes,0),sourceFileCount:records.reduce((n,r)=>n+r.originalFiles.length,0)};
 const negative=path.join(run,'work/source-library-tests/corrupt-library'),output=path.join(run,'work/source-library-tests/corrupt-deploy');
 writeJSON(run,path.join(negative,prefix,'catalog.json'),catalog);writeJSON(run,path.join(negative,prefix,'deployment.json'),manifest);
 const png=records.find(r=>r.sha256===p.sha256),bad=safe(run,path.join(negative,png.file),{exists:false});fs.mkdirSync(path.dirname(bad),{recursive:true});fs.writeFileSync(bad,new Uint8Array(png.bytes));
 assert.throws(()=>deploySourceLibrary({library:negative,output}),/Deployment source mismatch/);assert.equal(fs.existsSync(path.join(output,'source-library/ready.json')),false);
});
