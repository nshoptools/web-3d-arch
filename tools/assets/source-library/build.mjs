import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';
import {environment,safe,sha256,readJSON,writeJSON,cliArgs} from './common.mjs';
import {checkedLibraryPath,materializeSourceLibrary} from '../../../src/integration/source-library.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),PREFIX='src/assets/source-library';
const codeOrder=(a,b)=>a<b?-1:a>b?1:0;
export async function buildSourceLibrary({output,python=process.env.ARCH_LIBRARY_PYTHON??'python'}){
 const {root,run}=environment();output=safe(run,path.resolve(output),{exists:false});fs.mkdirSync(output,{recursive:true});
 const dest=path.join(output,PREFIX);fs.mkdirSync(dest,{recursive:true});const inputs=new Map(),assets=new Map(),files=new Map();
 function read(rel){checkedLibraryPath(rel);const full=safe(root,path.join(root,rel)),b=fs.readFileSync(full);inputs.set(rel,{file:rel,bytes:b.length,sha256:sha256(b)});return b;}
 const json=rel=>JSON.parse(read(rel));
 function add(rel,b,type,role){
  checkedLibraryPath(rel);const hash=sha256(b);if(b.length<1||b.length>16000000)throw Error('Asset byte cap: '+rel);
  if(files.has(rel)&&files.get(rel)!==hash)throw Error('Conflicting original path');files.set(rel,hash);
  let row=assets.get(hash);if(row){if(row.bytes!==b.length||row.mediaType!==type)throw Error('Digest metadata conflict '+rel);if(!row.originalFiles.includes(rel))row.originalFiles.push(rel);if(!row.roles.includes(role))row.roles.push(role);}
  else{const ext={'image/png':'.png','image/svg+xml':'.svg','font/ttf':'.ttf','application/json':'.json','text/plain':'.txt'}[type];if(!ext)throw Error('Unspecified deployment type');row={sha256:hash,bytes:b.length,mediaType:type,file:rel,url:'source-assets/'+hash+ext,originalFiles:[rel],roles:[role]};assets.set(hash,row);}
  return row;
 }
 const media=rel=>/\.png$/i.test(rel)?'image/png':/\.svg$/i.test(rel)?'image/svg+xml':/\.(ttf|otf)$/i.test(rel)?'font/ttf':/\.json$/i.test(rel)?'application/json':'text/plain';
 const locks=[['src/assets/assets-lock.json',''],['src/assets/emoji/color/assets-lock.json','src/assets/emoji/color/']];
 const originals=[];
 for(const [lockPath,base]of locks){const lock=json(lockPath);for(const r of lock.files){const rel=base+r.path,b=read(rel);if(b.length!==r.bytes||sha256(b)!==r.sha256)throw Error('Original lock mismatch '+rel);originals.push({file:rel,bytes:b.length,sha256:r.sha256});
   // Runtime/vendor WASM and JS libraries are not source-library assets.
   if(rel.startsWith('src/assets/fonts/')||rel.startsWith('src/assets/emoji/'))add(rel,b,media(rel),r.role);
  }console.log('Verified original lock '+lockPath+' ('+lock.files.length+' files)');}
 const registry=json('src/assets/emoji/collections.json'),families=json('src/assets/fonts/families-cat.json');
 const fontSets=[['src/assets/fonts',json('src/assets/fonts/fonts-cat.json')],['src/assets/emoji',json('src/assets/emoji/fonts-cat.json')],['src/assets/emoji/color',json('src/assets/emoji/color/fonts-cat.json')]];
 const fonts=[];for(const [base,entries]of fontSets)for(const f of entries){
  checkedLibraryPath(f.path);checkedLibraryPath(f.license.path);
  const file=path.posix.join(base,f.path),row=assets.get(f.sha256);if(!row||!row.originalFiles.includes(file)||row.bytes!==f.bytes)throw Error('Font catalog mismatch '+f.id);
  const licenseFile=path.posix.join(base,f.license.path),license=assets.get(files.get(licenseFile));if(!license)throw Error('License missing '+f.id);
  fonts.push({...structuredClone(f),license:{...f.license,asset:{sha256:license.sha256,bytes:license.bytes}},library:{file,licenseFile}});
 }
 if(new Set(fonts.map(f=>f.id)).size!==fonts.length)throw Error('Font IDs overlap');
 const mono=json('src/assets/emoji/emoji-cat.json'),color=json('src/assets/emoji/color/emoji-cat.json'),aliases=json('src/assets/emoji/color/input-aliases.json'),components=json('src/assets/emoji/color/components-cat.json'),art=json('src/assets/emoji/color/artwork-cat.json');
 const bundled=path.resolve(HERE,'../../../',PREFIX),cldr=readJSON(path.join(bundled,'search/cldr-lock.json'));
 if(cldr.version!=='arch-cldr-source-lock/1'||!/^([a-f0-9]{40})$/.test(cldr.commit)||cldr.license!=='Unicode-3.0')throw Error('CLDR lock');
 const annotationMaps=[];
 for(const row of cldr.files){checkedLibraryPath(row.file);if(!row.url.startsWith('https://raw.githubusercontent.com/unicode-org/cldr-json/'+cldr.commit+'/'))throw Error('CLDR source origin');const source=path.join(bundled,'search/upstream',row.file),b=fs.readFileSync(safe(root,source));if(b.length!==row.bytes||sha256(b)!==row.sha256)throw Error('CLDR source hash');const rel=PREFIX+'/search/upstream/'+row.file,target=path.join(output,rel);fs.mkdirSync(path.dirname(target),{recursive:true});if(target!==source)fs.writeFileSync(target,b);add(rel,b,media(rel),'cldr-source');
  if(row.file.endsWith('.json')){const d=JSON.parse(b),outer=d.annotations??d.annotationsDerived;if(outer?.identity?.language!=='vi'||!outer.annotations)throw Error('CLDR locale');annotationMaps.push({file:row.file,entries:outer.annotations});}
 }
 writeJSON(run,path.join(dest,'search/cldr-lock.json'),cldr);
 const nativeTools=readJSON(path.join(HERE,'toolchain-lock.json'));
 const work=safe(run,path.join(run,'work/native-source-library'),{exists:false});fs.mkdirSync(work,{recursive:true});
 await new Promise((resolve,reject)=>{const child=spawn(python,['-B',path.join(HERE,'render.py'),'--repo',root,'--output',dest,'--work',work,'--tools-lock',path.join(HERE,'toolchain-lock.json')],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Native thumbnail build exit '+code)));});
 const previews=readJSON(path.join(dest,'mono-thumbnails.json')),coverage=readJSON(path.join(dest,'font-coverage.json'));
 if(previews.items.length!==mono.items.length+previews.components.length||previews.font.sha256!==mono.fontSha256)throw Error('Mono coverage');
 for(const p of previews.items){const rel=PREFIX+'/'+p.file,b=fs.readFileSync(safe(output,path.join(output,rel)));if(sha256(b)!==p.sha256||b.length!==p.bytes)throw Error('Native preview output hash');add(rel,b,'image/png','derived-mono-preview');}
 const fontMap=new Map(fonts.map(f=>[f.id,f])),bindings=new Map(coverage.bindings.map(b=>[b.fontId,b]));
 const enrich=(item)=>{const i=structuredClone(item);for(const key of ['rasters','vectors'])for(const a of i[key]??[]){checkedLibraryPath(a.path);const rel='src/assets/emoji/color/'+a.path,row=assets.get(a.sha256);if(!row?.originalFiles.includes(rel))throw Error('Original artwork ref missing '+rel);a.bytes=row.bytes;a.libraryFile=rel;}
  for(const [id,b]of bindings)if(b.glyphs[i.id]!==undefined)i.glyphs={...i.glyphs,[id]:b.glyphs[i.id]};return i;};
 const catalogs=[];for(const r of registry.collections){
  if(r.style==='color')catalogs.push({...r,items:color.items.map(enrich),components:components.items.map(enrich),aliases:structuredClone(aliases.items),fonts:fontSets[2][1].map(f=>fontMap.get(f.id)),selection:{kind:fontMap.get(r.defaultFontId).colorFormat,fontId:r.defaultFontId},selectionOptions:coverage.bindings.map(b=>({kind:fontMap.get(b.fontId).colorFormat,fontId:b.fontId,supportedItems:b.supportedCount,unavailableItems:b.unsupportedCount,coverageFile:'font-coverage.json'}))});
  else if(r.style==='monochrome')catalogs.push({...r,items:structuredClone(mono.items),components:structuredClone(previews.components),aliases:structuredClone(aliases.items),fontHash:mono.fontSha256,fonts:[fontMap.get(r.defaultFontId)],selection:{kind:'outline',fontId:r.defaultFontId}});
  else throw Error('Unknown collection style retained source needs adapter '+r.style);
 }
 const mappings=[];for(const c of catalogs)for(const item of [...c.items,...c.components]){
  if(c.style==='monochrome'){const p=previews.items.find(p=>p.itemId===item.id);if(!p)throw Error('Missing mono preview');mappings.push({collectionId:c.id,itemId:item.id,sha256:p.sha256,bytes:p.bytes,sourceKind:'original-font-derived-mono/HarfBuzz-resvg-v1',width:p.width,height:p.height,fontSha256:p.fontSha256,variations:p.variations,outlineSha256:p.outlineSha256});}
  else{const png=item.rasters.find(p=>p.path===item.preferredRasterPath);if(!png)throw Error('No preferred original preview');mappings.push({collectionId:c.id,itemId:item.id,sha256:png.sha256,bytes:png.bytes,sourceKind:'original-Noto-PNG-catalog-artwork',width:png.width,height:png.height,originalPath:png.path});}
 }
 const labels=[],missing=[];for(const c of catalogs)for(const item of [...c.items,...c.components]){
  let match=null;for(const key of [...new Set([item.emoji,item.emoji.replaceAll('\ufe0f','')])]){for(const map of annotationMaps)if(map.entries[key]){match={key,row:map.entries[key],file:map.file};break;}if(match)break;}
  if(!match?.row.tts?.[0]){missing.push({collectionId:c.id,itemId:item.id,originalName:item.name});continue;}
  if(match.row.tts.length!==1||!Array.isArray(match.row.default)||match.row.default.some(x=>typeof x!=='string'))throw Error('CLDR annotation schema');
  labels.push({collectionId:c.id,itemId:item.id,vi:match.row.tts[0],keywords:[...match.row.default],cldrKey:match.key,sourceFile:match.file,match:match.key===item.emoji?'exact':'qualified-token-without-FE0F'});
 }
 const labelData={version:'unicode-cldr-vi/'+cldr.release,source:cldr.repository+'/tree/'+cldr.commit,license:{spdx:cldr.license,file:PREFIX+'/search/upstream/LICENSE'},entries:labels,coverage:{total:mappings.length,translated:labels.length,missingCount:missing.length,missing}};
 const defaultFontId=families.find?.(f=>f.id==='inter')?.defaultFontId??'inter';if(!fontMap.has(defaultFontId))throw Error('Explicit default Inter font missing');
 const catalog={version:'arch-source-catalog/1',libraryVersion:'arch-source-library/1',fonts,collections:catalogs,previews:mappings,defaultFontId,defaultCollectionId:registry.defaultCollection,labels:labelData};
 const records=[...assets.values()].map(r=>{r.originalFiles.sort(codeOrder);r.file=r.originalFiles[0];r.roles.sort(codeOrder);return r;}).sort((a,b)=>codeOrder(a.sha256,b.sha256));
 const manifest={version:'arch-source-deployment/1',records,totalUniqueBytes:records.reduce((n,r)=>n+r.bytes,0),sourceFileCount:files.size};
 const config=materializeSourceLibrary({catalog,manifest,origin:'https://library.invalid'});
 read('src/integration/source-catalog.mjs');read('src/input/source-contract.mjs');
 const {createSourceCatalog}=await import(pathToFileURL(path.join(root,'src/integration/source-catalog.mjs')));const checked=createSourceCatalog(config);
 for(const c of catalogs){let total=0;for(let offset=0;offset<c.items.length+c.components.length;offset+=64)total+=checked.queryEmoji('',c.id,offset).entries.length;if(total!==c.items.length+c.components.length)throw Error('Runtime query coverage');}
 const artwork={version:'arch-source-artwork-library/1',source:{catalog:'src/assets/emoji/color/artwork-cat.json',sha256:inputs.get('src/assets/emoji/color/artwork-cat.json').sha256},items:art.items.map(i=>{const file='src/assets/emoji/color/'+i.path,r=assets.get(i.sha256),licenseFile='src/assets/emoji/color/'+i.licensePath,license=assets.get(files.get(licenseFile));if(!r?.originalFiles.includes(file)||!license)throw Error('Artwork source/license');return {...i,kind:'original-artwork',file,bytes:r.bytes,license:{file:licenseFile,sha256:license.sha256,bytes:license.bytes},selection:{status:'separate-artwork-adapter-required',reason:'Not an emoji token catalog; source SVG features/embedded content remain explicit'}};})};
 for(const [name,v]of [['catalog.json',catalog],['deployment.json',manifest],['artwork.json',artwork],['search/labels.json',labelData]])writeJSON(run,path.join(dest,name),v);
 // Independent post-build rehash detects parent input edits during native processing.
 for(const [rel,record]of inputs){const b=fs.readFileSync(safe(root,path.join(root,rel)));if(b.length!==record.bytes||sha256(b)!==record.sha256)throw Error('Original changed during build '+rel);}
 const generatorFiles=['build.mjs','render.py','common.mjs','toolchain-lock.json'].map(file=>({file:'tools/assets/source-library/'+file,sha256:sha256(fs.readFileSync(path.join(HERE,file)))}));
 generatorFiles.push({file:'src/integration/source-library.mjs',sha256:sha256(fs.readFileSync(path.resolve(HERE,'../../../src/integration/source-library.mjs')))});
 const receipt={version:'arch-source-library-build/1',generatorFiles,nativeToolsSha256:sha256(fs.readFileSync(path.join(HERE,'toolchain-lock.json'))),sourceLocks:locks.map(([p])=>inputs.get(p)),cldrCommit:cldr.commit,counts:{fonts:fonts.length,collections:catalogs.length,items:catalogs.reduce((n,c)=>n+c.items.length,0),components:catalogs.reduce((n,c)=>n+c.components.length,0),aliasesPerCollection:aliases.items.length,previews:mappings.length,uniqueMonoPNGs:new Set(previews.items.map(p=>p.sha256)).size,translated:labels.length,missingLabels:missing.length,artwork:artwork.items.length,originalsChecked:originals.length,deployRecords:records.length},inputs:[...inputs.values()].sort((a,b)=>codeOrder(a.file,b.file)),outputs:['catalog.json','deployment.json','artwork.json','mono-thumbnails.json','font-coverage.json','search/labels.json'].map(file=>{const b=fs.readFileSync(path.join(dest,file));return {file:PREFIX+'/'+file,bytes:b.length,sha256:sha256(b)};})};
 writeJSON(run,path.join(dest,'build-receipt.json'),receipt);console.log(JSON.stringify(receipt.counts));return {catalog,manifest,artwork,receipt};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=cliArgs(['--output','--python']);if(!a['--output'])throw Error('--output <own candidate root> required');await buildSourceLibrary({output:a['--output'],python:a['--python']});}