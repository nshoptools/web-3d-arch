import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import test from 'node:test';import {pathToFileURL} from 'node:url';
import {sha256,readJSON,environment,safe} from '../../tools/assets/source-library/common.mjs';
const {root,run}=environment(),library=safe(root,process.env.ARCH_LIBRARY_CANDIDATE),stage=safe(run,process.env.ARCH_LIBRARY_STAGE),prefix='src/assets/source-library';
const read=rel=>readJSON(path.join(library,prefix,rel)),original=rel=>readJSON(path.join(root,rel));
const catalog=read('catalog.json'),manifest=read('deployment.json'),mono=read('mono-thumbnails.json'),coverage=read('font-coverage.json'),labels=read('search/labels.json');
const {materializeSourceLibrary,checkedLibraryPath}=await import(pathToFileURL(path.join(stage,'src/integration/source-library.mjs')));
const {createSourceCatalog,createAssetReader}=await import(pathToFileURL(path.join(stage,'src/integration/source-catalog.mjs')));
const config=materializeSourceLibrary({catalog,manifest,origin:'https://sources.example',basePath:'/app/'}),api=createSourceCatalog(config);
const hashes=new Map(manifest.records.map(r=>[r.sha256,r])),files=new Map(manifest.records.flatMap(r=>r.originalFiles.map(f=>[f,r])));
function small(){
 const c=structuredClone(catalog.collections.find(c=>c.style==='monochrome')),font=structuredClone(catalog.fonts.find(f=>f.id===c.defaultFontId));
 c.items=[c.items.find(i=>i.id==='1f600')];c.components=[];c.aliases=[];c.fonts=[font];
 const p=catalog.previews.find(p=>p.collectionId===c.id&&p.itemId==='1f600'),wanted=new Set([font.sha256,font.license.asset.sha256,p.sha256]);
 const records=structuredClone(manifest.records.filter(r=>wanted.has(r.sha256)));
 return {catalog:{version:'arch-source-catalog/1',fonts:[font],collections:[c],previews:[structuredClone(p)],defaultFontId:font.id,defaultCollectionId:c.id},manifest:{version:manifest.version,records,totalUniqueBytes:records.reduce((n,r)=>n+r.bytes,0),sourceFileCount:records.reduce((n,r)=>n+r.originalFiles.length,0)},origin:'https://sources.example'};
}
test('all original variants and measured axes/coverage/source/license metadata survive',()=>{
 const input=[...original('src/assets/fonts/fonts-cat.json'),...original('src/assets/emoji/fonts-cat.json'),...original('src/assets/emoji/color/fonts-cat.json')];
 assert.equal(catalog.fonts.length,input.length);
 for(const f of input){const out=catalog.fonts.find(o=>o.id===f.id);assert.ok(out);for(const [key,v]of Object.entries(f))assert.deepEqual(key==='license'?Object.fromEntries(Object.keys(v).map(k=>[k,out.license[k]])):out[key],v,f.id+'/'+key);assert.equal(files.get(out.library.file).sha256,f.sha256);assert.ok(hashes.has(out.license.asset.sha256));}
 assert.equal(api.queryFonts().length,input.filter(f=>!f.color).length);assert.equal(api.defaultFontId,'inter');
});
test('all canonical picker records, components, aliases and pages retained',()=>{
 const reg=original('src/assets/emoji/collections.json');assert.equal(catalog.defaultCollectionId,reg.defaultCollection);
 const alias=original('src/assets/emoji/color/input-aliases.json').items,colors=original('src/assets/emoji/color/emoji-cat.json').items,components=original('src/assets/emoji/color/components-cat.json').items;
 for(const c of catalog.collections){
  assert.deepEqual(c.aliases,alias);const old=c.style==='color'?colors:original('src/assets/emoji/emoji-cat.json').items;
  assert.deepEqual(c.items.map(i=>i.id),old.map(i=>i.id));assert.deepEqual(c.components.map(i=>i.id),components.map(i=>i.id));
  const collected=[];for(let offset=0;offset<c.items.length+c.components.length;offset+=64)collected.push(...api.queryEmoji('',c.id,offset).entries);
  assert.equal(new Set(collected.map(i=>i.id)).size,c.items.length+c.components.length);
  for(const a of alias)if(c.items.some(i=>i.id===a.canonicalId)||c.components.some(i=>i.id===a.canonicalId))assert.equal(api.emoji(a.emoji,c.id).item.id,a.canonicalId);
  for(const e of collected){assert.ok(e.previewUrl.startsWith('https://sources.example/app/source-assets/'));assert.equal(e.verdict,'unverified');}
 }
});
test('every locked source asset remains addressable; runtime JS/WASM excluded',()=>{
 for(const [lock,base]of [['src/assets/assets-lock.json',''],['src/assets/emoji/color/assets-lock.json','src/assets/emoji/color/']]){
  for(const f of original(lock).files){const file=base+f.path;if(file.startsWith('src/assets/fonts/')||file.startsWith('src/assets/emoji/')){assert.equal(files.get(file)?.sha256,f.sha256,file);assert.equal(files.get(file)?.bytes,f.bytes);}}
 }
 assert.ok(manifest.records.every(r=>!r.originalFiles.some(f=>/\.(wasm|mjs|js)$/i.test(f))));
});
test('original color preview bytes and all raster sizes/vector metadata retained',()=>{
 const c=catalog.collections.find(c=>c.style==='color'),old=[...original('src/assets/emoji/color/emoji-cat.json').items,...original('src/assets/emoji/color/components-cat.json').items];
 for(const i of old){const out=[...c.items,...c.components].find(o=>o.id===i.id);
  for(const key of ['rasters','vectors'])for(const r of i[key]){const o=out[key].find(a=>a.path===r.path);for(const [k,v]of Object.entries(r))assert.deepEqual(o[k],v);assert.equal(files.get(o.libraryFile).sha256,r.sha256);}
  const p=catalog.previews.find(p=>p.collectionId===c.id&&p.itemId===i.id);assert.equal(p.sha256,i.rasters.find(r=>r.path===i.preferredRasterPath).sha256);
 }
});
test('font selection coverage is measured per variant, never guessed',()=>{
 const c=catalog.collections.find(c=>c.style==='color');assert.equal(c.selection.kind,'COLRv1');assert.equal(coverage.bindings.length,c.fonts.length);
 for(const b of coverage.bindings){assert.equal(b.supportedCount+b.unsupportedCount,c.items.length+c.components.length);assert.equal(Object.keys(b.glyphs).length,b.supportedCount);
  for(const i of [...c.items,...c.components])assert.equal(i.glyphs[b.fontId],b.glyphs[i.id]);assert.equal(c.selectionOptions.find(o=>o.fontId===b.fontId).unavailableItems,b.unsupportedCount);
 }
 assert.ok(coverage.bindings.some(b=>b.unsupportedCount>0));assert.equal(coverage.bindings.find(b=>b.fontId===c.selection.fontId).unsupportedCount,0);
});
test('all mono items/components use original-font-derived PNGs with bounded ink proofs',()=>{
 const c=catalog.collections.find(c=>c.style==='monochrome');assert.equal(mono.items.length,c.items.length+c.components.length);assert.equal(mono.recipe.geometryQualification,'source-font-preview-only');
 for(const p of mono.items){assert.equal(p.fontSha256,c.fontHash);assert.deepEqual(p.variations,{wght:400});assert.equal(p.width,128);assert.equal(p.height,128);assert.ok(p.visiblePixels>0);assert.ok(p.contours>0);assert.ok(p.shape.every(s=>Number.isInteger(s.clusterCodepoints)));assert.ok(hashes.has(p.sha256));}
 assert.equal(new Set(mono.items.map(p=>p.sha256)).size,manifest.records.filter(r=>r.roles.includes('derived-mono-preview')).length);
});
test('Vietnamese labels reproduce exact pinned official CLDR rows',()=>{
 const lock=read('search/cldr-lock.json'),maps=new Map();
 for(const r of lock.files){const b=fs.readFileSync(path.join(library,prefix,'search/upstream',r.file));assert.equal(b.length,r.bytes);assert.equal(sha256(b),r.sha256);assert.equal(new URL(r.url).hostname,'raw.githubusercontent.com');assert.ok(r.url.includes('/'+lock.commit+'/'));if(r.file.endsWith('.json')){const d=JSON.parse(b);maps.set(r.file,(d.annotations??d.annotationsDerived).annotations);}}
 assert.equal(labels.coverage.total,catalog.previews.length);assert.equal(labels.coverage.translated,labels.entries.length);assert.equal(labels.coverage.missingCount,labels.coverage.missing.length);
 for(const l of labels.entries){const official=maps.get(l.sourceFile)[l.cldrKey];assert.equal(l.vi,official.tts[0]);assert.deepEqual(l.keywords,official.default);}
 assert.deepEqual(catalog.labels,labels);
 assert.ok(api.queryEmoji('viet nam').entries.some(r=>r.text==='🇻🇳'));assert.ok(api.queryEmoji('cuoi').entries.some(r=>r.text==='😀'));
});
test('retained artwork is separate from Unicode selection and preserves feature metadata',()=>{
 const art=read('artwork.json'),old=original('src/assets/emoji/color/artwork-cat.json');assert.equal(art.items.length,old.items.length);
 const emojiIds=new Set(catalog.collections.flatMap(c=>[...c.items,...c.components].map(i=>i.id)));let nonUnicode=0;
 for(const i of old.items){const a=art.items.find(a=>a.id===i.id);for(const [k,v]of Object.entries(i))assert.deepEqual(a[k],v);assert.equal(a.selection.status,'separate-artwork-adapter-required');assert.ok(hashes.has(a.sha256));assert.ok(hashes.has(a.license.sha256));assert.ok(!emojiIds.has(a.id));if(!i.emojiIds.length)nonUnicode++;}
 assert.ok(nonUnicode>0);
});
test('manifest deduplicates byte identity and materializes explicit deployment base',()=>{
 assert.equal(hashes.size,manifest.records.length);assert.equal(files.size,manifest.sourceFileCount);
 assert.equal(manifest.totalUniqueBytes,manifest.records.reduce((n,r)=>n+r.bytes,0));assert.ok(manifest.sourceFileCount>hashes.size);
 for(const r of manifest.records){assert.match(r.url,new RegExp('^source-assets/'+r.sha256+'[.]'));assert.equal(config.assetURLs.find(a=>a.sha256===r.sha256).url,'https://sources.example/app/'+r.url);}
});
test('unsafe paths, schemes, credentials, traversal and Windows device names reject',()=>{
 for(const s of ['','/x','../x','a/../b','a//b','a\\b','https://bad/x','a%2fb','a?x','a#x','a\0b','a/CON.txt','LPT9','a./b','x/..','x/',' x','a:stream'])assert.throws(()=>checkedLibraryPath(s),{code:'LIBRARY_PATH'},s);
 for(const origin of ['null','file:///a','https://x/a','https://u:p@x','https://x?y','https://x#z'])assert.throws(()=>materializeSourceLibrary({...small(),origin}),{code:'LIBRARY_ORIGIN'});
 for(const basePath of ['//evil/','/../','/%2e%2e/','relative/','/a?b/'])assert.throws(()=>materializeSourceLibrary({...small(),basePath}));
});
test('malformed hashes, counts, byte budgets and source mappings reject',()=>{
 for(const mutate of [
 s=>s.manifest.records[0].sha256='0'.repeat(63),s=>s.manifest.records[0].bytes=NaN,s=>s.manifest.records[0].bytes=0,
 s=>s.manifest.records[0].bytes=16000001,s=>s.manifest.totalUniqueBytes++,s=>s.manifest.sourceFileCount++,s=>s.manifest.sourceFileCount=65537,s=>s.manifest.sourceFileCount=NaN,
 s=>s.manifest.records[0].mediaType='application/wasm',s=>s.manifest.records.push(s.manifest.records[0]),
 s=>s.manifest.records[0].originalFiles.push(s.manifest.records[1].originalFiles[0]),
 s=>s.manifest.records[0].url='../secret',s=>s.manifest.records[0].url='source-library/ready.json',s=>s.manifest.records[0].url='source-assets/wrong.png',s=>s.manifest.records[0].file='C:/file']){
  const s=small();mutate(s);assert.throws(()=>materializeSourceLibrary(s));
 }
});
test('missing or wrong-media source/preview/license refs reject before runtime',()=>{
 for(const mutate of [
 s=>s.catalog.previews.pop(),s=>s.catalog.previews.push(s.catalog.previews[0]),s=>s.catalog.previews[0].sha256='0'.repeat(64),
 s=>s.catalog.fonts[0].bytes=0,s=>s.catalog.fonts[0].sha256=s.catalog.previews[0].sha256,
 s=>s.catalog.fonts[0].license.asset.sha256=s.catalog.previews[0].sha256,s=>s.catalog.collections[0].selection.fontId='missing']){
 const s=small();mutate(s);assert.throws(()=>materializeSourceLibrary(s));}
});
test('materialization and query results own their mutable metadata',()=>{
 const s=small(),out=materializeSourceLibrary(s),a=createSourceCatalog(out);out.catalog.collections[0].items[0].emoji='X';
 assert.equal(s.catalog.collections[0].items[0].emoji,'😀');const first=a.emoji('1f600');first.item.emoji='Y';assert.equal(a.emoji('1f600').item.emoji,'😀');
});
test('retained asset bytes are checked and owned, cancellation is honored',async()=>{
 const row=manifest.records.find(r=>r.roles.includes('derived-mono-preview')),data=fs.readFileSync(path.join(library,row.file));
 const reader=createAssetReader(config),loaded=await reader(row,{assetsMap:new Map([[row.sha256,new Uint8Array(data)]])});assert.notEqual(loaded.buffer,data.buffer);assert.equal(sha256(loaded),row.sha256);
 await assert.rejects(reader(row,{assetsMap:new Map([[row.sha256,new Uint8Array(data.length)]])}),{code:'HASH_MISMATCH'});
 const c=new AbortController();c.abort();await assert.rejects(reader(row,{signal:c.signal}),{code:'CANCELLED'});
});
test('build receipt rehashes every original and current main contract preimage',()=>{
 const receipt=read('build-receipt.json');
 for(const i of receipt.inputs){const b=fs.readFileSync(path.join(root,i.file));assert.equal(b.length,i.bytes);assert.equal(sha256(b),i.sha256,i.file);}
 for(const o of receipt.outputs){const b=fs.readFileSync(path.join(library,o.file));assert.equal(b.length,o.bytes);assert.equal(sha256(b),o.sha256,o.file);}
 assert.ok(receipt.inputs.some(i=>i.file==='src/integration/source-catalog.mjs'));
});
