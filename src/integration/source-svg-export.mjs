import {canonicalJSON,cloneJSON,sha256} from '../storage/common.mjs';
import {domainStateFingerprint} from '../storage/history.mjs';
import {sourceGeometry,rasterSourceGeometry} from './product-source-contexts.mjs';
import {deriveProductIdentities} from './product-adapters.mjs';
import {validateProductMaterialExtension} from '../contracts/product-material.mjs';
import {validatePacket,readableSummary} from '../core/raster-schema.mjs';
import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {parseXml} from '../printing/src/zip-inspect.mjs';
import {XMLSerializer} from '@xmldom/xmldom';

export const SOURCE_SVG_VERSION='arch-source-svg-export/1';
export const SOURCE_SVG_LIMITS=Object.freeze({dependencies:256,dependencyBytes:64*1024*1024,sourceBytes:1048576,outputBytes:16*1024*1024,jsonBytes:2*1024*1024,nodes:100000,depth:24,regions:256,points:200000,leases:4});
const APP='arch-app-adapters/1',HASH=/^[a-f0-9]{64}$/,enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true}),NS='http://www.w3.org/2000/svg';
const reasons={
 SOURCE_SVG_NO_SOURCE:'Commit an SVG, text, emoji or accepted raster source before exporting SVG.',
 SOURCE_SVG_REFRESH_REQUIRED:'Revalidate the current committed source after import, restore or source/material changes.',
 SOURCE_SVG_STALE:'Source, dependencies, project or account changed. Discard this result and refresh the current source.',
 SOURCE_SVG_CANCELLED:'Source SVG preparation was cancelled. No new snapshot was published.',
 SOURCE_SVG_RESET:'The private source snapshot was reset. Refresh in the current account and project.',
 SOURCE_SVG_BINDINGS:'Supply the existing kernel and source services with the current authorized context getter.',
 SOURCE_SVG_REGIONS_REQUIRED:'Complete source-region adoption or the explicit source conversion before SVG export.',
 SOURCE_SVG_REGION_CHANGED:'Committed region bindings do not match revalidated source geometry. Recapture/rebind the source atomically.',
 SOURCE_SVG_DERIVED_CHANGED:'Stored derived geometry, dimensions or source provenance disagree with fresh native source proof. Recapture the committed source from its retained originals.',
 SOURCE_SVG_MATERIAL:'Resolve the explicit full material ID/source-region mapping before exporting.',
 SOURCE_SVG_IDENTITY:'Source/material identities are ambiguous or their full provenance ledger has changed.',
 SOURCE_SVG_ASSET_HASH:'Restore the exact referenced source/dependency bytes; their hash or length changed.',
 SOURCE_SVG_LIMIT:'Source export exceeds bounded metadata, dependency, region or output limits.',
 SOURCE_SVG_DATA:'Supply bounded finite plain JSON and owned byte arrays.',
 SOURCE_SVG_ACTIVE_CONTENT:'Active, external or embedded executable SVG content is unavailable. Use the validated source import/conversion route.',
 SOURCE_SVG_OPTIONS:'Use the committed-source units, side and color policy.',
 SOURCE_SVG_RUNTIME:'The current same-runtime source service is unavailable or was retired.',
};
export class SourceSVGError extends Error{constructor(code){super(reasons[code]??('Source SVG validation failed ('+code+'). Correct or recapture the current source.'));this.name='SourceSVGError';this.code=code;}}
const need=(v,c)=>{if(!v)throw new SourceSVGError(c);},same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const ident=s=>typeof s==='string'&&s.length>0&&s.length<=512&&s.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(s);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function data(value){
 let count=0,text=0;const active=new Set();
 function visit(x,d){
  need(d<=SOURCE_SVG_LIMITS.depth&&++count<=SOURCE_SVG_LIMITS.nodes,'SOURCE_SVG_LIMIT');
  if(typeof x==='string'){need(x.isWellFormed(),'SOURCE_SVG_DATA');text+=x.length;need(text<=SOURCE_SVG_LIMITS.jsonBytes,'SOURCE_SVG_LIMIT');return;}
  if(x===null||typeof x==='boolean')return;if(typeof x==='number'){need(Number.isFinite(x),'SOURCE_SVG_DATA');return;}
  need(x&&typeof x==='object'&&!active.has(x)&&(Array.isArray(x)||[Object.prototype,null].includes(Object.getPrototypeOf(x))),'SOURCE_SVG_DATA');
  const keys=Reflect.ownKeys(x);need(keys.length<=SOURCE_SVG_LIMITS.nodes,'SOURCE_SVG_LIMIT');if(Array.isArray(x))need(keys.length===x.length+1,'SOURCE_SVG_DATA');
  active.add(x);for(const k of keys){if(Array.isArray(x)&&k==='length')continue;need(typeof k==='string'&&!['__proto__','prototype','constructor'].includes(k),'SOURCE_SVG_DATA');if(Array.isArray(x))need(/^(0|[1-9]\d*)$/.test(k)&&Number(k)<x.length,'SOURCE_SVG_DATA');const p=Object.getOwnPropertyDescriptor(x,k);need(p?.enumerable&&'value'in p,'SOURCE_SVG_DATA');text+=k.length;visit(p.value,d+1);}active.delete(x);
 }
 visit(value,0);need(enc.encode(canonicalJSON(value)).length<=SOURCE_SVG_LIMITS.jsonBytes,'SOURCE_SVG_LIMIT');return cloneJSON(value);
}
const bytes=(v,max=SOURCE_SVG_LIMITS.dependencyBytes)=>{need(v instanceof Uint8Array&&v.buffer instanceof ArrayBuffer&&v.length<=max,'SOURCE_SVG_DATA');return new Uint8Array(v);};
function byteEqual(a,b){
 if(!(a instanceof Uint8Array)||!(a.buffer instanceof ArrayBuffer)||a.length!==b.length)return false;
 // Exact word comparison avoids one JS callback per byte on every synchronous cache guard.
 let i=0;if(a.byteOffset%4===0&&b.byteOffset%4===0){const n=Math.floor(a.length/4),aa=new Uint32Array(a.buffer,a.byteOffset,n),bb=new Uint32Array(b.buffer,b.byteOffset,n);for(let j=0;j<n;j++)if(aa[j]!==bb[j])return false;i=n*4;}
 for(;i<a.length;i++)if(a[i]!==b[i])return false;return true;
}
function control(c){need(c?.version===APP&&c.ticket&&typeof c.signal?.addEventListener==='function'&&typeof c.onProgress==='function','SOURCE_SVG_DATA');need(!c.signal.aborted,'SOURCE_SVG_CANCELLED');for(const k of ['id','userId','projectId'])need(ident(c.ticket[k]),'SOURCE_SVG_DATA');for(const k of ['revision','generation'])need(Number.isSafeInteger(c.ticket[k])&&c.ticket[k]>=0,'SOURCE_SVG_DATA');}
function safeSVG(b){
 need(b.length>0&&b.length<=SOURCE_SVG_LIMITS.outputBytes,'SOURCE_SVG_LIMIT');const doc=parseXml(b),root=doc.documentElement;
 need(root.namespaceURI===NS&&root.localName==='svg','SOURCE_SVG_DATA');let n=0;const stack=[[root,0]];
 while(stack.length){const [v,d]=stack.pop();need(++n<=8192&&d<=32,'SOURCE_SVG_LIMIT');
  need(v.namespaceURI===NS&&!['script','foreignObject','animate','animateMotion','animateTransform','set','iframe','image','text','tspan','textPath'].includes(v.localName),'SOURCE_SVG_ACTIVE_CONTENT');
  for(const a of Array.from(v.attributes??[])){if(a.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;need(!/^on/i.test(a.name)&&!/@import|(?:javascript|https?|file|data):/i.test(a.value),'SOURCE_SVG_ACTIVE_CONTENT');if(a.localName==='href')need(a.value.startsWith('#'),'SOURCE_SVG_ACTIVE_CONTENT');for(const m of a.value.matchAll(/url\s*\(\s*['"]?([^)'"\s]+)/gi))need(m[1].startsWith('#'),'SOURCE_SVG_ACTIVE_CONTENT');}
  if(v.localName==='style'){need(!/@import|(?:javascript|https?|file|data):/i.test(v.textContent),'SOURCE_SVG_ACTIVE_CONTENT');for(const m of v.textContent.matchAll(/url\s*\(\s*['"]?([^)'"\s]+)/gi))need(m[1].startsWith('#'),'SOURCE_SVG_ACTIVE_CONTENT');}
  for(const child of Array.from(v.childNodes??[]))if(child.nodeType===1)stack.push([child,d+1]);
 }
 return doc;
}
const nm=n=>{const sign=n<0n?'-':'',a=n<0n?-n:n,whole=a/1000000n,tail=String(a%1000000n).padStart(6,'0').replace(/0+$/,'');return sign+whole+(tail?'.'+tail:'');};
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function snapshotRings(b){
 const s=readArchSnapshot(b),v=new DataView(b.buffer,b.byteOffset,b.byteLength),u=o=>v.getUint32(o,true),out=new Map(),pa=u(60),ca=u(64),ia=u(68);let count=0;
 for(const p of s.parts){const rings=[];for(let c=p.contourStart;c<p.contourStart+p.contourCount;c++){const at=ca+c*16,start=u(at),n=u(at+4);const r=[];for(let i=0;i<n;i++){const index=u(ia+4*(start+i));r.push([v.getBigInt64(pa+16*index,true),v.getBigInt64(pa+16*index+8,true)]);}count+=n;need(count<=SOURCE_SVG_LIMITS.points,'SOURCE_SVG_LIMIT');rings.push(r);}out.set(p.sourceIndex,rings);}return out;
}
function packetRings(packet){
 const b=new Map(packet.buffers.map(r=>[r.kind,r.bytes])),dv=k=>new DataView(b.get(k).buffer,b.get(k).byteOffset,b.get(k).byteLength),l=dv(13),i=dv(14),p=dv(28),out=new Map();let count=0;
 for(let o=0;o<l.byteLength;o+=16){const start=l.getUint32(o,true),size=l.getUint32(o+4,true),region=l.getUint32(o+8,true),r=[];for(let k=0;k<size-1;k++){const at=i.getUint32(4*(start+k),true)*16;r.push([p.getBigInt64(at,true),p.getBigInt64(at+8,true)]);}count+=r.length;need(count<=SOURCE_SVG_LIMITS.points,'SOURCE_SVG_LIMIT');const key='raster-region:'+region;if(!out.has(key))out.set(key,[]);out.get(key).push(r);}return out;
}
/** Checked serialization framing only; matches existing captured manufacturingTextSVG.
 * No shaping/path grammar/boolean is reimplemented. Fresh producer bytes are mandatory. */
async function textFrame(svg,exportFrame,stored,overlay){
 safeSVG(svg);const text=dec.decode(svg),m=/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="([^"]+)mm" height="([^"]+)mm" viewBox="([^"]+)">/.exec(text);
 need(m&&text.endsWith('</svg>')&&exportFrame?.status==='ready','SOURCE_SVG_DERIVED_CHANGED');const w=Number(m[1]),h=Number(m[2]),box=m[3].split(' ').map(Number),restore=exportFrame.parserViewportToSourceMm;
 need(w>0&&h>0&&w<=10000&&h<=10000&&box.length===4&&box.every(Number.isFinite)&&box[2]===w&&box[3]===h&&same(restore,[1,0,0,-1,box[0],-box[1]]),'SOURCE_SVG_DERIVED_CHANGED');
 const t=overlay?restore:[1,0,0,-1,0,h],width=t[4]+w+1,height=t[5]+1,combined=[1,0,0,-1,t[4]-box[0],t[5]+box[1]];
 need(t[4]>=0&&t[5]-h>=0&&width<=10000&&height<=10000,'SOURCE_SVG_DERIVED_CHANGED');
 const body=text.slice(m[0].length,-6),framed=enc.encode('<svg xmlns="'+NS+'" width="'+width+'mm" height="'+height+'mm" viewBox="0 0 '+width+' '+height+'"><g transform="matrix('+combined.join(' ')+')">'+body+'</g></svg>');
 const payload={version:'arch-text-manufacturing-frame/1',originalNumericSvgHash:await sha256(svg),transform:t,mode:overlay?'absolute-overlay':'source-art-normalized-origin',originalFrame:restore,sourceGeometryChanged:false,totalErrorBoundMm:null};
 const frame={...payload,sha256:await sha256(framed),derivationHash:await sha256(canonicalJSON(payload))};need(same(frame,stored),'SOURCE_SVG_DERIVED_CHANGED');
 return {bytes:framed,original:svg,frame,box,body,outputMatrix:[1,0,0,-1,box[0],box[1]+h]};
}
function regionDocument(rows,frame,provenance){
 let s='<svg xmlns="'+NS+'" width="'+frame.width+'mm" height="'+frame.height+'mm" viewBox="'+frame.box.join(' ')+'" data-scope="committed-source-regions"><metadata>'+xml(canonicalJSON(provenance))+'</metadata>';
 for(const row of rows){if(row.material.excluded)continue;let d='';
  for(const ring of row.rings){need(ring.length>=3,'SOURCE_SVG_DATA');d+='M'+nm(ring[0][0])+' '+nm(ring[0][1]);for(let i=1;i<ring.length;i++)d+='L'+nm(ring[i][0])+' '+nm(ring[i][1]);d+='Z';}
  s+='<path data-source-key="'+xml(row.binding.sourceKey)+'" data-material-id="'+xml(row.material.id)+'" fill="'+row.material.color+'" fill-rule="nonzero" transform="matrix('+row.matrix.join(' ')+')" d="'+d+'"/>';
  need(s.length<=SOURCE_SVG_LIMITS.outputBytes,'SOURCE_SVG_LIMIT');
 }
 return enc.encode(s+'</svg>');
}
/** Source-only private cache over the caller's existing same-Module services. */
export function createSourceSVGExport({context,kernel,sources}={}){
 need(typeof context==='function'&&typeof kernel?.operation==='function'&&typeof kernel.ensureRuntime==='function'&&typeof sources?.text?.prepareSource==='function'&&typeof sources?.text?.prepareText==='function'&&typeof sources?.raster?.prepareRecipe==='function','SOURCE_SVG_BINDINGS');
 let epoch=0,serial=0,cache=null,disposed=false;const leases=new Set();
 function capture(){
  need(!disposed,'SOURCE_SVG_RESET');const c=context();need(c&&ident(c.userId)&&ident(c.projectId)&&c.sessionKey!==undefined&&c.sessionKey!==null&&HASH.test(c.headHash),'SOURCE_SVG_STALE');
  const state=data(c.state),source=state.content?.app?.source;
  need(source&&['svg','text','emoji','raster'].includes(source.kind)&&state.sourceKind===source.kind,'SOURCE_SVG_NO_SOURCE');
  need(ident(source.id)&&Number.isSafeInteger(source.revision)&&source.revision>=0&&HASH.test(source.raw?.hash)&&source.raw.byteLength>0&&Number.isSafeInteger(source.raw.byteLength),'SOURCE_SVG_DATA');
  need(source.metadata?.sourceContext?.version==='arch-source-context/1'&&source.metadata.sourceContext.id===source.id&&source.metadata.sourceContext.revision===source.revision,'SOURCE_SVG_STALE');
  need(c.assetsMap instanceof Map&&Array.isArray(source.assetHashes)&&source.assetHashes.length<=SOURCE_SVG_LIMITS.dependencies,'SOURCE_SVG_LIMIT');
  const refs=new Set(source.assetHashes);need(refs.size===source.assetHashes.length&&refs.has(source.raw.hash),'SOURCE_SVG_DATA');
  const assets=new Map();let total=0;for(const h of refs){need(HASH.test(h),'SOURCE_SVG_DATA');const a=bytes(c.assetsMap.get(h));total+=a.length;need(total<=SOURCE_SVG_LIMITS.dependencyBytes,'SOURCE_SVG_LIMIT');assets.set(h,a);}
  need(assets.get(source.raw.hash).length===source.raw.byteLength,'SOURCE_SVG_ASSET_HASH');
  return {state,source,assets,stamp:canonicalJSON(state),userId:c.userId,projectId:c.projectId,sessionKey:c.sessionKey,headHash:c.headHash,epoch,serial,owner:null,ownerEpoch:null};
 }
 function current(s,c=context()){
  need(!disposed&&s.epoch===epoch,'SOURCE_SVG_RESET');need(c&&c.userId===s.userId&&c.projectId===s.projectId&&c.sessionKey===s.sessionKey&&c.headHash===s.headHash&&canonicalJSON(data(c.state))===s.stamp,'SOURCE_SVG_STALE');
  need(c.assetsMap instanceof Map,'SOURCE_SVG_STALE');for(const [h,b]of s.assets)need(byteEqual(c.assetsMap.get(h),b),'SOURCE_SVG_ASSET_HASH');
  if(s.owner)need(!s.owner.disposed&&s.owner.epoch===s.ownerEpoch,'SOURCE_SVG_RUNTIME');
 }
 function checkedControl(c,s){control(c);need(c.ticket.userId===s.userId&&c.ticket.projectId===s.projectId&&c.ticket.revision===s.state.revision,'SOURCE_SVG_STALE');}
 function unavailable(e){const code=typeof e?.code==='string'?e.code:'SOURCE_SVG_REFRESH_REQUIRED';return freeze({status:'unverified',reasonCode:code,reason:new SourceSVGError(code).message,verdict:'unverified'});}
 async function refresh({control:c}={}){
  control(c);need(!disposed,'SOURCE_SVG_RESET');cache=null;++serial;const s=capture(),ticket=data(c.ticket),token=serial;
  const check=()=>{checkedControl(c,s);current(s);need(same(ticket,c.ticket)&&serial===token,'SOURCE_SVG_STALE');};
  try{
   checkedControl(c,s);for(const [h,b]of s.assets){need(await sha256(b)===h,'SOURCE_SVG_ASSET_HASH');check();}
   need(await domainStateFingerprint(s.state)===s.headHash,'SOURCE_SVG_STALE');check();
   const source=s.source,b=source.metadata.productBindings;
   need(b?.version==='arch-product-bindings/1'&&b.projectId===s.projectId&&b.sourceId===source.id&&b.sourceRevision===source.revision&&b.rawHash===source.raw.hash,'SOURCE_SVG_REGIONS_REQUIRED');
   need(Array.isArray(b.regions)&&b.regions.length>0&&b.regions.length<=SOURCE_SVG_LIMITS.regions&&Array.isArray(b.contexts)&&b.contexts.length>=1&&b.contexts.length<=33,'SOURCE_SVG_LIMIT');
   need(Number.isFinite(b.sourceToleranceMm)&&b.sourceToleranceMm>=.000001&&b.sourceToleranceMm<=.004,'SOURCE_SVG_DATA');
   s.owner=await kernel.ensureRuntime(c);s.ownerEpoch=s.owner.epoch;check();const operation=fn=>kernel.operation(c,(client,generation)=>{check();need(client===s.owner,'SOURCE_SVG_RUNTIME');return fn(client,generation);});
   const contexts=[],proofs=[],textProofs=[];
   async function vector(key,svg,derivationHash,framing=null){
    need(svg.length<=SOURCE_SVG_LIMITS.sourceBytes,'SOURCE_SVG_LIMIT');safeSVG(svg);const sourceHash=await sha256(svg);check();
    const l=await operation((client,generation)=>client.build({kind:'svg',source:dec.decode(svg),thicknessMm:.2,longEdgeMm:0,toleranceMm:b.sourceToleranceMm},{generation}));
    try{check();need(l.epoch===s.ownerEpoch,'SOURCE_SVG_RUNTIME');const live=l.bytes();need(live instanceof Uint8Array&&live.length<=SOURCE_SVG_LIMITS.dependencyBytes,'SOURCE_SVG_LIMIT');const copy=new Uint8Array(live),metadata=data(l.metadata),rings=snapshotRings(copy);
     const canonical=await sourceGeometry({bytes:copy,metadata,key,sourceHash,derivationHash,control:c});check();
     const result={canonical,rings,bytes:svg,metadata,framing};contexts.push(result);proofs.push({key,sourceHash,derivationHash,geometry:canonical.regions,importLedger:metadata.importLedger});return result;
    }finally{l.release();}
   }
   async function text(overlay){
    const reply=await (overlay?sources.text.prepareText(c):sources.text.prepareSource(c));check();
    need(reply?.version===APP&&same(reply.ticket,c.ticket),'SOURCE_SVG_DERIVED_CHANGED');const p=reply.prepared;
    need(p&&p.svg instanceof Uint8Array&&['paths','svg'].includes(p.kind),'SOURCE_SVG_DERIVED_CHANGED');
    const original=bytes(p.svg,SOURCE_SVG_LIMITS.sourceBytes),a=source.metadata.productArtifacts;
    need(a?.version==='arch-product-artifacts/1'&&a.sourceTextStateHash===await sha256(canonicalJSON(s.state.content.app.text)),'SOURCE_SVG_DERIVED_CHANGED');check();
    const entry=overlay?a.overlay:a.art;need(entry,'SOURCE_SVG_DERIVED_CHANGED');
    const expectedFrame=overlay?entry.frame:entry,f=await textFrame(original,p.svgExport,expectedFrame,overlay);check();
    const expectedHash=overlay?entry.svgHash:source.metadata.numericSvgHash;
    need(f.frame.sha256===expectedHash&&byteEqual(s.assets.get(expectedHash),f.bytes)&&byteEqual(s.assets.get(f.frame.originalNumericSvgHash),original),'SOURCE_SVG_DERIVED_CHANGED');
    const records=[];for(const a of p.sourceAssets??[]){const owned=bytes(a.bytes);need(await sha256(owned)===a.record.sha256&&a.record.bytes===owned.length&&byteEqual(s.assets.get(a.record.sha256),owned),'SOURCE_SVG_DERIVED_CHANGED');check();records.push(data(a.record));}
    need(same(records,overlay?entry.sourceRecords:source.metadata.sourceRecords)&&same(reply.parameters,overlay?entry.parameters:source.metadata.parameters)&&same(reply.assembly,overlay?entry.assembly:source.metadata.assembly),'SOURCE_SVG_DERIVED_CHANGED');
    if(!overlay)need(same(p.selection??null,source.metadata.selection??null)&&(p.geometry?.text?.originalText??p.selection?.originalText??null)===source.metadata.originalText&&(p.geometry?.text?.text??p.selection?.canonicalText??null)===source.metadata.normalizedText,'SOURCE_SVG_DERIVED_CHANGED');need(same(p.claims,overlay?entry.claims:source.metadata.claims),'SOURCE_SVG_DERIVED_CHANGED');
    let derivative=f.frame.derivationHash;
    if(overlay){const {derivationHash,...payload}=entry;need(entry.contextKey==='text:primary'&&entry.sourceKey==='text:primary'&&entry.textStateHash===await sha256(canonicalJSON(s.state.content.app.text))&&await sha256(canonicalJSON(payload))===derivationHash,'SOURCE_SVG_DERIVED_CHANGED');derivative=derivationHash;}
    textProofs.push({key:overlay?'text:primary':'art',numericSvgHash:f.frame.originalNumericSvgHash,frame:data(f.frame),sourceRecords:records,selection:data(p.selection??null),parameters:data(reply.parameters),assembly:data(reply.assembly),text:data(p.geometry?.text??null),layout:data(p.geometry?.options??null),lines:data(p.geometry?.lineMetrics??[]),glyphs:data(p.geometry?.instances??[]),reshaped:true});
    return vector(overlay?'text:primary':'art',f.bytes,derivative,f);
   }
   let art,frame;
   if(source.raster){
    const r=await sources.raster.prepareRecipe({...c,state:s.state,assets:s.assets});check();need(r?.status==='ready'&&r.packet,'SOURCE_SVG_REGIONS_REQUIRED');
    const canonical=await rasterSourceGeometry({packet:r.packet,key:'art',sourceHash:source.raw.hash,derivationHash:r.preparation.approvalHash,control:c});check();
    const actual=validatePacket(r.packet),{accepted:_accepted,status:_status,...stable}=readableSummary(actual.summary,actual.metadata);
    need(same(stable,r.preparation.summary),'SOURCE_SVG_DERIVED_CHANGED');
    art={canonical,rings:packetRings(r.packet),raster:r};contexts.push(art);const width=actual.summary.widthMm,height=actual.summary.heightMm;
    need(width>0&&height>0&&width<=10000&&height<=10000,'SOURCE_SVG_LIMIT');// Kind28 is already source X-right/Y-down; reflecting it would invert raster edits.
    frame={width,height,box:[0,0,width,height],matrix:[1,0,0,1,0,0]};
    proofs.push({key:'art',sourceHash:source.raw.hash,derivationHash:r.preparation.approvalHash,geometry:canonical.regions,rasterReceipt:data(r.receipt),replayed:true});
   }else if(source.kind==='svg'){
    art=await vector('art',s.assets.get(source.raw.hash),null);const width=art.metadata.widthMm,height=art.metadata.heightMm;
    need(width>0&&height>0&&width<=10000&&height<=10000,'SOURCE_SVG_LIMIT');frame={width,height,box:[0,0,width,height],matrix:[1,0,0,1,0,0]};
   }else{
    art=await text(false);const [x,y,width,height]=art.framing.box;frame={width,height,box:[x,y,width,height],matrix:art.framing.outputMatrix};
   }
   const overlay=!!s.state.content.app.text?.text&&!s.state.content.app.text.asSource;if(overlay)await text(true);check();
   need(contexts.length===b.contexts.length,'SOURCE_SVG_REGION_CHANGED');
   const materials=s.state.content.app.materials;need(Array.isArray(materials)&&materials.length<=256,'SOURCE_SVG_LIMIT');
   const map=new Map();for(const m of materials){need(ident(m.id)&&!map.has(m.id),'SOURCE_SVG_IDENTITY');map.set(m.id,m);}
   const regionKeys=new Set(),selectors=new Set(),rows=[];let changed=false;
   for(const ctx of contexts){
    const expected=b.contexts.filter(x=>x.key===ctx.canonical.key);need(expected.length===1&&expected[0].sha256===ctx.canonical.sourceHash&&expected[0].derivationHash===ctx.canonical.derivationHash,'SOURCE_SVG_REGION_CHANGED');
    for(const r of ctx.canonical.regions){
     const mapped=b.regions.filter(v=>v.contextKey===ctx.canonical.key&&v.nativeKey===r.nativeKey);need(mapped.length===1,'SOURCE_SVG_REGION_CHANGED');const bound=mapped[0],selector=canonicalJSON([bound.contextKey,bound.nativeKey]);
     need(ident(bound.sourceKey)&&HASH.test(bound.geometryHash)&&bound.geometryHash===r.geometryHash&&!regionKeys.has(bound.sourceKey)&&!selectors.has(selector),'SOURCE_SVG_REGION_CHANGED');regionKeys.add(bound.sourceKey);selectors.add(selector);
     const m=map.get(bound.materialId);need(m&&typeof m.excluded==='boolean'&&/^#[a-fA-F0-9]{6}$/.test(m.color),'SOURCE_SVG_MATERIAL');
     const ext=validateProductMaterialExtension(m.product);need(ext.active&&ext.sourceId===source.id&&ext.sourceKey===bound.sourceKey&&same(ext.identityTuple,['arch-product-identity/1',s.projectId,source.id,'material-key','region:'+bound.sourceKey]),'SOURCE_SVG_IDENTITY');
     const rings=ctx.rings.get(source.raster&&ctx===art?r.nativeKey:r.sourceIndex);need(rings,'SOURCE_SVG_REGION_CHANGED');
     const matrix=ctx===art?frame.matrix:(source.kind==='svg'||source.raster)?[1,0,0,-1,0,frame.height]:frame.matrix;
     rows.push({binding:bound,material:m,rings,matrix});changed ||= m.excluded||Number.parseInt(m.color.slice(1)+'ff',16)!==r.rgba;
    }
   }
   need(rows.length===b.regions.length&&rows.length<=SOURCE_SVG_LIMITS.regions,'SOURCE_SVG_REGION_CHANGED');
   const used=new Set([...Object.values(b.roles),...b.regions.map(r=>r.materialId)]),entries=[{kind:'source',key:'root'},{kind:'provenance',key:'root'},...b.regions.flatMap(r=>[{kind:'region',key:r.sourceKey},{kind:'region-provenance',key:r.sourceKey}]),...(b.texts??[]).flatMap(t=>[{kind:'text',key:t.sourceKey},{kind:'text-provenance',key:t.sourceKey},{kind:'text-height',key:t.sourceKey},{kind:'text-base-height',key:t.sourceKey}]),...[...used].sort().map(id=>({kind:'material',key:id}))];
   const identities=await deriveProductIdentities({projectId:s.projectId,sourceId:source.id,keys:entries});check();
   need(b.identityLedger?.version==='arch-product-identities/1'&&same(b.identityLedger.records,identities),'SOURCE_SVG_IDENTITY');
   const mapping=rows.map(r=>({sourceKey:r.binding.sourceKey,contextKey:r.binding.contextKey,nativeKey:r.binding.nativeKey,geometryHash:r.binding.geometryHash,materialId:r.material.id,color:r.material.color,excluded:r.material.excluded,transform:r.matrix}));
   const provenance={version:SOURCE_SVG_VERSION,sourceOnly:true,sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash,headHash:s.headHash,
    sourceContext:data(source.metadata.sourceContext),originalKind:source.kind,originalMediaType:source.mediaType,
    regionProofHash:await sha256(canonicalJSON(proofs)),materialMapping:mapping,text:textProofs,
    raster:art.raster?{coordinateKind:28,coordinateSpace:'mm-x-right-y-down',receipt:data(art.raster.receipt),preparation:data(art.raster.preparation),upstreamConversion:data(source.metadata.sourceConversion??null),originalGraphRetainedInSourceAssets:true}:null,originalMetadataHash:await sha256(canonicalJSON(source.metadata)),originalBytesPreserved:true,
    qualification:{committedRegions:'revalidated',sourceBoundMm:null,mesh:'not-required',slicer:'unverified',fit:'unqualified'}};
   let output,changes=[];
   if(!changed&&!source.raster&&contexts.length===1){output=bytes(art.framing?.original??art.bytes);provenance.route=art.framing?'reshaped-retained-numeric-curves':'revalidated-original-svg';}
   else if(!changed&&!source.raster&&contexts.length===2&&source.kind==='svg'){
    const original=safeSVG(art.bytes).documentElement;original.setAttribute('x','0');original.setAttribute('y','0');original.setAttribute('width',frame.width);original.setAttribute('height',frame.height);
    const overlayText=contexts[1].framing;const serializer=new XMLSerializer();
    const box=[0,Math.min(0,frame.height+overlayText.box[1]),Math.max(frame.width,overlayText.box[0]+overlayText.box[2]),Math.max(frame.height,frame.height+overlayText.box[1]+overlayText.box[3])];
    box[3]-=box[1];output=enc.encode('<svg xmlns="'+NS+'" width="'+box[2]+'mm" height="'+box[3]+'mm" viewBox="'+box.join(' ')+'">'+serializer.serializeToString(original)+'<g transform="translate(0 '+frame.height+')">'+overlayText.body+'</g></svg>');
    provenance.route='retained-svg-plus-reshaped-overlay';
   }else{
    // Extend the source viewport for retained overlay placement; do not clip by model size.
    const limits=[frame.box[0],frame.box[1],frame.box[0]+frame.width,frame.box[1]+frame.height];
    for(const r of rows)if(!r.material.excluded)for(const ring of r.rings)for(const [x,y]of ring){const m=r.matrix,xx=Number(x)/1e6*m[0]+Number(y)/1e6*m[2]+m[4],yy=Number(x)/1e6*m[1]+Number(y)/1e6*m[3]+m[5];limits[0]=Math.min(limits[0],xx);limits[1]=Math.min(limits[1],yy);limits[2]=Math.max(limits[2],xx);limits[3]=Math.max(limits[3],yy);}
    const outputFrame={width:limits[2]-limits[0],height:limits[3]-limits[1],box:[limits[0],limits[1],limits[2]-limits[0],limits[3]-limits[1]]};
    need(outputFrame.width>0&&outputFrame.height>0&&outputFrame.width<=20000&&outputFrame.height<=20000,'SOURCE_SVG_LIMIT');
    output=regionDocument(rows,outputFrame,{version:SOURCE_SVG_VERSION,regionProofHash:provenance.regionProofHash});
    provenance.route=source.raster?'accepted-raster-indexed-regions':'visible-region-candidate';
    if(!source.raster||contexts.length>1)changes.push('Export current committed visible regions as straight SVG segments at the checked source subdivision/grid; original curves, strokes, clips and paint ancestry remain in source assets. Total source error is not certified.');
    if(changed)provenance.materialEditsApplied=true;
   }
   safeSVG(output);check();const outputHash=await sha256(output);check();provenance.outputSha256=outputHash;provenance.changes=changes;
   const dependencies=[...s.assets].filter(([,b])=>b.length>0).map(([sha256,b])=>({sha256,bytes:b.length})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
   const key='source-svg:'+await sha256(canonicalJSON({epoch,preparationSequence:token,userId:s.userId,projectId:s.projectId,headHash:s.headHash,sourceId:source.id,sourceRevision:source.revision,dependencies,outputHash,provenance}));check();
   const descriptor=freeze({status:'ready',key,sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash,representation:'validated-vector-paint',validation:'pass',serializer:SOURCE_SVG_VERSION,dependencies,provenance});
   data(descriptor);cache={s,descriptor,output,provenance:freeze(provenance),changes};return freeze({version:APP,ticket:data(c.ticket),descriptor});
  }catch(e){if(!disposed&&epoch===s.epoch&&serial===token)cache=null;throw e;}
 }
 function describe(c){try{need(cache,'SOURCE_SVG_REFRESH_REQUIRED');current(cache.s);const now=context();need(c&&c.userId===now.userId&&c.projectId===now.projectId&&c.sessionKey===now.sessionKey&&c.headHash===now.headHash&&same(data(c.state),cache.s.state),'SOURCE_SVG_STALE');return cache.descriptor;}catch(e){return unavailable(e);}}
 async function acquire(d,c){
  need(cache,'SOURCE_SVG_REFRESH_REQUIRED');const selected=cache;checkedControl(c,selected.s);current(selected.s);need(same(data(d),selected.descriptor),'SOURCE_SVG_STALE');need(leases.size<SOURCE_SVG_LIMITS.leases,'SOURCE_SVG_LIMIT');const ticket=data(c.ticket);
  need(c.context&&c.context.userId===selected.s.userId&&c.context.projectId===selected.s.projectId&&c.context.sessionKey===selected.s.sessionKey&&c.context.headHash===selected.s.headHash&&c.context.revision===selected.s.state.revision&&same(data(c.context.state),selected.s.state),'SOURCE_SVG_STALE');
  need(c.assets instanceof Map,'SOURCE_SVG_DATA');const own=new Map();for(const ref of d.dependencies){const b=bytes(c.assets.get(ref.sha256));need(b.length===ref.bytes,'SOURCE_SVG_ASSET_HASH');own.set(ref.sha256,b);}
  for(const [h,b]of own){need(await sha256(b)===h&&byteEqual(b,selected.s.assets.get(h)),'SOURCE_SVG_ASSET_HASH');checkedControl(c,selected.s);current(selected.s);need(cache===selected&&same(ticket,c.ticket),'SOURCE_SVG_STALE');}
  need(leases.size<SOURCE_SVG_LIMITS.leases,'SOURCE_SVG_LIMIT');
  const record={live:true};leases.add(record);
  return Object.freeze({async serializeSVG(options,controlValue){
   checkedControl(controlValue,selected.s);need(same(ticket,controlValue.ticket),'SOURCE_SVG_STALE');need(record.live&&cache===selected,'SOURCE_SVG_RESET');current(selected.s);
   options=data(options);need(options?.units==='source'&&options.side==='source'&&options.color==='source'&&ident(options.filename)&&typeof options.inspection==='boolean'&&Object.keys(options).every(k=>['units','side','color','filename','inspection'].includes(k)),'SOURCE_SVG_OPTIONS');
   const result={bytes:new Uint8Array(selected.output),key:d.key,sourceId:d.sourceId,sourceRevision:d.sourceRevision,rawHash:d.rawHash,provenance:cloneJSON(selected.provenance),...(selected.changes.length?{changes:[...selected.changes]}:{})};
   checkedControl(controlValue,selected.s);current(selected.s);return result;
  },release(){record.live=false;leases.delete(record);own.clear();}});
 }
 function reset(){epoch++;serial++;cache=null;for(const l of leases)l.live=false;leases.clear();}
 return Object.freeze({version:SOURCE_SVG_VERSION,refresh,describe,acquire,reset,dispose(){disposed=true;reset();}});
}
