import * as domain from '../domain/index.mjs';
import {validateState} from '../app/documents.mjs';
import {normalizeTextEdit,collectTextAssets} from './text-adapters.mjs';
import {prepareBindings,ProductAppError,validateProductMaterialExtension} from './product-adapters.mjs';
import {canonicalJSON,cloneJSON,sha256,keys} from '../storage/common.mjs';
import {domainStateFingerprint} from '../storage/history.mjs';
import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {validatePacket,decodeSummary} from '../core/raster-schema.mjs';
import {checkControl,checkedSourceContext} from './source-catalog.mjs';
import {manufacturingFrame} from '../core/source-frame.mjs';

export const PRODUCT_SOURCE_CONTEXTS_VERSION='arch-product-source-contexts/1';
export const PRODUCT_SOURCE_LIMITS=Object.freeze({
 contexts:33,regions:256,points:200000,indices:600000,contours:66666,
 snapshotBytes:64*1024*1024,assets:10000,assetBytes:128*1024*1024,
 svgBytes:1048576,metadataBytes:65536,artifactBytes:16384,adoptionBytes:262144
});
const VERSION='arch-app-adapters/1',ARTIFACTS='arch-product-artifacts/1';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const need=(ok,code,details={})=>{if(!ok)throw new ProductAppError(code,details);};
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const copy=v=>cloneJSON(v);
const hash=h=>{need(typeof h==='string'&&/^[a-f0-9]{64}$/.test(h),'PRODUCT_SOURCE_HASH');return h;};
const key=s=>{need(typeof s==='string'&&s.length>0&&enc.encode(s).length<=200&&!/[\u0000-\u001f\u007f]/.test(s)&&s.normalize('NFC')===s,'PRODUCT_SOURCE_KEY');return s;};
const integer=(n,min,max,code)=>{need(Number.isSafeInteger(n)&&n>=min&&n<=max,code);return n;};
const bounded=(o,n,code)=>{const v=copy(o);need(enc.encode(canonicalJSON(v)).length<=n,code);return v;};
const tick=c=>{if(c)checkControl(c);};
const overlayActive=s=>!!s?.content?.app?.text?.text&&!s.content.app.text.asSource;

function materialCoverage(materials,defaults){
 need(Array.isArray(materials)&&Array.isArray(defaults)&&materials.length<=256&&defaults.length===materials.length,'PRODUCT_MATERIAL_DEFAULT_COVERAGE');
 const ids=new Set(materials.map(m=>key(m.id))),defaultIds=new Set(defaults.map(m=>key(m.id)));
 need(ids.size===materials.length&&defaultIds.size===defaults.length&&[...ids].every(id=>defaultIds.has(id)),'PRODUCT_MATERIAL_DEFAULT_COVERAGE');
}

/** O(n) least rotation, preserving winding. Rings with a repeated minimal
 * point do not trigger a quadratic search. No simplification or quantization. */
function rotation(r){
 const n=r.length;let i=0,j=1,k=0;
 const cmp=(a,b)=>a[0]===b[0]?(a[1]===b[1]?0:a[1]<b[1]?-1:1):a[0]<b[0]?-1:1;
 while(i<n&&j<n&&k<n){
  const d=cmp(r[(i+k)%n],r[(j+k)%n]);if(d===0){k++;continue;}
  if(d>0){i=i+k+1;if(i<=j)i=j+1;}else{j=j+k+1;if(j<=i)j=i+1;}k=0;
 }
 return Math.min(i,j)%n;
}
async function ringHash(r,c){
 need(r.length>=3&&r.length<=PRODUCT_SOURCE_LIMITS.points,'PRODUCT_SOURCE_RING_LIMIT');
 let area=0n;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];area+=a[0]*b[1]-b[0]*a[1];}
 need(area!==0n,'PRODUCT_SOURCE_DEGENERATE_RING');const start=rotation(r);
 const bytes=new Uint8Array(8+16*r.length),d=new DataView(bytes.buffer);
 d.setUint32(0,1,true);d.setUint32(4,r.length,true);
 for(let j=0;j<r.length;j++){const p=r[(start+j)%r.length];d.setBigInt64(8+16*j,p[0],true);d.setBigInt64(16+16*j,p[1],true);}
 tick(c);const digest=await sha256(bytes);tick(c);return {sha256:digest,points:r.length,winding:area>0n?1:-1};
}
async function geometryHash(rings,c){
 const hashes=[];for(const r of rings)hashes.push(await ringHash(r,c));
 hashes.sort((a,b)=>a.sha256.localeCompare(b.sha256));tick(c);
 return sha256(canonicalJSON({version:'arch-canonical-region/1',coordinates:'integer-nm-y-up',rings:hashes}));
}
function coordinate(v){need(v>=-10000000000n&&v<=10000000000n,'PRODUCT_SOURCE_COORDINATE');return v;}

/** ASFR deliberately publishes zero mesh arrays. This reader is restricted to
 * that native-attested planar kind; the finished-mesh reader/oracle is unchanged. */
function framedPlanarParts(bytes,metadata){
 need(metadata.planarContextOnly===true&&metadata.sourceAssemblyRequired===true&&metadata.sourceFrame?.version==='arch-source-frame/1','PRODUCT_SOURCE_PLANAR_KIND');
 need(bytes.length>=128,'PRODUCT_SOURCE_PLANAR_LAYOUT');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>d.getUint32(o,true);
 need(u(0)===0x48435241&&u(4)===1&&u(8)===128&&u(12)===bytes.length&&u(16)>0&&u(16)<0xffffffff&&u(20)===0&&u(24)===0,'PRODUCT_SOURCE_PLANAR_LAYOUT');
 const counts=Array.from({length:7},(_,i)=>u(20+i*4)),offsets=Array.from({length:7},(_,i)=>u(48+i*4)),strides=[24,12,40,16,16,4,16],align=[8,4,8,8,4,4,4];
 let end=128;for(let i=0;i<7;i++){need(counts[i]<=600000&&offsets[i]>=end&&(bytes.byteOffset+offsets[i])%align[i]===0,'PRODUCT_SOURCE_PLANAR_LAYOUT');end=offsets[i]+counts[i]*strides[i];need(end<=bytes.length,'PRODUCT_SOURCE_PLANAR_LAYOUT');}
 need(end===bytes.length&&counts[2]>=1&&counts[2]<=256,'PRODUCT_SOURCE_PLANAR_LAYOUT');
 const parts=[];for(let index=0;index<counts[2];index++){
  const at=offsets[2]+40*index;
  need([0,4,8,12].every(o=>u(at+o)===0)&&d.getFloat64(at+32,true)===0,'PRODUCT_SOURCE_PLANAR_NO_MESH');
  parts.push({index,color:u(at+16),sourceIndex:u(at+20),contourStart:u(at+24),contourCount:u(at+28)});
 }
 for(let i=0;i<counts[6];i++){const at=offsets[6]+16*i;
  need(u(at)<counts[3]&&u(at+4)<counts[3]&&u(at)!==u(at+4)&&u(at+8)<parts.length&&(u(at+12)===0xffffffff||u(at+12)<parts.length&&u(at+12)!==u(at+8)),'PRODUCT_SOURCE_PLANAR_EDGE');
 }
 return {parts};
}

/** Describe real ARCH1 canonical contours. All heap views are consumed before
 * the first await. Caller retains the native snapshot for the whole Promise.
 * sourceIndex/nativeKey route only; authoredKey is accepted only from a unique
 * native sourceId. No SVG parser/boolean/mesh algorithm is replicated here. */
export async function sourceGeometry({bytes,metadata,key:contextKey='art',sourceHash,derivationHash=null,translationNm=['0','0'],includeRings=false,control:c}){
 tick(c);key(contextKey);hash(sourceHash);if(derivationHash!==null)hash(derivationHash);
 need(Array.isArray(translationNm)&&translationNm.length===2,'PRODUCT_CONTEXT_TRANSLATION');
 const shift=translationNm.map(v=>{need(typeof v==='string'&&/^-?(0|[1-9][0-9]{0,10})$/.test(v)&&v!=='-0','PRODUCT_CONTEXT_TRANSLATION');return coordinate(BigInt(v));});
 need(bytes instanceof Uint8Array&&bytes.length<=PRODUCT_SOURCE_LIMITS.snapshotBytes,'PRODUCT_SOURCE_SNAPSHOT_LIMIT');
 need(metadata?.kind==='svg'&&metadata.sourceHash===sourceHash&&metadata.integerGridMm===.000001,'PRODUCT_SOURCE_CANONICAL_METADATA');
 const snapshot=metadata.planarContextOnly===true?framedPlanarParts(bytes,metadata):readArchSnapshot(bytes),d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>d.getUint32(o,true);
 const points=u(32),contours=u(36),indices=u(40),pAt=u(60),cAt=u(64),iAt=u(68);
 integer(points,3,PRODUCT_SOURCE_LIMITS.points,'PRODUCT_SOURCE_POINT_LIMIT');
 integer(indices,3,PRODUCT_SOURCE_LIMITS.indices,'PRODUCT_SOURCE_INDEX_LIMIT');
 integer(contours,1,PRODUCT_SOURCE_LIMITS.contours,'PRODUCT_SOURCE_CONTOUR_LIMIT');
 integer(snapshot.parts.length,1,PRODUCT_SOURCE_LIMITS.regions,'PRODUCT_SOURCE_REGION_LIMIT');
 need(Array.isArray(metadata.paints)&&metadata.paints.length>=snapshot.parts.length&&metadata.paints.length<=256,'PRODUCT_SOURCE_PAINT_COVERAGE');
 const sourceIds=new Map();for(const p of metadata.paints)if(p.sourceId)sourceIds.set(p.sourceId,(sourceIds.get(p.sourceId)??0)+1);
 let end=0;const rows=[],seen=new Set();
 for(const part of snapshot.parts){
  need(part.contourStart===end&&part.contourCount>0,'PRODUCT_SOURCE_CONTOUR_OWNERSHIP');end+=part.contourCount;
  const sourceIndex=part.sourceIndex;integer(sourceIndex,0,255,'PRODUCT_SOURCE_INDEX');
  need(!seen.has(sourceIndex),'PRODUCT_SOURCE_INDEX_DUPLICATE');seen.add(sourceIndex);
  const paint=metadata.paints[sourceIndex];need(paint&&Array.isArray(paint.color)&&paint.color.length===4,'PRODUCT_SOURCE_PAINT_COVERAGE');
  const rgba=paint.color.reduce((v,n)=>v*256+integer(n,0,255,'PRODUCT_SOURCE_COLOR'),0)>>>0;
  need(rgba===part.color&&(rgba&255)===255,'PRODUCT_SOURCE_COLOR');
  const nativeKey=key(paint.sourceId||paint.id);
  // Duplicate authored IDs are not silently reassigned by paint order.
  if(paint.sourceId)need(sourceIds.get(paint.sourceId)===1,'PRODUCT_SOURCE_AUTHORED_KEY_AMBIGUOUS');
  const rings=[];
  for(let n=part.contourStart;n<end;n++){
   const at=cAt+16*n,start=u(at),count=u(at+4);need(count>=3&&start+count<=indices&&u(at+8)===part.index&&u(at+12)===0,'PRODUCT_SOURCE_CONTOUR_OWNERSHIP');
   const ring=[];for(let j=0;j<count;j++){const index=u(iAt+4*(start+j));need(index<points,'PRODUCT_SOURCE_POINT_INDEX');
    ring.push([coordinate(coordinate(d.getBigInt64(pAt+16*index,true))+shift[0]),coordinate(coordinate(d.getBigInt64(pAt+16*index+8,true))+shift[1])]);}
   rings.push(ring);
  }
  rows.push({nativeKey,sourceIndex,authoredKey:paint.sourceId||null,rgba,rings});
 }
 need(end===contours,'PRODUCT_SOURCE_REGION_COVERAGE');
 rows.sort((a,b)=>a.sourceIndex-b.sourceIndex);
 const regions=[];for(const {rings,...row}of rows)regions.push({...row,geometryHash:await geometryHash(rings,c),...(includeRings?{ringsNm:rings.map(r=>r.map(p=>p.map(String)))}:{})});
 tick(c);return freeze({key:contextKey,sourceHash,derivationHash,regions});
}

