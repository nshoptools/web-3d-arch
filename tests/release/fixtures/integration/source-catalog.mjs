import {SourceError,ownedBytes,hash,fontEntry,sha,finite} from '../input/source-contract.mjs';

export const CATALOG_VERSION='arch-source-catalog/1';
export const APP_VERSION='arch-app-adapters/1';
export const fail=(code,message=code,details={})=>{throw new SourceError(code,message,details);};
export const copy=value=>structuredClone(value);
export const requireValue=(ok,code)=>{if(!ok)fail(code);};
export const fold=value=>String(value).normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase();
const text=(v,max,code)=>{requireValue(typeof v==='string'&&v.length<=max,code);return v;};
const safeId=v=>{text(v,160,'CATALOG_ID');requireValue(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(v),'CATALOG_ID');return v;};
export function checkedTicket(v){
  requireValue(v&&Object.keys(v).length===5,'APP_TICKET');
  for(const k of ['id','userId','projectId'])safeId(v[k]);
  for(const k of ['revision','generation'])finite(v[k],0,Number.MAX_SAFE_INTEGER-1,'ticket '+k,true);
  return copy(v);
}
/** Controller-allocated adoption identity; source owners never generate one. */
export function checkedSourceContext(value,state,operation){
 requireValue(value&&Object.keys(value).length===5,'SOURCE_CONTEXT_REQUIRED');const c=copy(value);
 requireValue(c.version==='arch-source-context/1'&&c.operation===operation&&Number.isSafeInteger(c.revision)&&c.revision>=0,'SOURCE_CONTEXT');
 safeId(c.id);const previous=state?.content?.app?.source;
 if(previous){
  requireValue(c.predecessor&&Object.keys(c.predecessor).length===3,'SOURCE_CONTEXT_PREDECESSOR');
  requireValue(c.predecessor.id===previous.id&&c.predecessor.revision===previous.revision&&c.predecessor.rawHash===previous.raw?.hash,'SOURCE_CONTEXT_PREDECESSOR');
  safeId(c.predecessor.id);finite(c.predecessor.revision,0,Number.MAX_SAFE_INTEGER-1,'source predecessor revision',true);sha(c.predecessor.rawHash);
  if(operation==='convert')requireValue(c.id===previous.id&&c.revision===previous.revision+1,'SOURCE_CONTEXT_SUCCESSOR');
  else requireValue(c.id!==previous.id&&c.revision===0,'SOURCE_CONTEXT_REPLACEMENT');
 }else requireValue(c.predecessor===null&&operation==='import'&&c.revision===0,'SOURCE_CONTEXT_PREDECESSOR');
 return c;
}

export const sameTicket=(a,b)=>!!a&&!!b&&['id','userId','projectId','revision','generation'].every(k=>a[k]===b[k]);
export function checkControl(control){
  requireValue(control?.version===APP_VERSION,'ADAPTER_VERSION');checkedTicket(control.ticket);
  requireValue(control.signal&&typeof control.signal.addEventListener==='function','ADAPTER_SIGNAL');
  if(control.signal.aborted)fail('CANCELLED');
}
export function checkedAssetURLs(assetURLs,origin){
  const base=new URL(origin);requireValue(base.origin===origin&&['https:','http:'].includes(base.protocol),'ASSET_ORIGIN');
  requireValue(Array.isArray(assetURLs)&&assetURLs.length<=65536,'ASSET_MANIFEST_LIMIT');
  const records=new Map(),urls=new Set();
  for(const input of assetURLs){
    const r=copy(input);sha(r.sha256);finite(r.bytes,1,16000000,'asset bytes',true);
    text(r.url,2048,'ASSET_URL');text(r.mediaType,128,'ASSET_MEDIA_TYPE');
    const u=new URL(r.url);
    requireValue(u.origin===origin&&!u.username&&!u.password&&!u.search&&!u.hash&&u.href===r.url,'ASSET_URL');
    requireValue(!records.has(r.sha256)&&!urls.has(r.url),'ASSET_MAPPING_DUPLICATE');
    records.set(r.sha256,Object.freeze(r));urls.add(r.url);
  }
  return records;
}
/** Host-provided original catalogs + exact deployed mapping. Queries never fetch or create preview URLs.
 * @param {{catalog:import('../../docs/text-app/API.mjs').SourceCatalogRecord,assetURLs:import('../../docs/text-app/API.mjs').AssetURL[],origin:string}} options
 * @returns {import('../../docs/text-app/API.mjs').Catalog}
 */
