/** Pure build-config materialization. No I/O, runtime loader or WASM instance. */
export class SourceLibraryError extends Error{constructor(code){super(code);this.name='SourceLibraryError';this.code=code;}}
const need=(v,c)=>{if(!v)throw new SourceLibraryError(c);};
export function checkedLibraryPath(value){
 need(typeof value==='string'&&value.length>0&&value.length<=1024&&value.normalize('NFC')===value,'LIBRARY_PATH');
 need(!/[\\:%?#\u0000-\u001f\u007f<>"|*]/u.test(value)&&!value.startsWith('/')&&!value.endsWith('/'),'LIBRARY_PATH');
 need(value.split('/').every(s=>s!=='.'&&s!=='..'&&s&&s.trim()===s&&!/[. ]$/.test(s)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)),'LIBRARY_PATH');return value;
}
const sha=v=>{need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'LIBRARY_HASH');return v;};
const bytes=v=>{need(Number.isSafeInteger(v)&&v>0&&v<=16000000,'LIBRARY_BYTES');return v;};
export function materializeSourceLibrary({catalog,manifest,origin,basePath='/'}){
 let base;try{base=new URL(origin);}catch{throw new SourceLibraryError('LIBRARY_ORIGIN');}
 need(base.origin===origin&&['https:','http:'].includes(base.protocol)&&!base.username&&!base.password,'LIBRARY_ORIGIN');
 need(typeof basePath==='string'&&basePath.startsWith('/')&&basePath.endsWith('/'),'LIBRARY_BASE_PATH');
 if(basePath!=='/')checkedLibraryPath(basePath.slice(1,-1));
 need(manifest?.version==='arch-source-deployment/1'&&Array.isArray(manifest.records)&&manifest.records.length<=65536,'LIBRARY_MANIFEST');
 need(Number.isSafeInteger(manifest.sourceFileCount)&&manifest.sourceFileCount>0&&manifest.sourceFileCount<=65536,'LIBRARY_SOURCE_LIMIT');
 const hashes=new Map(),paths=new Set(),sourcePaths=new Set(),urls=new Set(),assetURLs=[];let total=0;
 for(const r of manifest.records){
  sha(r.sha256);bytes(r.bytes);checkedLibraryPath(r.file);checkedLibraryPath(r.url);
  need(['image/png','image/svg+xml','font/ttf','application/json','text/plain'].includes(r.mediaType),'LIBRARY_MEDIA_TYPE');
  need(r.url==='source-assets/'+r.sha256+({'image/png':'.png','image/svg+xml':'.svg','font/ttf':'.ttf','application/json':'.json','text/plain':'.txt'}[r.mediaType]),'LIBRARY_URL');
  need(!hashes.has(r.sha256)&&!paths.has(r.file)&&!urls.has(r.url),'LIBRARY_DUPLICATE');
  need(Array.isArray(r.originalFiles)&&r.originalFiles.length>0&&r.originalFiles.length<=65536,'LIBRARY_ORIGINAL_FILES');
  for(const file of r.originalFiles){checkedLibraryPath(file);need(!sourcePaths.has(file),'LIBRARY_DUPLICATE_SOURCE');sourcePaths.add(file);need(sourcePaths.size<=manifest.sourceFileCount,'LIBRARY_SOURCE_LIMIT');}total+=r.bytes;
  need(r.originalFiles.includes(r.file)&&new Set(r.originalFiles).size===r.originalFiles.length,'LIBRARY_ORIGINAL_FILES');
  const url=new URL(basePath+r.url,origin);need(url.origin===origin&&url.pathname===basePath+r.url&&!url.search&&!url.hash,'LIBRARY_URL');
  hashes.set(r.sha256,r);paths.add(r.file);urls.add(r.url);assetURLs.push({sha256:r.sha256,bytes:r.bytes,mediaType:r.mediaType,url:url.href});
 }
 need(Number.isSafeInteger(manifest.totalUniqueBytes)&&manifest.totalUniqueBytes===total&&total<=536870912&&manifest.sourceFileCount===sourcePaths.size,'LIBRARY_TOTAL_BUDGET');
 need(catalog?.version==='arch-source-catalog/1'&&Array.isArray(catalog.fonts)&&catalog.fonts.length<=256&&Array.isArray(catalog.collections)&&catalog.collections.length<=16,'LIBRARY_CATALOG');
 const ref=(v,type)=>{const found=hashes.get(sha(v.sha256));need(found&&(v.bytes===undefined||found.bytes===bytes(v.bytes))&&(!type||found.mediaType===type),'LIBRARY_REFERENCE');};
 const fonts=new Map();for(const f of catalog.fonts){need(!fonts.has(f.id),'LIBRARY_FONT_DUPLICATE');fonts.set(f.id,f);ref(f,'font/ttf');if(f.license?.asset)ref(f.license.asset,'text/plain');}
 need(fonts.has(catalog.defaultFontId),'LIBRARY_DEFAULT_FONT');
 const keys=new Set(),collections=new Set();let count=0;
 for(const c of catalog.collections){
  need(typeof c.id==='string'&&!collections.has(c.id)&&Array.isArray(c.items)&&Array.isArray(c.components)&&count+c.items.length+c.components.length<=32768,'LIBRARY_COLLECTION');collections.add(c.id);
  need(['outline','COLRv1','CBDT/CBLC','svg'].includes(c.selection?.kind),'LIBRARY_SELECTION');
  if(c.selection.kind!=='svg')need(fonts.has(c.selection.fontId),'LIBRARY_SELECTION');
  for(const i of [...c.items,...c.components]){const key=c.id+'/'+i.id;need(!keys.has(key)&&typeof i.emoji==='string'&&i.emoji.length>0,'LIBRARY_ITEM');keys.add(key);count++;
   for(const v of i.vectors??[])ref(v,'image/svg+xml');for(const v of i.rasters??[])ref(v,'image/png');
  }
 }
 need(count<=32768&&collections.has(catalog.defaultCollectionId),'LIBRARY_CATALOG_LIMIT');
 need(Array.isArray(catalog.previews)&&catalog.previews.length===keys.size,'LIBRARY_PREVIEW_COVERAGE');
 const previews=new Set();for(const p of catalog.previews){const k=p.collectionId+'/'+p.itemId;need(keys.has(k)&&!previews.has(k),'LIBRARY_PREVIEW_COVERAGE');previews.add(k);ref(p,'image/png');}
 return {catalog:structuredClone(catalog),assetURLs,origin};
}