/** Packet rows are hash-checked by the adoption caller or returned by the real
 * accepted raster lease. Decodes kind28 exactly; no pixel re-quantization. */
export async function rasterSourceGeometry({packet,key:contextKey='art',sourceHash,derivationHash,includeRings=false,control:c}){
 tick(c);key(contextKey);hash(sourceHash);hash(derivationHash);
 if(packet?.version==='arch-product-stored-raster-graph/1'){
  need(Array.isArray(packet.buffers)&&packet.buffers.length===30,'PRODUCT_RASTER_BUFFER_COVERAGE');
  let total=0;for(const [i,row]of packet.buffers.entries()){
   need(row.kind===i+2&&row.bytes instanceof Uint8Array&&row.bytes.byteOffset===0&&row.bytes.buffer instanceof ArrayBuffer&&row.bytes.length===row.bytes.buffer.byteLength,'PRODUCT_RASTER_BUFFER_COVERAGE');
   total+=row.bytes.length;need(total<=64*1024*1024,'PRODUCT_RASTER_GRAPH_LIMIT');
  }
 }else validatePacket(packet);
 const b=new Map(packet.buffers.map(r=>[r.kind,r.bytes])),view=k=>new DataView(b.get(k).buffer);
 const loops=view(13),indices=view(14),xy=view(28),palette=view(7);
 need(loops.byteLength%16===0&&indices.byteLength%4===0&&xy.byteLength%16===0&&palette.byteLength%24===0,'PRODUCT_RASTER_GRAPH_LAYOUT');
 integer(xy.byteLength/16,3,PRODUCT_SOURCE_LIMITS.points,'PRODUCT_SOURCE_POINT_LIMIT');
 integer(indices.byteLength/4,3,PRODUCT_SOURCE_LIMITS.indices,'PRODUCT_SOURCE_INDEX_LIMIT');
 integer(loops.byteLength/16,1,PRODUCT_SOURCE_LIMITS.contours,'PRODUCT_SOURCE_CONTOUR_LIMIT');
 const colors=new Map();for(let i=0;i<palette.byteLength;i+=24){const label=palette.getUint32(i,true),v=palette.getUint32(i+4,true);
  need(!colors.has(label),'PRODUCT_RASTER_PALETTE_DUPLICATE');colors.set(label,((v&255)*0x1000000+(v>>>8&255)*65536+(v>>>16&255)*256+(v>>>24))>>>0);}
 const regions=new Map();
 for(let i=0;i<loops.byteLength;i+=16){
  const start=loops.getUint32(i,true),count=loops.getUint32(i+4,true),region=loops.getUint32(i+8,true),label=loops.getUint32(i+12,true);
  need(count>=4&&(start+count)*4<=indices.byteLength&&colors.has(label),'PRODUCT_RASTER_LOOP');
  const group=region+':'+label;if(!regions.has(group))regions.set(group,{region,label,rings:[]});
  const ring=[];let first,last;
  for(let j=0;j<count;j++){const index=indices.getUint32(4*(start+j),true);need((index+1)*16<=xy.byteLength,'PRODUCT_SOURCE_POINT_INDEX');
   if(j===0)first=index;last=index;if(j<count-1)ring.push([coordinate(xy.getBigInt64(16*index,true)),coordinate(xy.getBigInt64(16*index+8,true))]);}
  need(first===last,'PRODUCT_RASTER_LOOP_CLOSURE');regions.get(group).rings.push(ring);
 }
 integer(regions.size,1,256,'PRODUCT_SOURCE_REGION_LIMIT');
 const rows=[...regions.values()].sort((a,b)=>a.region-b.region||a.label-b.label),seen=new Set(),out=[];
 for(const [sourceIndex,r]of rows.entries()){
  need(!seen.has(r.region),'PRODUCT_RASTER_REGION_AMBIGUOUS');seen.add(r.region);
  const rgba=colors.get(r.label);need((rgba&255)===255,'PRODUCT_SOURCE_COLOR');
  out.push({sourceIndex,nativeKey:'raster-region:'+r.region,authoredKey:null,rgba,geometryHash:await geometryHash(r.rings,c),...(includeRings?{ringsNm:r.rings.map(r=>r.map(p=>p.map(String)))}:{})});
 }
 tick(c);return freeze({key:contextKey,sourceHash,derivationHash,regions:out});
}

/** Exact affine from the root text producer's numeric SVG viewport. The
 * affine group retains all path/curve bytes. Only a new checked wrapper is added;
 * it is parsed by the same native SVG parser, never displayed as dynamic SVG.
 * The current root clips at positive viewport coordinates: negative absolute
 * overlay coordinates use explicit exact integer-nm context translation. */
export async function manufacturingTextSVG(svg,svgExport,{overlay=false}={}){
 need(svg instanceof Uint8Array&&svg.length<=1048576&&svgExport?.status==='ready','PRODUCT_TEXT_NUMERIC_SVG');
 const xml=dec.decode(svg),match=/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="([^"]+)mm" height="([^"]+)mm" viewBox="([^"]+)">/.exec(xml);
 need(match&&xml.endsWith('</svg>'),'PRODUCT_TEXT_NUMERIC_SVG_ENVELOPE');
 const w=Number(match[1]),h=Number(match[2]),box=match[3].split(' ').map(Number),restore=svgExport.parserViewportToSourceMm;
 need(Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&w<=10000&&h<=10000&&box.length===4&&box.every(Number.isFinite)&&box[2]===w&&box[3]===h,'PRODUCT_TEXT_SOURCE_FRAME');
 need(Array.isArray(restore)&&restore.length===6&&restore.every(Number.isFinite)&&restore[0]===1&&restore[1]===0&&restore[2]===0&&restore[3]===-1&&restore[4]===box[0]&&restore[5]===-box[1],'PRODUCT_TEXT_SOURCE_FRAME');
 const transform=overlay?restore:[1,0,0,-1,0,h],left=transform[4],bottom=transform[5]-h;
 const translated=left<0||bottom<0;
 // Quantize the exact serialized decimal frame, without an extra floating
 // multiply near a half-grid tie. That same decimal is persisted/hash-bound.
 const serializedNm=v=>{
  const sign=v<0?-1n:1n,[mantissa,exponent='0']=String(Math.abs(v)).split('e'),fraction=mantissa.split('.')[1]?.length??0;
  const digits=BigInt(mantissa.replace('.','')),power=Number(exponent)-fraction+6;
  if(power>=0)return String(coordinate(sign*digits*10n**BigInt(power)));
  const divisor=10n**BigInt(-power),q=digits/divisor,remainder=digits%divisor;
  const rounded=q+(2n*remainder>divisor||2n*remainder===divisor&&q%2n!==0n?1n:0n);
  return String(coordinate(sign*rounded));
 };
 const translationNm=translated?[left,bottom].map(serializedNm):null;
 if(translationNm)translationNm.forEach(v=>coordinate(BigInt(v)));
 const viewport=translated?[1,0,0,-1,0,h]:transform;
 const width=viewport[4]+w+1,height=viewport[5]+1;need(width<=10000&&height<=10000,'PRODUCT_TEXT_SOURCE_FRAME_LIMIT');
 const body=xml.slice(match[0].length,-6),combined=[1,0,0,-1,viewport[4]-box[0],viewport[5]+box[1]];
 const text='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'mm" height="'+height+'mm" viewBox="0 0 '+width+' '+height+'"><g transform="matrix('+combined.join(' ')+')">'+body+'</g></svg>';
 const bytes=enc.encode(text);need(bytes.length<=1048576,'PRODUCT_TEXT_NUMERIC_SVG');
 const payload={version:translated?'arch-text-manufacturing-frame/2':'arch-text-manufacturing-frame/1',originalNumericSvgHash:await sha256(svg),transform,mode:overlay?'absolute-overlay':'source-art-normalized-origin',originalFrame:restore,sourceGeometryChanged:false,totalErrorBoundMm:null,
  ...(translationNm?{translationNm,translationInputMm:[left,bottom],
   translationQuantization:{rule:'nearest-ties-even-serialized-decimal-nm',signedDeltaMm:translationNm.map((n,i)=>Number(n)/1e6-[left,bottom][i]),boundMm:Math.SQRT2*.5e-6},
   canonicalTranslationErrorBoundMm:0}:{} )};
 return {bytes,descriptor:{...payload,sha256:await sha256(bytes),derivationHash:await sha256(canonicalJSON(payload))}};
}

/** One parent runtime and scheduler. The source services are the existing
 * createApplicationSources result, not a factory for another WASM Module. */