export function createSourceCatalog({catalog,assetURLs,origin}){
  requireValue(catalog?.version===CATALOG_VERSION,'CATALOG_VERSION');
  requireValue(Array.isArray(catalog.fonts)&&catalog.fonts.length<=256&&Array.isArray(catalog.collections)&&catalog.collections.length<=16,'CATALOG_LIMIT');
  const mapped=checkedAssetURLs(assetURLs,origin),fonts=new Map(),imported=new Map(),collections=new Map(),previews=new Map(),labels=new Map();
  for(const value of catalog.fonts){const entry=fontEntry(value);requireValue(!fonts.has(entry.id),'FONT_ID_DUPLICATE');fonts.set(entry.id,entry);}
  if(catalog.labels){
    requireValue(typeof catalog.labels.version==='string'&&typeof catalog.labels.source==='string'&&Array.isArray(catalog.labels.entries)&&catalog.labels.entries.length<=16384,'SEARCH_LABEL_PROVENANCE');
    for(const value of catalog.labels.entries)labels.set(value.collectionId+'/'+value.itemId,copy(value));
  }
  requireValue(Array.isArray(catalog.previews)&&catalog.previews.length<=32768,'CATALOG_PREVIEWS');
  for(const p of catalog.previews){
    const asset=mapped.get(sha(p.sha256));requireValue(asset?.mediaType==='image/png','PREVIEW_MAPPING_REQUIRED');
    const key=safeId(p.collectionId)+'/'+safeId(p.itemId);requireValue(!previews.has(key),'PREVIEW_DUPLICATE');
    requireValue(typeof p.sourceKind==='string'&&p.sourceKind.length<=128,'PREVIEW_SOURCE_REQUIRED');previews.set(key,copy(p));
  }
  let itemCount=0;
  for(const original of catalog.collections){
    const c=copy(original);safeId(c.id);requireValue(!collections.has(c.id)&&['color','monochrome'].includes(c.style),'COLLECTION_INVALID');
    requireValue(Array.isArray(c.items)&&Array.isArray(c.components??[])&&(itemCount+=c.items.length+(c.components?.length??0))<=32768,'COLLECTION_LIMIT');
    const items=new Map(),forms=new Map(),indexed=[];
    for(const item of [...c.items,...(c.components??[])]){
      safeId(item.id);text(item.emoji,128,'EMOJI_TOKEN');requireValue(!items.has(item.id),'EMOJI_ID_DUPLICATE');
      const label=labels.get(c.id+'/'+item.id),p=previews.get(c.id+'/'+item.id);
      const words=[item.id,item.emoji,item.name,item.group,item.subgroup,...(item.codepoints??[]),label?.vi,...(label?.keywords??[])].filter(v=>v!==undefined);
      requireValue(words.every(v=>typeof v==='string'&&v.length<=2048),'SEARCH_TEXT_LIMIT');
      const row={item,search:fold(words.join(' ')),label:label?.vi??item.name??item.emoji,preview:p};
      items.set(item.id,row);forms.set(item.emoji,item.id);indexed.push(row);
    }
    for(const a of c.aliases??[])if(items.has(a.canonicalId)){forms.set(a.emoji,a.canonicalId);items.get(a.canonicalId).search+=' '+fold(a.emoji);}
    requireValue(['outline','COLRv1','CBDT/CBLC','svg'].includes(c.selection?.kind),'COLLECTION_SELECTION_REQUIRED');
    if(c.selection.kind!=='svg'){
      const f=fonts.get(c.selection.fontId);requireValue(f&&((c.selection.kind==='outline'&&!f.color)||(f.colorFormat===c.selection.kind)),'COLLECTION_FONT');
      requireValue(c.style==='color'||c.selection.kind==='outline','COLLECTION_SOURCE_MISMATCH');
    }
    collections.set(c.id,{original:c,items,forms,indexed});
  }
  const defaultFontId=safeId(catalog.defaultFontId),defaultCollectionId=safeId(catalog.defaultCollectionId);
  requireValue(fonts.has(defaultFontId)&&!fonts.get(defaultFontId).color&&collections.has(defaultCollectionId),'CATALOG_DEFAULT');
  function getFont(id=defaultFontId){const entry=fonts.get(id)||imported.get(id);requireValue(entry,'FONT_NOT_FOUND');return copy(entry);}
  function getEmoji(id,collectionId=defaultCollectionId){
    const c=collections.get(collectionId);requireValue(c,'UNKNOWN_COLLECTION');
    const row=c.items.get(id)??c.items.get(c.forms.get(id));requireValue(row,'UNKNOWN_EMOJI');
    const selection=c.original.selection;let source;
    if(selection.kind==='svg'){
      finite(selection.svgIndex??0,0,16,'SVG index',true);
      const v=row.item.vectors?.[selection.svgIndex??0];requireValue(v,'EMOJI_SVG_UNAVAILABLE');
      const asset=mapped.get(v.sha256);requireValue(asset&&asset.mediaType==='image/svg+xml','ASSET_MAPPING_REQUIRED');
      source={kind:'svg',asset:{...copy(v),bytes:asset.bytes}};
    }else source={kind:selection.kind,font:getFont(selection.fontId)};
    return {collectionId,item:copy(row.item),text:c.forms.has(id)?id:row.item.emoji,source,preview:copy(row.preview??null)};
  }
  return Object.freeze({
    origin,defaultFontId,defaultCollectionId,
    sourceCollections:()=>[...collections.values()].map(c=>copy(c.original)),
    asset(hashValue){const r=mapped.get(sha(hashValue));requireValue(r,'ASSET_MAPPING_REQUIRED');return copy(r);},
    font:getFont,emoji:getEmoji,
    queryFonts(query=''){
      text(query,256,'QUERY_LIMIT');const q=fold(query);
      return [...fonts.values(),...imported.values()].filter(f=>!f.color&&fold([f.id,f.family,f.name,f.style,f.weight].join(' ')).includes(q))
        .sort((a,b)=>{const x=[a.family,a.style,a.id].join('/'),y=[b.family,b.style,b.id].join('/');return x<y?-1:x>y?1:0;})
        .map(f=>({id:f.id,label:f.name??f.family??f.id,style:String(f.style??'normal'),family:f.family??f.name??f.id}));
    },
    queryEmoji(query='',collectionId=defaultCollectionId,offset=0){
      text(query,256,'QUERY_LIMIT');finite(offset,0,32768,'emoji offset',true);const c=collections.get(collectionId);requireValue(c,'UNKNOWN_COLLECTION');
      const q=fold(query),rows=c.indexed.filter(r=>r.search.includes(q)),entries=rows.slice(offset,offset+64).map(r=>{
        requireValue(r.preview,'PREVIEW_MAPPING_REQUIRED');
        return {id:r.item.id,text:r.item.emoji,label:r.label,collectionId,previewUrl:mapped.get(r.preview.sha256).url,verdict:'unverified'};
      });
      return {entries,total:rows.length,collections:[...collections.values()].map(c=>({id:c.original.id,label:c.original.name??c.original.id}))};
    },
    registerImported(record){
      const r=fontEntry(record);requireValue(r.id==='imported:'+r.sha256&&!r.color,'IMPORTED_FONT_RECORD');
      requireValue(imported.has(r.id)||imported.size<128,'IMPORTED_FONT_LIMIT');
      const old=imported.get(r.id);if(old)requireValue(old.sha256===r.sha256&&old.bytes===r.bytes,'IMPORTED_FONT_RECORD');
      imported.set(r.id,r);return copy(r);
    },
    reset(){imported.clear();},
    snapshot(){return {catalog:copy(catalog),assetURLs:[...mapped.values()].map(copy),origin};},
  });
}
/** Explicit HTTP adapter for deployed assets. Retained project bytes take precedence and are still rehashed. */
export function createAssetReader({assetURLs,origin,fetchImpl}){
  const mapped=checkedAssetURLs(assetURLs,origin);
  return async function readBytes(ref,{signal,assetsMap=new Map()}={}){
    sha(ref.sha256);finite(ref.bytes,1,16000000,'source bytes',true);
    if(signal?.aborted)fail('CANCELLED');let bytes;
    if(assetsMap.has(ref.sha256))bytes=ownedBytes(assetsMap.get(ref.sha256),16000000);
    else{
      const asset=mapped.get(ref.sha256);requireValue(asset&&asset.bytes===ref.bytes,'ASSET_MAPPING_REQUIRED');requireValue(typeof fetchImpl==='function','ASSET_FETCH_UNAVAILABLE');
      const response=await fetchImpl(asset.url,{signal,method:'GET',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});
      requireValue(response.ok&&!response.redirected&&(!response.url||response.url===asset.url),'ASSET_HTTP');
      const length=response.headers?.get('content-length');if(length!==null&&length!==undefined)requireValue(Number(length)===ref.bytes,'ASSET_LENGTH');
      requireValue(response.body&&typeof response.body.getReader==='function','ASSET_STREAM_REQUIRED');
      const reader=response.body.getReader(),chunks=[];let total=0;
      try{
        for(;;){if(signal?.aborted)fail('CANCELLED');const {done,value}=await reader.read();if(done)break;
          total+=value.byteLength;requireValue(total<=ref.bytes,'ASSET_LENGTH');chunks.push(new Uint8Array(value));
        }
      }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
      requireValue(total===ref.bytes,'ASSET_LENGTH');bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    }
    if(signal?.aborted)fail('CANCELLED');
    requireValue(bytes.length===ref.bytes&&await hash(bytes)===ref.sha256,'HASH_MISMATCH');
    if(signal?.aborted)fail('CANCELLED');return bytes;
  };
}