export function createProductSourceContexts({kernel,sources,context,resolveTextBindings=null,probeDatums=null,prepareProspectiveText=null,frameTransport='source-frame/1',generatedBaseAuthority=null}={}){
 need(['source-frame/1','product-context-bundle/2'].includes(frameTransport),'PRODUCT_FRAME_TRANSPORT');
 need(typeof kernel?.operation==='function'&&typeof kernel.ensureRuntime==='function'&&typeof sources?.source?.ingest==='function'&&
  typeof sources?.raster?.prepareRecipe==='function'&&typeof context==='function','PRODUCT_SOURCE_SERVICES');
 need(resolveTextBindings===null||typeof resolveTextBindings==='function','PRODUCT_TEXT_BINDING_CALLBACK');
 let epoch=1;const active=new Set(),pendingUpdates=new Set(),capturedReplies=new WeakSet(),approvedSources=new WeakMap(),activeAuthorities=new Set(),retirements=new Set();let retirementFailed=false;


 async function guardFor(c,state){
  tick(c);const ticket=freeze(copy(c.ticket)),captured=copy(state),e=epoch,sessionKey=key(context()?.sessionKey);
  need(c.ticket.revision===state.revision,'PRODUCT_SOURCE_TICKET');const fingerprint=await domainStateFingerprint(captured);
  const check=()=>{
   tick(c);const now=context();need(e===epoch,'PRODUCT_SOURCE_PRIVATE_RESET');
   need(same(ticket,c.ticket),'PRODUCT_SOURCE_TICKET_CHANGED');
   need(now?.sessionKey===sessionKey&&now?.userId===ticket.userId&&now.projectId===ticket.projectId&&now.state?.revision===ticket.revision&&same(now.state,captured),'PRODUCT_SOURCE_HEAD_CHANGED');
  };check();return {check,ticket,fingerprint,sessionKey,c:{...c,ticket}};
 }
 async function checkedAssets(input,source,g){
  need(input instanceof Map&&input.size<=PRODUCT_SOURCE_LIMITS.assets,'PRODUCT_SOURCE_ASSETS');
  const out=new Map();let size=0;
  for(const [h,value]of input){hash(h);need(value instanceof Uint8Array&&value.buffer instanceof ArrayBuffer,'PRODUCT_SOURCE_ASSET_BYTES');
   size+=value.length;need(size<=PRODUCT_SOURCE_LIMITS.assetBytes,'PRODUCT_SOURCE_ASSET_BUDGET');out.set(h,new Uint8Array(value));}
  need(source&&source.raw&&Array.isArray(source.assetHashes)&&source.assetHashes.length<=10000,'PRODUCT_SOURCE_DESCRIPTOR');
  const refs=new Set(source.assetHashes);need(refs.size===source.assetHashes.length&&refs.has(source.raw.hash),'PRODUCT_SOURCE_ASSET_COVERAGE');
  let total=0;for(const h of refs){hash(h);const v=out.get(h);need(v,'PRODUCT_SOURCE_ASSET_MISSING');total+=v.length;
   need(total<=PRODUCT_SOURCE_LIMITS.assetBytes,'PRODUCT_SOURCE_ASSET_BUDGET');need(await sha256(v)===h,'PRODUCT_SOURCE_ASSET_HASH');g.check();}
  need(out.get(source.raw.hash).length===source.raw.byteLength,'PRODUCT_SOURCE_RAW_LENGTH');return out;
 }
 function sourceDescriptor(source){
  const s=bounded(source,262144,'PRODUCT_SOURCE_DESCRIPTOR_BUDGET'),sc=s.metadata?.sourceContext;
  need(['svg','raster','text','emoji'].includes(s.kind)&&sc?.version==='arch-source-context/1'&&sc.id===s.id&&sc.revision===s.revision,'PRODUCT_SOURCE_CONTEXT');
  key(s.id);integer(s.revision,0,Number.MAX_SAFE_INTEGER-1,'PRODUCT_SOURCE_REVISION');hash(s.raw?.hash);return s;
 }
 function rasterContextHash(source,preparation){
  const input=preparation?.input;
  need(input&&input.originalHash===source.raw.hash&&input.rgbaHash===source.raster.rgba&&['encoded','rgba'].includes(input.mode),'PRODUCT_RASTER_PREPARATION_CONTEXT');
  // Match native RASP -> canonical_source: encoded bytes and a confirmed
  // artwork render retain the original source identity. Plain RGBA (including
  // edits of an ordinary raster) uses its current RGBA hash. The preparation
  // still binds both hashes, render consent and the full retained source bytes.
  if(input.origin!==null&&input.origin!==undefined){
   need(input.mode==='rgba'&&input.origin.sourceHash===input.originalHash,'PRODUCT_RASTER_RENDER_ORIGIN');
   return hash(input.origin.sourceHash);
  }
  return hash(input.mode==='encoded'?input.originalHash:input.rgbaHash);
 }
 async function packetFor(s,assets,g){
  const p=s.metadata.rasterPreparation;need(p?.version==='arch-raster-receipt/1'&&p.runtimeAbi===1&&p.documentSchema===2,'PRODUCT_RASTER_PREPARATION_REQUIRED');
  const {approvalHash,...payload}=p;hash(approvalHash);
  need(await sha256(canonicalJSON(payload))===approvalHash,'PRODUCT_RASTER_PREPARATION_HASH');g.check();
  need(p.context?.projectId===g.ticket.projectId&&p.context.sourceRevision===s.revision&&same(p.context.sourceContext,s.metadata.sourceContext)&&
   p.input.originalHash===s.raw.hash&&p.input.rgbaHash===s.raster.rgba,'PRODUCT_RASTER_PREPARATION_CONTEXT');
  need(Array.isArray(p.buffers)&&p.buffers.length===30,'PRODUCT_RASTER_BUFFER_COVERAGE');
  const buffers=p.buffers.map((r,i)=>{
   need(r.kind===i+2&&s.assetHashes.includes(r.hash),'PRODUCT_RASTER_BUFFER_COVERAGE');const value=assets.get(r.hash);
   need(value&&value.length===r.byteLength,'PRODUCT_RASTER_BUFFER_SIZE');return {kind:r.kind,bytes:new Uint8Array(value)};
  });
  return {version:'arch-product-stored-raster-graph/1',buffers};
 }
 async function artifacts(source,assets,state,g){
  const entry=source.metadata.productArtifacts;
  if(entry)need(entry.version===ARTIFACTS,'PRODUCT_TEXT_ARTIFACT_VERSION');
  async function checkFrame(frame,expectedHash,overlay){
   need(['arch-text-manufacturing-frame/1','arch-text-manufacturing-frame/2'].includes(frame?.version)&&source.assetHashes.includes(frame.originalNumericSvgHash),'PRODUCT_TEXT_FRAME_PROVENANCE');
   const original=assets.get(frame.originalNumericSvgHash);
   need(original,'PRODUCT_TEXT_ARTIFACT_MISSING');
   const rebuilt=await manufacturingTextSVG(original,{status:'ready',parserViewportToSourceMm:frame.originalFrame},{overlay});
   need(same(rebuilt.descriptor,frame)&&rebuilt.descriptor.sha256===expectedHash,'PRODUCT_TEXT_FRAME_PROVENANCE');g.check();
  }
  if(entry?.art)await checkFrame(entry.art,source.metadata.numericSvgHash,false);
  if(!overlayActive(state))return [];
  need(entry?.version===ARTIFACTS&&entry.overlay,'PRODUCT_TEXT_ARTIFACT_CAPTURE_REQUIRED');
  keys(entry,['version','overlay','sourceTextStateHash','art'],['version','overlay','sourceTextStateHash']);const a=bounded(entry.overlay,PRODUCT_SOURCE_LIMITS.artifactBytes,'PRODUCT_TEXT_ARTIFACT_BUDGET');
  const {derivationHash,...payload}=a;
  need(await sha256(canonicalJSON(payload))===hash(derivationHash),'PRODUCT_TEXT_ARTIFACT_HASH');
  need(a.contextKey==='text:primary'&&a.sourceKey==='text:primary'&&a.textStateHash===await sha256(canonicalJSON(state.content.app.text)),'PRODUCT_TEXT_ARTIFACT_STALE');
  need(source.assetHashes.includes(a.svgHash)&&assets.has(a.svgHash),'PRODUCT_TEXT_ARTIFACT_MISSING');
  await checkFrame(a.frame,a.svgHash,true);
  for(const r of a.sourceRecords){need(source.assetHashes.includes(r.sha256)&&assets.get(r.sha256)?.length===r.bytes,'PRODUCT_TEXT_SOURCE_HASH');}
  g.check();return [a];
 }
 async function renderProspective(op,state,assets,g){
  const request={version:VERSION,ticket:copy(g.ticket),op,state:copy(state),assetsMap:collectTextAssets(state,assets)};
  const reply=prepareProspectiveText?await prepareProspectiveText(request,g.c):
   await kernel.operation(g.c,(client,generation)=>{need(typeof client.textOperation==='function','PRODUCT_TEXT_RPC_REQUIRED');return client.textOperation(request,{generation});});
  g.check();need(reply?.version===VERSION&&same(reply.ticket,g.ticket),'PRODUCT_TEXT_REPLY_TICKET');return reply;
 }
 function sourceCaptureState(c){
  const state=c.state??context()?.state,base=c.baseState??state;
  if(c.baseState){const withoutText=s=>{const v=copy(validateState(s));delete v.content.app.text;return v;};need(same(withoutText(state),withoutText(base)),'PRODUCT_SOURCE_PROSPECTIVE_SCOPE');}
  return {state,base};
 }
 async function captureArtifacts(c){
  const {state,base}=sourceCaptureState(c),g=await guardFor(c,base);
  return captureArtifactsFor(c,state,g);
 }
 async function captureArtifactsFor(c,state,g,inputAssets=null){
  if(!overlayActive(state))return freeze({version:ARTIFACTS,overlay:null,assets:[]});
  need(!state.content.app.text.bevelEnabled,'PRODUCT_TEXT_BEVEL_UNAVAILABLE');
  const reply=inputAssets?await renderProspective('prepare.text',state,inputAssets,g):await sources.text.prepareText(g.c);g.check();const p=reply.prepared;
  need(p&&['paths','svg'].includes(p.kind)&&p.svg instanceof Uint8Array&&p.svg.length<=PRODUCT_SOURCE_LIMITS.svgBytes,'PRODUCT_TEXT_OUTLINES_UNAVAILABLE',
   {requires:'explicit existing source conversion for bitmap/color paint without certified numeric SVG'});
  const framed=await manufacturingTextSVG(p.svg,p.svgExport,{overlay:true});
  const textStateHash=await sha256(canonicalJSON(state.content.app.text)),svgHash=framed.descriptor.sha256,assets=[{kind:'derived',bytes:new Uint8Array(p.svg)},{kind:'derived',bytes:framed.bytes}];
  const records=[];
  for(const a of p.sourceAssets??[]){
   const bytes=new Uint8Array(a.bytes);need(await sha256(bytes)===a.record.sha256&&bytes.length===a.record.bytes,'PRODUCT_TEXT_SOURCE_HASH');
   assets.push({kind:'dependency',bytes});records.push(copy(a.record));g.check();
  }
  const payload=bounded({contextKey:'text:primary',sourceKey:'text:primary',svgHash,artifactHash:hash(p.artifactHash),textStateHash,
   sourceRecords:records,frame:framed.descriptor,claims:copy(p.claims),parameters:copy(reply.parameters),assembly:copy(reply.assembly)},
   PRODUCT_SOURCE_LIMITS.artifactBytes,'PRODUCT_TEXT_ARTIFACT_BUDGET');
  const overlay=freeze({...payload,derivationHash:await sha256(canonicalJSON(payload))});g.check();
  // Typed owned assets are intentionally outside the JSON artifact descriptor.
  return Object.freeze({version:ARTIFACTS,overlay,assets});
 }
 async function captureSourceResult(c,reply,plan=null){
  const live=context(),{base}=sourceCaptureState(c),g=await guardFor(c,base);
  need(c.purpose===undefined||c.purpose==='source','PRODUCT_SOURCE_CAPTURE_PURPOSE');
  if(plan===null){
   // A text conversion has a private pending receipt: another text RPC would
   // invalidate it. source wrappers prepare the overlay before invoking it.
   need(!reply?.confirmation||!['text','emoji'].includes(reply.confirmation.kind),'PRODUCT_ARTIFACT_CAPTURE_ORDER');
   plan=await captureArtifacts(c);
  }
  need(plan?.version===ARTIFACTS&&Array.isArray(plan.assets),'PRODUCT_ARTIFACT_CAPTURE_PLAN');
  const wrapped=reply?.status==='proposal',result=wrapped?reply.result:reply;
  need(result?.version===VERSION&&same(result.ticket,c.ticket),'PRODUCT_SOURCE_RESULT');
  need(!capturedReplies.has(reply)&&!capturedReplies.has(result),'PRODUCT_ARTIFACT_ALREADY_CAPTURED');
  let art=null,artBytes=[];
  if(['text','emoji'].includes(result.kind)&&!result.raster&&result.metadata?.numericSvgHash){
   const original=(result.assets??[]).find(a=>a.bytes instanceof Uint8Array&&a.bytes.length>0&&[60,115,118,103].every((v,i)=>a.bytes[i]===v));
   need(original&&await sha256(original.bytes)===result.metadata.numericSvgHash,'PRODUCT_TEXT_NUMERIC_SVG');
   const framed=await manufacturingTextSVG(original.bytes,result.metadata.svgExport);art=framed.descriptor;artBytes=[{kind:'derived',bytes:framed.bytes}];
  }
  const output={...result,metadata:{...copy(result.metadata??{}),...(art?{numericSvgHash:art.sha256}:{}),productArtifacts:{version:ARTIFACTS,overlay:plan.overlay,...(art?{art}:{}),sourceTextStateHash:await sha256(canonicalJSON((c.state??live.state).content.app.text))}},
   assets:[...(result.assets??[]),...plan.assets,...artBytes].map(a=>({...a,bytes:new Uint8Array(a.bytes)}))};
  need(enc.encode(canonicalJSON(output.metadata)).length<=65536,'PRODUCT_SOURCE_METADATA_BUDGET');g.check();
  const delivered=wrapped?{...reply,result:output}:output;capturedReplies.add(delivered);capturedReplies.add(output);return delivered;
 }
 async function textBinding(c,state,source,contexts,g){
  if(!overlayActive(state))return null;
  const t=state.content.app.text,old=state.content.app.source?.metadata?.productBindings;
  if(resolveTextBindings){
   const result=await resolveTextBindings({control:g.c,state:freeze(copy(state)),source:freeze(copy(source)),canonicalContexts:contexts,
    required:{heightDatum:133,baseDatum:134,coordinateFrame:'manufacturing-z',mechanicsSemantics:3,sourceSemantics:2}});
   g.check();if(result)return result;
  }
  if(old?.texts?.length&&old.textStateHash===await sha256(canonicalJSON(t))&&old.rawHash===source.raw.hash&&old.sourceRevision===source.revision)
   return {texts:old.texts,eyeletTextKey:old.eyeletTextKey,contextTextKeys:{'text:primary':old.texts[0].sourceKey}};
  if(t.placement!=='beside')return null;
  // AS_SOURCE_BED_TEXT defines an actual manufacturing bed face, independent
  // of product elevation. The optional base starts on bed and its top is the
  // declared layer boundary. R2 still checks both faces and detached support.
  const h=integer(Number(t.heightLayers),1,1000000,'PRODUCT_TEXT_LAYERS'),
   b=integer(Number(t.baseThicknessLayers),1,1000000,'PRODUCT_TEXT_LAYERS');
  need(!t.baseEnabled||Number(t.baseWidthMm)===0,'PRODUCT_TEXT_ABSOLUTE_BASE_WIDTH_UNAVAILABLE');
  const record=(datum,referenceLayer,layerCount)=>({mode:2,origin:0,datum,referenceLayer,layerCount,value:0});
  return {texts:[{sourceKey:'text:primary',placement:1,baseOn:t.baseEnabled,basePad:0,baseRound:Number(t.baseRadiusMm),
   height:record(133,t.baseEnabled?b:0,h),baseHeight:record(134,0,b)}],eyeletTextKey:null,contextTextKeys:{'text:primary':'text:primary'}};
 }

 /** Places a context lease with the native source-frame extension: a translation
  * for an overlay (text beside the artwork), or the one reflection that turns a
  * parsed SVG or raster context (X right, Y down) into the manufacturing frame
  * (Y up), the frame of the text wrapper, the preview, the assembly and every
  * export. A raster context is addressed by its registry token and has no
  * client-side bytes or metadata, so only its result is checked. */
 async function placeContext(original,{translationNm=null,manufacturing=null}={},sourceHash,mutate,retain,alive){
  if(!translationNm&&!manufacturing)return original;
  need(frameTransport==='source-frame/1','PRODUCT_FRAME_TRANSPORT');
  need(!(translationNm&&manufacturing),'PRODUCT_SOURCE_FRAME_SCOPE');
  const token=original?.kind==='raster-token',placement=manufacturing?manufacturingFrame({sourceHash,heightMm:manufacturing.heightMm}):null;
  const expectedNm=placement?placement.translationNm:translationNm.map(v=>String(coordinate(BigInt(v)))),linear=placement?placement.linearMatrix:[1,0,0,1],
   matrix=placement?placement.request.matrix:[1,0,0,1,...expectedNm.map(v=>Number(v)/1000000)];
  const result=await mutate((client,generation)=>{
   need(client.serviceCapabilities?.sourceFrameVersion===1&&typeof client.sourceFrame==='function','PRODUCT_SOURCE_FRAME_CAPABILITY_REQUIRED');
   return client.sourceFrame(original,{version:'arch-source-frame/1',sourceHash,matrix},{generation});
  });
  retain(result);alive();
  const frame=result.metadata?.sourceFrame;
  need(result.epoch===original.epoch&&(token||result.id!==original.id)&&result.metadata.sourceHash===sourceHash&&
   frame?.version==='arch-source-frame/1'&&same(frame.requestedMatrix,matrix)&&same(frame.linearMatrix,linear)&&
   Array.isArray(frame.translationGrid)&&same(frame.translationGrid.map(String),expectedNm)&&
   frame.gridScalePerMm===1000000&&frame.rounding==='binary64-exact-nearest-ties-even/1'&&
   frame.translationErrorUpperMmPerAxis===.0000005&&frame.totalErrorBoundMm===null&&
   (token?result.metadata.kind==='raster-source-context'&&result.metadata.heightMm===manufacturing.heightMm
    :frame.sourceSnapshotId===original.id&&frame.sourceSnapshotGeneration===original.generation)&&
   (!placement||result.metadata.planarContextOnly===true&&result.metadata.sourceAssemblyRequired===true),
   'PRODUCT_SOURCE_FRAME_RESULT');
  need(result.bytes().length<=PRODUCT_SOURCE_LIMITS.snapshotBytes&&(token||original.bytes().length<=PRODUCT_SOURCE_LIMITS.snapshotBytes),"PRODUCT_SOURCE_SNAPSHOT_LIMIT");
  const resultBytes=new Uint8Array(result.bytes());
  need(await sha256(resultBytes)===hash(frame.geometrySha256)&&(token||await sha256(new Uint8Array(original.bytes()))===hash(frame.sourceSnapshotSha256)),'PRODUCT_SOURCE_FRAME_HASH');
  hash(frame.sourceMetadataSha256);hash(frame.requestSha256);hash(frame.sourceSnapshotSha256);
  if(!token)for(const [key,value]of Object.entries(original.metadata))need(same(result.metadata[key],value),'PRODUCT_SOURCE_FRAME_PROVENANCE');
  alive();return result;
 }
 /** A raster this application rendered from an SVG before the source frame was
  * settled holds mirrored pixels: that renderer sampled a Y-down viewport as if
  * it were Y up, and the build path did not reflect, so the two cancelled and the
  * model matched the drawing. Reflecting those saved pixels now would turn a
  * correct saved project upside down (Codex R3B-C01). Such a render is the only
  * artwork that must not be placed, and it is recognisable from what the
  * conversion recorded about its own render.
  *
  * The question asked of the record is "did this render honour the source's own
  * Y-down axis?", and only a frame that says so earns the reflection. Anything
  * else - the frames written before the fix, which name no axis at all, a frame
  * that records the Y-up sampling itself, or a record damaged outside this
  * application - is treated as the old convention, because that is what every
  * saved project actually holds and because the answer preserves the model such a
  * project already builds. Two conversion paths record the frame in different
  * places, so both are read (Grok, round 3c). Imported pictures carry no frame at
  * all, and text or emoji renders record a pixel-to-source affine instead; both
  * are upright and are placed like any other artwork. */
 function mirroredDerivedRaster(source){
  const metadata=source?.metadata,frame=metadata?.preview?.frame??metadata?.frame;
  return !!frame&&frame.kind==='manufacturing-bounds'&&frame.sourceAxis!=='x-right-y-down';
 }
 function sealedRasterFrame(packet){
  validatePacket(packet);const s=decodeSummary(packet.buffers.find(r=>r.kind===1).bytes);
  return freeze({version:'arch-raster-frame/1',widthPx:s.inputWidth,heightPx:s.inputHeight,processedWidthPx:s.width,processedHeightPx:s.height,
   widthMm:s.widthMm,heightMm:s.heightMm,mmPerPixelX:s.mmPerPixelX,mmPerPixelY:s.mmPerPixelY,axis:'x-right-y-down',originMm:[0,0],source:'sealed-RASP/2'});
 }
 async function withCanonical(input,consume,{adoption=false,prospectiveBase=null}={}){
  need(typeof consume==='function','PRODUCT_SOURCE_CONSUMER_REQUIRED');
  const delegated=input.generatedBase===undefined?null:(need(!adoption&&!prospectiveBase&&typeof generatedBaseAuthority==='function','PRODUCT_GENERATED_BASE_AUTHORITY'),generatedBaseAuthority(input.generatedBase));
  if(delegated){delegated.assertCurrent();need(same(input.state,delegated.state),'PRODUCT_GENERATED_BASE_STATE');}
  const state=copy(input.state),g=await guardFor(input.control??input,delegated?.currentState??prospectiveBase??state),c=g.c,source=sourceDescriptor(input.source??state.content.app.source);
  const capturedSource=canonicalJSON(input.source??state.content.app.source),assets=await checkedAssets(input.assets,source,g);
  const check=()=>{delegated?.assertCurrent();g.check();need(canonicalJSON(input.source??input.state.content.app.source)===capturedSource,'PRODUCT_SOURCE_DESCRIPTOR_CHANGED');};
  const tolerance=input.bindings?.sourceToleranceMm??source.metadata.productBindings?.sourceToleranceMm??.001;
  need(Number.isFinite(tolerance)&&tolerance>=.000001&&tolerance<=.004,'PRODUCT_SOURCE_TOLERANCE');
  const owner=await kernel.ensureRuntime(c),ownerEpoch=owner.epoch;check();
  need(Number.isSafeInteger(ownerEpoch),'PRODUCT_SOURCE_OWNER');
  const versions=owner.serviceCapabilities?.geometryVersions;
  const totals={points:0,indices:0,contours:0,snapshotBytes:0};
  function charge(counts){for(const k of Object.keys(totals)){totals[k]+=counts[k];need(Number.isSafeInteger(totals[k])&&totals[k]<=PRODUCT_SOURCE_LIMITS[k],'PRODUCT_SOURCE_AGGREGATE_LIMIT',{resource:k,limit:PRODUCT_SOURCE_LIMITS[k]});}}
  need(versions?.mechanicsAbi===2&&versions.mechanicsSemantics===3&&versions.sourceAbi===1&&versions.sourceSemantics===2&&versions.datumExtension===1,'PRODUCT_SOURCE_RUNTIME_VERSIONS');const borrows=[],cleanup=[];
  const record={live:true};active.add(record);
  const alive=()=>{check();need(record.live&&owner.epoch===ownerEpoch,'PRODUCT_SOURCE_RETIRED');for(const l of borrows)l.bytes();};
  const run=input.run??(invoke=>kernel.operation(c,invoke));
  const mutate=fn=>run((current,generation)=>{need(current===owner&&current.epoch===ownerEpoch,'PRODUCT_SOURCE_OWNER_CHANGED');alive();return fn(current,generation);});
  const retain=l=>{borrows.push(l);cleanup.push(()=>l.release());};
  async function svgContext(spec){
   const b=assets.get(spec.sourceHash);need(b&&b.length>0&&b.length<=PRODUCT_SOURCE_LIMITS.svgBytes,'PRODUCT_SOURCE_SVG_LIMIT');
   let lease=await mutate((client,generation)=>client.build({kind:'svg',source:dec.decode(b),thicknessMm:.2,longEdgeMm:0,toleranceMm:tolerance},{generation}));
   retain(lease);alive();
   if(spec.translationNm&&frameTransport==='source-frame/1')lease=await placeContext(lease,{translationNm:spec.translationNm},spec.sourceHash,mutate,retain,alive);
   need(lease.epoch===ownerEpoch,'PRODUCT_SOURCE_OWNER_CHANGED');
   const bytes=lease.bytes(),d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   need(bytes.length>=80,'PRODUCT_SOURCE_SNAPSHOT_LIMIT');
   charge({points:d.getUint32(32,true),contours:d.getUint32(36,true),indices:d.getUint32(40,true),snapshotBytes:bytes.length});
   const canonical=await sourceGeometry({bytes,metadata:lease.metadata,...spec,...(frameTransport==='source-frame/1'?{translationNm:['0','0']}:{}),control:c});alive();
   // Region identity (geometry hashes, native keys) stays in the source's own
   // frame; only the lease the assembly consumes is reflected into the
   // manufacturing frame. Text-derived wrappers are already there.
   if(spec.manufacturing&&frameTransport==='source-frame/1')lease=await placeContext(lease,{manufacturing:{heightMm:lease.metadata.heightMm}},spec.sourceHash,mutate,retain,alive);
   const ref=()=>{alive();return {kind:'snapshot',id:lease.id,generation:lease.generation,epoch:ownerEpoch,...(spec.translationNm&&frameTransport==='product-context-bundle/2'?{translationNm:copy(spec.translationNm)}:{})};};
   return {canonical,ref};
  }
  function chargeRaster(packet){
   const rows=new Map(packet.buffers.map(b=>[b.kind,b.bytes]));
   charge({points:rows.get(28).length/16,indices:rows.get(14).length/4,contours:rows.get(13).length/16,
    snapshotBytes:packet.buffers.reduce((n,b)=>n+b.bytes.length,0)});
  }
  async function finish(art,extras,authorization,upstreamBindings=null){
   const rows=[art,...extras],canonicalContexts=rows.map(r=>r.canonical);
   need(canonicalContexts.length<=33&&canonicalContexts.reduce((n,c)=>n+c.regions.length,0)<=256,'PRODUCT_SOURCE_REGION_LIMIT');
   if(input.bindings){
    need(input.bindings.contexts.length===canonicalContexts.length,'PRODUCT_CONTEXT_COVERAGE');
    for(const [i,ctx]of canonicalContexts.entries()){
     const expected=input.bindings.contexts[i];need(ctx.key===expected.key&&ctx.sourceHash===expected.sha256&&ctx.derivationHash===expected.derivationHash,'PRODUCT_CONTEXT_HASH');
     const assigned=input.bindings.regions.filter(r=>r.contextKey===ctx.key);
     need(assigned.length===ctx.regions.length,'PRODUCT_REGION_COVERAGE');
     for(const r of ctx.regions){const b=assigned.filter(a=>a.nativeKey===r.nativeKey);
      need(b.length===1&&b[0].geometryHash===r.geometryHash,'PRODUCT_SOURCE_GEOMETRY_REBIND_REQUIRED');}
    }
   }
   alive();
   if(adoption)return await consume({canonicalContexts,source,assets,guard:check,control:c});
   const references=rows.map(r=>r.ref),native=rows.length===1?references[0]():{kind:'contexts',contexts:rows.map(r=>({...r.ref(),sourceHash:r.canonical.sourceHash}))};
   const prepared={version:'arch-product-contexts/1',owner,epoch:ownerEpoch,source:native,references,assertOwned:alive,
    contexts:canonicalContexts.map(x=>({...x,regions:x.regions.map(({nativeKey,sourceIndex})=>({nativeKey,sourceIndex}))})),
    authorization,textStateHash:input.bindings.textStateHash,...(upstreamBindings?{upstreamBindings}:{})};
   const result=await consume(prepared);
   try{alive();}catch(error){if(typeof result?.release==='function')await result.release();throw error;}
   return result;
  }
  try{
   const overlay=await artifacts(source,assets,state,g);check();const extras=[];
   // Every context derives from captured, SHA checked source bytes. Text shaping
   // ran before capture; changes to those controls require a new atomic capture.
   if(['text','emoji'].includes(source.kind)&&!source.raster){
    need(source.metadata.productArtifacts?.sourceTextStateHash===await sha256(canonicalJSON(state.content.app.text)),'PRODUCT_TEXT_SOURCE_PARAMETERS_CHANGED');
   }
   for(const a of overlay)extras.push(await svgContext({key:a.contextKey,sourceHash:a.svgHash,derivationHash:a.derivationHash,...(a.frame.translationNm?{translationNm:a.frame.translationNm}:{})}));
   if(source.raster){
    if(adoption){
     const packet=await packetFor(source,assets,g);
     chargeRaster(packet);
     const canonical=await rasterSourceGeometry({packet,key:'art',sourceHash:rasterContextHash(source,source.metadata.rasterPreparation),derivationHash:source.metadata.rasterPreparation.approvalHash,control:c});
     return await finish({canonical},extras,null);
    }
    const consumeReady=async ready=>{
     alive();need(ready.status==='ready'&&ready.nativeSource?.kind==='raster-token'&&ready.nativeSource.epoch===ownerEpoch,'PRODUCT_RASTER_OWNER');
     chargeRaster(ready.packet);
     const canonical=await rasterSourceGeometry({packet:ready.packet,key:'art',sourceHash:rasterContextHash(source,ready.preparation),derivationHash:ready.preparation.approvalHash,control:c});
     let reference=()=>{alive();return {...ready.nativeSource};};
     if(frameTransport==='source-frame/1'||extras.length&&!ready.contextBuilt){
      // Existing accepted-token RPC -> registered SourceContext. This performs
      // no segmentation/confirmation and preserves the full indexed graph.
      need(typeof owner.rasterOperation==='function'&&typeof owner.rasterRegistry==='function','PRODUCT_RASTER_CONTEXT_RPC_REQUIRED');
      const contextReply=await mutate((client,generation)=>client.rasterOperation('buildSourceContext',
       {token:ready.nativeSource.token,thicknessMm:.2},{generation,epoch:ownerEpoch}));
      need(contextReply&&typeof contextReply.token==='string','PRODUCT_RASTER_CONTEXT_REPLY');
      const token=contextReply.token;cleanup.push(async()=>{if(owner.epoch===ownerEpoch)await owner.rasterRegistry('release',{token},{epoch:ownerEpoch});});
      alive();need(contextReply.kind==='raster-source-context'&&contextReply.sourceAssemblyRequired===true,'PRODUCT_RASTER_CONTEXT_REPLY');
      reference=()=>{alive();return {kind:'raster-token',token,epoch:ownerEpoch};};
      // The pixel grid is X right/Y down; ASFR/1 reflects the registered context
      // into the manufacturing frame. The bundle transport predates the frame
      // ABI and hands the context over as it is.
      if(frameTransport==='source-frame/1'&&!mirroredDerivedRaster(source)){
       const framed=await placeContext({kind:'raster-token',token,epoch:ownerEpoch},{manufacturing:{heightMm:sealedRasterFrame(ready.packet).heightMm}},canonical.sourceHash,mutate,retain,alive);
       reference=()=>{alive();return {kind:'snapshot',id:framed.id,generation:framed.generation,epoch:ownerEpoch};};
      }
     }
     return finish({canonical,ref:reference},extras,ready.receipt,input.domainRecord.records.filter(r=>r.fieldId>=1&&r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId));
    };
    if(input.sourceAuthority!==undefined){
     const authority=approvedSources.get(input.sourceAuthority);need(prospectiveBase&&authority,'PRODUCT_PROSPECTIVE_SOURCE_AUTHORITY');authority.check();
     const r=authority.ready;
     need(authority.baseHash===await domainStateFingerprint(prospectiveBase)&&authority.sessionKey===g.sessionKey&&
      r.receipt.projectId===c.ticket.projectId&&r.receipt.sourceRevision===source.revision&&r.receipt.acceptedAtRevision===prospectiveBase.revision+1&&
      r.receipt.sourceHash===source.raw.hash&&r.receipt.rgbaHash===source.raster.rgba&&r.preparation.approvalHash===source.metadata.rasterPreparation.approvalHash&&
      same(r.receipt,source.metadata.confirmationReceipt),'PRODUCT_PROSPECTIVE_SOURCE_AUTHORITY');
     const value=await consumeReady(r);authority.check();return value;
    }
    return await sources.raster.prepareRecipe({...c,state:prospectiveBase?{...state,revision:prospectiveBase.revision}:state,assets},consumeReady);
   }
   const numeric=source.kind==='svg'?source.raw.hash:source.metadata.numericSvgHash;
   need(numeric&&source.assetHashes.includes(numeric),'PRODUCT_TEXT_OUTLINES_UNAVAILABLE');
   // A raw SVG file is parsed X right/Y down and is reflected into the
   // manufacturing frame; a text or emoji numeric SVG comes through the
   // manufacturing wrapper and is already Y up.
   const art=await svgContext({key:'art',sourceHash:numeric,derivationHash:source.kind==='svg'?null:hash(source.metadata.productArtifacts?.art?.derivationHash??source.metadata.artifactHash),manufacturing:source.kind==='svg'});
   return await finish(art,extras,null);
  }finally{
   record.live=false;active.delete(record);
   const results=await Promise.allSettled(cleanup.reverse().map(f=>f()));
   const failed=results.find(r=>r.status==='rejected');if(failed&&owner.epoch===ownerEpoch)throw failed.reason;
  }
 }

 /** Two phases: derive/probe a prospective head; then explicit confirmation
  * returns one atomic delta. This helper never writes controller state. */
 async function prepareUpdate(input){
  const c=input.control??input,base=copy(input.state??context()?.state),g=await guardFor(c,base);
  need(typeof probeDatums==='function','PRODUCT_DATUM_PROBE_BINDINGS');
  let proposed=copy(input.prospectiveState??base);
  if(input.prospectiveState){
   proposed=copy(validateState(proposed));need(proposed.revision===base.revision+1,'PRODUCT_UPDATE_REVISION');
   const keep=s=>{const v=copy(s);delete v.parameters;delete v.schedule;delete v.product;delete v.revision;delete v.provenance;
    delete v.content.app.text;delete v.content.app.materials;delete v.content.app.materialDefaults;return v;};
   need(same(keep(proposed),keep(base)),'PRODUCT_UPDATE_SCOPE');proposed.revision=base.revision;
  }
  const parameterChanges=bounded(input.parameterChanges??[],16384,'PRODUCT_PARAMETER_CHANGE_LIMIT');
  if(parameterChanges.length){
   const p=domain.previewCommand(proposed,{id:'parameters.set',args:{changes:parameterChanges}});
   need(p.ok,'PRODUCT_PARAMETER_CHANGE_INVALID',{detail:copy(p)});
   proposed=copy(domain.commitPreview(proposed,p).state);proposed.revision=base.revision;
  }
  if(input.text!==undefined)proposed.content.app.text=normalizeTextEdit(proposed.content.app.text,bounded(input.text,16384,'PRODUCT_TEXT_EDIT_LIMIT'));
  proposed=copy(validateState(proposed));proposed.revision=base.revision;
  let source=sourceDescriptor(input.source??proposed.content.app.source);
  if(input.source&&!same(input.source,base.content.app.source))checkedSourceContext(source.metadata.sourceContext,base,source.metadata.sourceContext.operation);
  proposed.content.app.source=copy(source);proposed.sourceKind=source.kind;
  const assets=await checkedAssets(input.assets??context()?.assetsMap,source,g),newAssets=[];
  async function retain(asset){
   const bytes=new Uint8Array(asset.bytes),h=await sha256(bytes);g.check();
   if(!assets.has(h)){assets.set(h,bytes);newAssets.push({kind:asset.kind,sha256:h,bytes:new Uint8Array(bytes)});}
   if(!source.assetHashes.includes(h))source.assetHashes.push(h);return h;
  }
  const capture=await captureArtifactsFor(g.c,proposed,g,assets);g.check();
  for(const a of capture.assets)await retain(a);
  let art=source.metadata.productArtifacts?.art??null;
  if(!source.raster&&['text','emoji'].includes(source.kind)){
   const reply=await renderProspective('prepare.source',proposed,assets,g),p=reply.prepared;
   need(p?.svg instanceof Uint8Array,'PRODUCT_TEXT_OUTLINES_UNAVAILABLE');
   const framed=await manufacturingTextSVG(p.svg,p.svgExport);
   await retain({kind:'derived',bytes:p.svg});await retain({kind:'derived',bytes:framed.bytes});
   for(const a of p.sourceAssets??[]){need(await sha256(a.bytes)===a.record.sha256&&a.bytes.length===a.record.bytes,'PRODUCT_TEXT_SOURCE_HASH');await retain({kind:'dependency',bytes:a.bytes});}
   art=framed.descriptor;
   source.metadata={...source.metadata,artifactHash:hash(p.artifactHash),numericSvgHash:art.sha256,svgExport:copy(p.svgExport),
    sourceRecords:(p.sourceAssets??[]).map(a=>copy(a.record)),claims:copy(p.claims),parameters:copy(reply.parameters),assembly:copy(reply.assembly),
    originalText:p.geometry?.text?.originalText??source.metadata.originalText,normalizedText:p.geometry?.text?.text??source.metadata.normalizedText};
  }
  source.metadata.productArtifacts={version:ARTIFACTS,overlay:capture.overlay,...(art?{art}:{}),sourceTextStateHash:await sha256(canonicalJSON(proposed.content.app.text))};
  proposed.content.app.source=source;
  const changes=bounded(input.materialChanges??[],16384,'PRODUCT_MATERIAL_CHANGE_LIMIT');
  need(changes.length<=256&&new Set(changes.map(v=>v.materialId)).size===changes.length,'PRODUCT_MATERIAL_CHANGE_LIMIT');
  for(const change of changes){
   keys(change,['materialId','heightLayers']);
   const material=proposed.content.app.materials.find(m=>m.id===change.materialId);need(material,'PRODUCT_MATERIAL_UNAVAILABLE');
   integer(change.heightLayers,1,1000000,'PRODUCT_REGION_HEIGHT');
   const effective=domain.effectiveValues(proposed);
   need(effective.artMode==='noi'&&effective.splitObj===true,'PRODUCT_REGION_HEIGHT_INACTIVE',{materialId:change.materialId,artMode:effective.artMode,splitObj:effective.splitObj,required:'raised split material regions'});
   material.heightLayers=change.heightLayers;material.overridden=true;
  }
  const unresolved=(datum,count)=>({mode:5,origin:1,datum,referenceLayer:0xffffffff,layerCount:integer(Number(count),1,1000000,'PRODUCT_TEXT_LAYERS'),value:0});
  const t=proposed.content.app.text,active=overlayActive(proposed);
  if(t.asSource){
   need(source.kind==='text'&&source.metadata.originalText===t.text,'PRODUCT_TEXT_SOURCE_IDENTITY');
   source.metadata.productSourceRole={version:'arch-text-artwork-role/1',role:'artwork',textStateHash:await sha256(canonicalJSON(t)),manufacturingAuthority:'effective-product-parameters',retainedInactive:['heightLayers','baseEnabled','baseWidthMm','baseThicknessLayers','baseRadiusMm','placement','xMm','yMm']};
  }else delete source.metadata.productSourceRole;
  const texts=active?[{sourceKey:'text:primary',placement:t.placement==='on-model'?0:1,baseOn:t.baseEnabled,basePad:0,baseRound:Number(t.baseRadiusMm),
   height:unresolved(133,t.heightLayers),baseHeight:t.baseEnabled?unresolved(134,t.baseThicknessLayers):
    {mode:2,origin:0,datum:134,referenceLayer:0,layerCount:Number(t.baseThicknessLayers),value:0}}]:[];
  if(active)need(Number(t.baseWidthMm)===0,'PRODUCT_TEXT_ABSOLUTE_BASE_WIDTH_UNAVAILABLE');
  const textBindings={texts,eyeletTextKey:null,contextTextKeys:active?{'text:primary':'text:primary'}:{}};
  const adoption=await withCanonical({control:g.c,state:proposed,source,assets},async({canonicalContexts})=>{
   const bindingBase={...proposed,content:{...proposed.content,app:{...proposed.content.app,source:base.content.app.source}}};
   let first=await prepareBindings({projectId:g.ticket.projectId,state:bindingBase,source,canonicalContexts,textBindings,
    sourceMaterials:input.materials??proposed.content.app.materials,sourceMaterialDefaults:input.materialDefaults??proposed.content.app.materialDefaults,forDatumProbe:true});
   // Apply an explicit material height request to every mapped region. The
   // selection is by persistent source/material IDs, never a transient index.
   const b=copy(first.productBindings);let queries=texts.reduce((n,t)=>n+1+(t.baseOn?1:0),0);
   for(const region of b.regions)if(region.textKey===null){
    const m=first.materials.find(m=>m.id===region.materialId);
    const effective=domain.effectiveValues(proposed);
    if(m?.heightLayers!==undefined&&effective.artMode==='noi'&&effective.splitObj===true){region.height=unresolved(128,m.heightLayers);queries++;}
   }
   need(queries<=64,'PRODUCT_DATUM_PROBE_TARGET_LIMIT');
   const reboundSource={...source,metadata:{...source.metadata,productBindings:b}};
   const bindingState={...proposed,content:{...proposed.content,app:{...proposed.content.app,source:reboundSource,materials:copy(first.materials),materialDefaults:copy(first.materialDefaults)}}};
   const next=await prepareBindings({projectId:g.ticket.projectId,state:bindingState,source:reboundSource,canonicalContexts,textBindings,
    sourceMaterials:first.materials,sourceMaterialDefaults:first.materialDefaults,forDatumProbe:true});
   return {plan:next,queries,earlierProposals:first.proposals,earlierChanges:first.changes};
  },{adoption:true,prospectiveBase:base});
  g.check();const {plan,queries}=adoption;
  need(plan.diagnostics.length===0,'PRODUCT_UPDATE_BINDINGS_BLOCKED',{diagnostics:plan.diagnostics,proposals:plan.proposals});
  proposed.content.app.source=copy(plan.source);delete proposed.content.app.source.metadata.productEditLineage;proposed.content.app.materials=copy(plan.materials);proposed.content.app.materialDefaults=copy(plan.materialDefaults);
  proposed.revision=base.revision+1;
  const sourceAuthority=input.sourceAuthority===undefined?null:approvedSources.get(input.sourceAuthority);
  if(input.sourceAuthority!==undefined){need(sourceAuthority,'PRODUCT_PROSPECTIVE_SOURCE_AUTHORITY');sourceAuthority.check();sourceAuthority.refs++;}
  let native=null,faces=[],diagnostics=[],planeChoices=[];
  try{
   if(queries){
    native=await probeDatums({...g.c,control:g.c,state:base,prospectiveState:copy(proposed),assets,sourceAuthority:input.sourceAuthority});g.check();
    need(native?.version==='arch-product-datum-probe/1'&&native.metadata?.mechanicsSemantics===3&&native.metadata.sourceSemantics===2&&
     native.metadata.datumProbeVersion===1&&native.metadata.exportBlocked&&native.metadata.parts.length===0,'PRODUCT_DATUM_PROBE_REPLY');
    faces=native.metadata.sourceIntervals.filter(i=>i.mode===5).map(copy);
    diagnostics=[...native.metadata.sourceDiagnostics,...native.metadata.diagnostics].filter(d=>d.code>0&&d.code<100).map(copy);
    if(native.status==='proposal'){
     need(faces.length===queries&&faces.every(i=>i.conversionAvailable&&i.coordinateFrame==='manufacturing-z'),'PRODUCT_DATUM_PROBE_COVERAGE');
     const b=proposed.content.app.source.metadata.productBindings,ids=new Map(b.identityLedger.records.map(r=>[canonicalJSON([r.kind,r.key]),r.id]));
     const used=new Set();
     function resolve(record,id){
      if(record.mode!==5)return;
      const matches=faces.map((face,index)=>({face,index})).filter(({face})=>face.semanticId===id&&face.datum===record.datum);
      need(matches.length===1,'PRODUCT_DATUM_PROBE_COVERAGE');const {face,index}=matches[0];need(!used.has(index),'PRODUCT_DATUM_PROBE_COVERAGE');used.add(index);
      const faceNm=Math.round(face.z0*1e6);need(Math.abs(face.z0*1e6-faceNm)<1e-5&&BigInt(faceNm)===domain.decimalUnits(domain.layerBoundary(face.referenceLayer,proposed.schedule)),'PRODUCT_FACE_SCHEDULE_MISMATCH');
      record.mode=2;record.referenceLayer=face.referenceLayer;
     }
     for(const region of b.regions)if(region.height)resolve(region.height,ids.get(canonicalJSON(['region',region.sourceKey])));
     for(const text of b.texts){const id=ids.get(canonicalJSON(['text',text.sourceKey]));resolve(text.height,id);resolve(text.baseHeight,id);}
     need(used.size===faces.length,'PRODUCT_DATUM_PROBE_COVERAGE');
     b.heightBindingEvidence={version:'arch-product-height-bindings/1',basis:{baseHeadHash:g.fingerprint,nativeHead:copy(native.head),contextHash:native.contextHash,mechanicsSemantics:3,sourceSemantics:2},
      changes:faces,geometryVerified:false};
    }else{
     for(const face of faces.filter(f=>!f.conversionAvailable)){
      const nm=BigInt(Math.round(face.z0*1e6)),first=domain.decimalUnits(proposed.schedule.firstLayerHeight),step=domain.decimalUnits(proposed.schedule.layerHeight);
      const floor=nm<first?0:Number((nm-first)/step)+1;
      const field=proposed.product==='clicky'?'plateT':'baseH',before=domain.effectiveValues(proposed)[field];
      for(const [strategy,n]of [['floor',floor],['ceil',floor+1]]){
       const targetNm=domain.decimalUnits(domain.layerBoundary(n,proposed.schedule)),delta=Number(targetNm-nm)/1e6;
       // This is an explicit geometry-change option, not an accepted reference.
       const current=before.heightMode==='mm'?Number(before.mm):Number(domain.layerBoundary(before.layers+(before.referenceLayer??0),proposed.schedule))-Number(domain.layerBoundary(before.referenceLayer??0,proposed.schedule));
       const value={...copy(before),heightMode:'mm',mm:String(Math.round((current+delta)*1e6)/1e6)};delete value.layers;
       const edit={id:field,value},preview=domain.previewCommand(base,{id:'parameters.set',args:{changes:[...parameterChanges.filter(x=>x.id!==field),edit]}});
       planeChoices.push({strategy,datum:face.datum,semanticId:face.semanticId,faceZMm:face.z0,proposedFaceZMm:Number(targetNm)/1e6,deltaMm:delta,referenceLayer:n,
        parameterChanges:[...parameterChanges.filter(x=>x.id!==field),edit],domainValid:preview.ok,requiresNewNativeProbe:true,requiresExplicitGeometryConsent:true});
      }
     }
    }
   }
   const available=!native||native.status==='proposal';
   const stateHash=available?await domainStateFingerprint(proposed):null;
   const assetReferences=[...assets].map(([sha256,b])=>({sha256,bytes:b.length})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
   const payload=bounded({version:'arch-product-source-update/1',status:available?'proposal':'blocked',
    expected:{userId:g.ticket.userId,projectId:g.ticket.projectId,revision:base.revision,headHash:g.fingerprint,sessionKey:g.sessionKey},
    proposedStateHash:stateHash,nativeHead:native?.head??null,faces,diagnostics,planeChoices,parameterChanges,
    bindingProposals:[...adoption.earlierProposals,...plan.proposals],bindingChanges:[...adoption.earlierChanges,...plan.changes],assetReferences,
    requiresAtomicCommit:true,requiresExplicitConsent:true,requiresNativeRebuild:true,geometryVerified:false,fitQualification:'unqualified'},
    1048576,'PRODUCT_UPDATE_PROPOSAL_LIMIT');
   const proposalHash=await sha256(canonicalJSON(payload));g.check();let released=false,used=false;
   const release=()=>{if(!released){released=true;pendingUpdates.delete(release);native?.release();if(sourceAuthority){sourceAuthority.refs--;sourceAuthority.retire();}}};
   pendingUpdates.add(release);
   return Object.freeze({...freeze(payload),proposalHash,
    preview(){
     need(!released&&!used,'PRODUCT_PROPOSAL_CONSUMED');g.check();
     return {state:copy(proposed),assets:newAssets.map(a=>({...a,bytes:new Uint8Array(a.bytes)}))};
    },
    async replan(control,choiceIndex){
     need(!released&&!used&&!available,'PRODUCT_ALIGNMENT_PROPOSAL');g.check();tick(control);
     const choice=planeChoices[choiceIndex];need(Number.isSafeInteger(choiceIndex)&&choice?.domainValid&&choice.requiresNewNativeProbe,'PRODUCT_ALIGNMENT_CHOICE');
     need(control.ticket.userId===g.ticket.userId&&control.ticket.projectId===g.ticket.projectId&&control.ticket.revision===g.ticket.revision,'PRODUCT_PROPOSAL_HEAD');
     used=true;try{return await prepareUpdate({...input,control,parameterChanges:copy(choice.parameterChanges)});}finally{release();}
    },
    async confirm(control){
     need(!released&&!used,'PRODUCT_PROPOSAL_CONSUMED');used=true;
     try{
      tick(control);g.check();need(control.ticket.userId===g.ticket.userId&&control.ticket.projectId===g.ticket.projectId&&control.ticket.revision===g.ticket.revision,'PRODUCT_PROPOSAL_HEAD');
      need(available,'PRODUCT_DATUM_PROBE_BLOCKED');
      need(await domainStateFingerprint(proposed)===stateHash,'PRODUCT_PROPOSAL_MUTATED');
      const receipt=native?await native.confirm(control):null;g.check();
      return {version:'arch-product-source-update-commit/1',proposalHash,expected:copy(payload.expected),state:copy(proposed),nativeReceipt:receipt,
       source:copy(proposed.content.app.source),productBindings:copy(proposed.content.app.source.metadata.productBindings),materials:copy(proposed.content.app.materials),
       materialDefaults:copy(proposed.content.app.materialDefaults),text:copy(proposed.content.app.text),
       assets:newAssets.map(a=>({...a,bytes:new Uint8Array(a.bytes)})),requiresAtomicCommit:true,requiresNativeRebuild:true};
     }finally{release();}
    },release
   });
  }catch(error){native?.release();if(sourceAuthority){sourceAuthority.refs--;sourceAuthority.retire();}throw error;}
 }

 async function prepareAdoptionPlan(input){
  need(input?.purpose==='source'&&['import','convert'].includes(input.operation),'PRODUCT_SOURCE_ADOPTION_INPUT');
  const original=copy(input.source),state=copy(input.state);
  checkedSourceContext(original.metadata?.sourceContext,state,input.operation);
  need(same(input.sourceContext,original.metadata.sourceContext),'PRODUCT_SOURCE_CONTEXT');
  if(original.raster&&!original.metadata?.rasterPreparation||original.kind!=='svg'&&!original.raster&&!original.metadata?.numericSvgHash){
   // Source adoption can retain original color/bitmap artwork before its two
   // explicit conversion approvals. It does NOT claim a canonical graph/model.
   const g=await guardFor(input,state),source=sourceDescriptor(original);
   await checkedAssets(input.assets,source,g);
   const reason=source.raster?'RASTER_SEGMENTATION_APPROVAL_REQUIRED':'SOURCE_NUMERIC_OUTLINES_UNAVAILABLE';
   const productBindings={version:'arch-product-bindings-pending/1',projectId:input.ticket.projectId,
    sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash,reason,
    requiredAction:'source.convert-raster',canonicalGeometry:false,requiresExplicitSourceApproval:true};
   const materials=copy(input.materials??[]),defaults=copy(input.materialDefaults??[]);
   materialCoverage(materials,defaults);
   const payload={version:'arch-product-adoption-deferred/1',status:'deferred',expected:{projectId:input.ticket.projectId,revision:state.revision,headHash:g.fingerprint,sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash},
    productBindings,materials,materialDefaults:defaults,requiresCommit:true,geometryChanged:false,modelAvailable:false,
    diagnostics:[{code:'PRODUCT_SOURCE_CONVERSION_REQUIRED',reason,requiredAction:'source.convert-raster'}]};
   const result={...payload,adoptionHash:await sha256(canonicalJSON(payload))};g.check();
   need(same(input.source,original),'PRODUCT_SOURCE_DESCRIPTOR_CHANGED');return freeze(bounded(result,262144,'PRODUCT_ADOPTION_ENVELOPE_BUDGET'));
  }
  return withCanonical({...input,control:input},async({canonicalContexts,source,guard,control:c})=>{
   const g={c,check:guard},textBindings=await textBinding(c,state,source,canonicalContexts,g);guard();
   const plan=await prepareBindings({projectId:input.ticket.projectId,state,source,canonicalContexts,sourceMaterials:input.materials,
    sourceMaterialDefaults:input.materialDefaults,textBindings});guard();
   need(same(input.source,original),'PRODUCT_SOURCE_DESCRIPTOR_CHANGED');return plan;
  },{adoption:true});
 }
 async function prepareAdoption(input){
  const plan=await prepareAdoptionPlan(input);
  need(plan.status==='ready'||plan.status==='deferred',plan.status==='proposal'?'PRODUCT_ADOPTION_DECISION_REQUIRED':'PRODUCT_ADOPTION_BLOCKED',{plan});
  const result={version:VERSION,ticket:copy(input.ticket),productBindings:plan.productBindings,materials:plan.materials,materialDefaults:plan.materialDefaults};
  materialCoverage(result.materials,result.materialDefaults);
  for(const m of [...result.materials,...result.materialDefaults])if(m.product!==undefined)validateProductMaterialExtension(m.product);
  return freeze(bounded(result,PRODUCT_SOURCE_LIMITS.adoptionBytes,'PRODUCT_ADOPTION_ENVELOPE_BUDGET'));
 }
 async function invokeSource(method,c){
  if(c.purpose==='font')return sources.source[method](c);
  const plan=await captureArtifacts(c),reply=await sources.source[method](c);
  // selectEmoji supplies the immutable selection file beside its SourceResult.
  if(method==='selectEmoji')return {...reply,result:await captureSourceResult(c,reply.result,plan)};
  return captureSourceResult(c,reply,plan);
 }


 /** Source-only owned graph boundary for the source-SVG exporter. No product
  * request, domain height adapter, synthetic datum or mechanics model is used. */
 async function withValidatedRegions(input,consume){
  need(typeof consume==='function','PRODUCT_SOURCE_CONSUMER_REQUIRED');
  const c=input.control??input,state=copy(input.state??context()?.state),g=await guardFor(c,state);
  const source=sourceDescriptor(input.source??state.content.app.source);
  need(same(source,state.content.app.source),'PRODUCT_SOURCE_COMMITTED_REQUIRED');
  const assets=await checkedAssets(input.assets??context()?.assetsMap,source,g);
  const frame=input.frame??'manufacturing';
  need(['source','manufacturing'].includes(frame)&&typeof (input.includeOverlay??false)==='boolean','PRODUCT_SOURCE_FRAME');
  const owner=await kernel.ensureRuntime(g.c),ownerEpoch=owner.epoch;
  const versions=owner.serviceCapabilities?.geometryVersions;
  need(versions?.mechanicsAbi===2&&versions.mechanicsSemantics===3&&versions.sourceAbi===1&&versions.sourceSemantics===2&&versions.datumExtension===1,'PRODUCT_SOURCE_RUNTIME_VERSIONS');
  const leases=[],contexts=[];let points=0;
  const alive=()=>{g.check();need(owner.epoch===ownerEpoch,'PRODUCT_SOURCE_OWNER_CHANGED');};
  const snapshot=input.source??state.content.app.source;
  const frozenSource=canonicalJSON(snapshot);
  const guard=()=>{alive();need(canonicalJSON(input.source??input.state?.content.app.source??context().state.content.app.source)===frozenSource,'PRODUCT_SOURCE_DESCRIPTOR_CHANGED');};
  async function vector({key:contextKey,bytes,sourceHash,derivationHash=null,translationNm,originalNumericSvgHash=null,nativeToSourceMm=null,validation}){
   let lease=await kernel.operation(g.c,(client,generation)=>{
    need(client===owner,'PRODUCT_SOURCE_OWNER_CHANGED');
    return client.build({kind:'svg',source:dec.decode(bytes),thicknessMm:.2,longEdgeMm:0,toleranceMm:input.toleranceMm??.001},{generation});
   });leases.push(lease);guard();
   if(translationNm&&frameTransport==='source-frame/1')lease=await placeContext(lease,{translationNm},sourceHash,fn=>kernel.operation(g.c,(client,generation)=>{need(client===owner,'PRODUCT_SOURCE_OWNER_CHANGED');return fn(client,generation);}),l=>leases.push(l),guard);
   const canonical=await sourceGeometry({bytes:lease.bytes(),metadata:lease.metadata,key:contextKey,sourceHash,derivationHash,translationNm:frameTransport==='source-frame/1'?undefined:translationNm,includeRings:true,control:g.c});
   points+=canonical.regions.reduce((n,r)=>n+r.ringsNm.reduce((n,r)=>n+r.length,0),0);need(points<=PRODUCT_SOURCE_LIMITS.points,'PRODUCT_SOURCE_AGGREGATE_LIMIT');
   const entry={...canonical,kind:'svg',coordinateFrame:frame==='manufacturing'?'manufacturing-xy-mm':'parser-viewport-mm',
    nativeToSourceMm,originalNumericSvgHash,metadata:copy(lease.metadata),validation:copy(validation),sourceBytes:new Uint8Array(bytes)};
   contexts.push(Object.freeze(entry));guard();
  }
  async function fresh(op,stored,originalHash,overlay){
   const reply=await renderProspective(op,state,assets,g),p=reply.prepared;
   need(p?.svg instanceof Uint8Array&&p.svg.length<=PRODUCT_SOURCE_LIMITS.svgBytes,'PRODUCT_TEXT_OUTLINES_UNAVAILABLE');
   need(await sha256(p.svg)===originalHash,'PRODUCT_TEXT_ARTIFACT_FRESH_MISMATCH');guard();
   const actual=p.sourceAssets??[],declared=stored.sourceRecords??[];
   const byHash=rows=>rows.map(r=>({sha256:r.sha256,bytes:r.bytes})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
   need(new Set(declared.map(r=>r.sha256)).size===declared.length&&same(byHash(actual.map(a=>a.record)),byHash(declared)),'PRODUCT_TEXT_SOURCE_PROVENANCE');
   for(const a of actual)need(source.assetHashes.includes(a.record.sha256)&&assets.get(a.record.sha256)?.length===a.record.bytes&&await sha256(a.bytes)===a.record.sha256,'PRODUCT_TEXT_SOURCE_HASH');
   const framed=await manufacturingTextSVG(p.svg,p.svgExport,{overlay});guard();
   return {reply,framed,validation:{kind:'same-module-fresh-shaping-and-native-source',freshArtifactHash:p.artifactHash,originalNumericSvgHash:originalHash,sourceRecords:copy(declared),svgExport:copy(p.svgExport)}};
  }
  try{
   if(source.raster){
    return await sources.raster.prepareRecipe({...g.c,state,assets},async ready=>{
     guard();need(ready.status==='ready'&&ready.nativeSource?.kind==='raster-token'&&ready.nativeSource.epoch===ownerEpoch,'PRODUCT_RASTER_OWNER');
     const canonical=await rasterSourceGeometry({packet:ready.packet,key:'art',sourceHash:rasterContextHash(source,ready.preparation),derivationHash:ready.preparation.approvalHash,includeRings:true,control:g.c});
     points=canonical.regions.reduce((n,r)=>n+r.ringsNm.reduce((n,r)=>n+r.length,0),0);
     contexts.push(Object.freeze({...canonical,kind:'raster',coordinateFrame:'raster-working-mm-x-right-y-down',nativeToSourceMm:null,sourceBytes:new Uint8Array(assets.get(source.raw.hash)),
      metadata:copy({preparation:ready.preparation,receipt:ready.receipt,rasterFrame:sealedRasterFrame(ready.packet),widthMm:sealedRasterFrame(ready.packet).widthMm,heightMm:sealedRasterFrame(ready.packet).heightMm}),validation:{kind:'accepted-31-buffer-replay',runtimeAbi:1},
      packet:{version:ready.packet.version,buffers:ready.packet.buffers.map(r=>({kind:r.kind,bytes:new Uint8Array(r.bytes)}))}}));
     await overlays();return finish();
    });
   }
   if(source.kind==='svg')await vector({key:'art',bytes:assets.get(source.raw.hash),sourceHash:source.raw.hash,validation:{kind:'same-module-native-source'}});
   else{
    const old=source.metadata.productArtifacts?.art,originalHash=old?.originalNumericSvgHash??source.metadata.numericSvgHash;
    const {reply,framed,validation}=await fresh('prepare.source',source.metadata,originalHash,false);
    if(old)need(same(old,framed.descriptor)&&source.metadata.numericSvgHash===framed.descriptor.sha256,'PRODUCT_TEXT_FRAME_PROVENANCE');
    const bytes=frame==='manufacturing'?framed.bytes:reply.prepared.svg;
    await vector({key:'art',bytes,sourceHash:await sha256(bytes),derivationHash:framed.descriptor.derivationHash,originalNumericSvgHash:originalHash,
     nativeToSourceMm:frame==='source'?reply.prepared.svgExport.parserViewportToSourceMm:null,validation});
   }
   await overlays();return await finish();
  }finally{for(const lease of leases.reverse())lease.release();}
  async function overlays(){
   if(!input.includeOverlay||!overlayActive(state))return;
   const stored=source.metadata.productArtifacts?.overlay;
   need(stored?.frame?.originalNumericSvgHash,'PRODUCT_TEXT_ARTIFACT_CAPTURE_REQUIRED');
   need(stored.textStateHash===await sha256(canonicalJSON(state.content.app.text)),'PRODUCT_TEXT_ARTIFACT_STALE');
   const {reply,framed,validation}=await fresh('prepare.text',stored,stored.frame.originalNumericSvgHash,true);
   need(same(stored.frame,framed.descriptor)&&stored.svgHash===framed.descriptor.sha256,'PRODUCT_TEXT_FRAME_PROVENANCE');
   const bytes=frame==='manufacturing'?framed.bytes:reply.prepared.svg;
   await vector({key:stored.contextKey,bytes,sourceHash:await sha256(bytes),derivationHash:stored.derivationHash,
    translationNm:frame==='manufacturing'?framed.descriptor.translationNm:undefined,originalNumericSvgHash:stored.frame.originalNumericSvgHash,
    nativeToSourceMm:frame==='source'?reply.prepared.svgExport.parserViewportToSourceMm:null,validation});
  }
  async function finish(){
   guard();need(contexts.length<=33&&contexts.reduce((n,c)=>n+c.regions.length,0)<=256,'PRODUCT_SOURCE_REGION_LIMIT');
   const result=await consume(Object.freeze({version:'arch-validated-source-regions/1',source:freeze(copy(source)),state:freeze(copy(state)),
    headHash:g.fingerprint,sessionKey:g.sessionKey,mechanicsSemantics:3,sourceSemantics:2,frame,contexts:Object.freeze(contexts),
    assets:new Map([...assets].map(([h,b])=>[h,new Uint8Array(b)])),assertCurrent:guard,geometryVerified:false,totalErrorBoundMm:null}));
   try{guard();}catch(error){if(typeof result?.release==='function')await result.release();throw error;}return result;
  }
 }

 async function reset(){epoch++;for(const r of active)r.live=false;for(const release of [...pendingUpdates])release();for(const retire of [...activeAuthorities])retire();const settled=await Promise.allSettled([...retirements]);const failed=retirementFailed||settled.some(r=>r.status==='rejected');retirementFailed=false;need(!failed,'PRODUCT_SOURCE_RELEASE_FAILED');}
 async function acceptSourceProposal(c,consume=null){
  need(consume===null||typeof consume==='function','PRODUCT_SOURCE_CONSUMER_REQUIRED');
  if(!consume)return sources.source.acceptProposal(c);
  const g=await guardFor(c,c.state??context()?.state);
  if(c.confirmation?.kind!=='raster'){
   const accepted=await sources.source.acceptProposal(c);g.check();return consume(accepted);
  }
  return sources.raster.acceptProposal(c,async ready=>{
   g.check();const owner=await kernel.ensureRuntime(g.c),ownerEpoch=owner.epoch,sourceEpoch=epoch,base=copy(c.state??context().state);
   need(ready.nativeSource.epoch===ownerEpoch,'PRODUCT_RASTER_OWNER');
   // An independently owned planar SourceContext retains the same accepted
   // indexed graph while an explicit alignment choice is pending. No replay,
   // segmentation, numeric application pointer or persisted capability.
   const planar=await kernel.operation(g.c,(client,generation)=>{need(client===owner,'PRODUCT_RASTER_OWNER');return client.rasterOperation('buildSourceContext',{token:ready.nativeSource.token,thicknessMm:.2},{generation,epoch:ownerEpoch});});
   if(planar?.kind!=='raster-source-context'||typeof planar.token!=='string'){if(typeof planar?.token==='string')await owner.rasterRegistry('release',{token:planar.token},{epoch:ownerEpoch});need(false,'PRODUCT_RASTER_CONTEXT_REPLY');}
   const authority=Object.freeze({});let live=true,scope=true;
   const entry={ready:{...ready,contextBuilt:true,nativeSource:{kind:'raster-token',token:planar.token,epoch:ownerEpoch}},refs:0,baseHash:g.fingerprint,sessionKey:g.sessionKey,
    check(){const now=context();need(live&&sourceEpoch===epoch&&owner.epoch===ownerEpoch&&now?.sessionKey===g.sessionKey&&now?.userId===g.ticket.userId&&now?.projectId===g.ticket.projectId&&same(now.state,base),'PRODUCT_PROSPECTIVE_SOURCE_AUTHORITY');if(scope)g.check();},
    retire(){if(scope||entry.refs>0||!live)return;live=false;approvedSources.delete(authority);activeAuthorities.delete(force);
     const pending=Promise.resolve().then(()=>owner.rasterRegistry('release',{token:planar.token},{epoch:ownerEpoch}));retirements.add(pending);pending.then(()=>retirements.delete(pending),()=>{retirementFailed=true;retirements.delete(pending);});return pending;}
   };
   const force=()=>{entry.refs=0;scope=false;return entry.retire();};activeAuthorities.add(force);approvedSources.set(authority,entry);
   try{return await consume({version:ready.version,ticket:ready.ticket,confirmation:ready.confirmation,receipt:ready.receipt,sourceAuthority:authority});}
   finally{scope=false;await entry.retire();}
  });
 }
 const source=Object.freeze({...sources.source,ingest:c=>invokeSource('ingest',c),convert:c=>invokeSource('convert',c),
  selectEmoji:c=>invokeSource('selectEmoji',c),prepareAdoption,acceptProposal:acceptSourceProposal,
  async reset(){await reset();await sources.source.reset();}});
 return Object.freeze({version:PRODUCT_SOURCE_CONTEXTS_VERSION,source,captureArtifacts,captureSourceResult,prepareAdoptionPlan,prepareAdoption,prepareUpdate,withValidatedRegions,
  withPreparedSource:(args,consume)=>withCanonical(args,consume),
  withPreparedDatumSource:(args,consume)=>{need(args.baseState&&args.state.revision===args.baseState.revision+1,'PRODUCT_DATUM_PROBE_STATE');return withCanonical(args,consume,{prospectiveBase:args.baseState});},reset});
}
