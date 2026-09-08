import {FIELD_MAP} from '../kernel/mechanics/src/catalog-map.mjs';
const MAGIC=0x51525041,MAX_WIRE=2*1024*1024,MAX_META=8*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fields=new Map(FIELD_MAP.map(f=>[f.abiId,f]));
export class ProductOperationError extends Error{
 constructor(code,proposal=null){super(code);this.name='ProductOperationError';this.code=code;this.proposal=proposal;}
}
function need(v,c){if(!v)throw new ProductOperationError(c);}
const uint=(v,max=0xffffffff)=>{need(Number.isInteger(v)&&v>=0&&v<=max,'PRODUCT_U32');return v;};
const integer=v=>{need(typeof v==='bigint'||typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)||Number.isSafeInteger(v),'PRODUCT_U64');const n=BigInt(v);need(n>=0n&&n<=0xffffffffffffffffn,'PRODUCT_U64');return n;};
const finite=v=>{need(Number.isFinite(v),'PRODUCT_NONFINITE');return v;};
function hashBytes(h){need(typeof h==='string'&&/^[a-f0-9]{64}$/.test(h),'PRODUCT_HASH');return Uint8Array.from(h.match(/../g),x=>parseInt(x,16));}
const textJson=o=>encoder.encode(JSON.stringify(o,(_,v)=>typeof v==='bigint'?v.toString():v));
function param(d,o,r){
 need(r&&fields.has(r.fieldId)||r?.fieldId===0,'PRODUCT_PARAMETER_ID');
 [r.fieldId,r.mode,r.origin,r.datum,r.referenceLayer,r.layerCount].forEach((v,i)=>d.setUint32(o+4*i,uint(v),true));
 d.setFloat64(o+24,finite(r.value),true);d.setBigUint64(o+32,integer(r.provenanceId),true);
}
function material(d,o,m){
 [m.role,m.rgba,m.slot,m.origin].forEach((v,i)=>d.setUint32(o+4*i,uint(v),true));
 need(m.role<9&&m.slot>=1&&m.slot<=16&&(m.rgba&255)===255&&m.origin<=2,'PRODUCT_MATERIAL_DOMAIN');
 d.setBigUint64(o+16,integer(m.provenanceId),true);
}
/** Explicit source semantics. The source owner supplies IDs/mapping and applied
 * preparation bindings; this packer never invents them from colors/indices. */
export function packProductRequest({domainRecord:a,headHash,sourceHash,sourceId,provenanceId,
 regions,texts=[],materials,upstreamBindings,bevelOverrides=[],provenance,eyeletTextId=0n,
 sourceToleranceMm=.001,limits={},datumProbe=false}){
 need(a?.abiVersion===2&&a.product>=0&&a.product<5&&a.requiresSourceContext,'PRODUCT_DOMAIN_ADAPTER');
 need(Array.isArray(a.records)&&a.records.length<=128&&Array.isArray(regions)&&regions.length>=1&&regions.length<=256,'PRODUCT_INPUT_LIMIT');
 need(Array.isArray(materials)&&materials.length===9&&new Set(materials.map(m=>m.role)).size===9,'PRODUCT_EXPLICIT_ROLE_PALETTE');
 need(Array.isArray(upstreamBindings)&&upstreamBindings.length===7,'PRODUCT_UPSTREAM_BINDINGS_REQUIRED');
 need(texts.length<=32&&bevelOverrides.length<=1025,'PRODUCT_INPUT_LIMIT');
 need(provenance&&Array.isArray(provenance.regionSources)&&provenance.regionSources.length===regions.length,'PRODUCT_SOURCE_BINDINGS_REQUIRED');
 const evidence=textJson({...provenance,domainProvenance:a.provenance,inactive:a.inactive});
 need(evidence.length<=1024*1024,'PRODUCT_PROVENANCE_LIMIT');
 const total=256+a.records.length*40+materials.length*24+regions.length*112+texts.length*120+7*40+bevelOverrides.length*40+evidence.length;
 need(total<=MAX_WIRE,'PRODUCT_REQUEST_SIZE');const bytes=new Uint8Array(total),d=new DataView(bytes.buffer);
 [MAGIC,1,total,a.product,a.records.length,materials.length,regions.length,texts.length,7,bevelOverrides.length,evidence.length,
 limits.maxSlabs??1024,limits.maxPoints??200000,limits.maxOperations??100000,limits.maxMetadataBytes??MAX_META,datumProbe?1:0].forEach((v,i)=>d.setUint32(i*4,uint(v),true));
 d.setBigUint64(64,integer(a.revision),true);d.setBigUint64(72,integer(sourceId),true);d.setBigUint64(80,integer(provenanceId),true);d.setBigUint64(88,integer(eyeletTextId),true);
 bytes.set(hashBytes(sourceHash),96);bytes.set(hashBytes(headHash),128);
 const s=a.schedule;[s.version,s.firstSource,s.regularSource,0].forEach((v,i)=>d.setUint32(160+4*i,uint(v),true));
 d.setBigInt64(176,integer(s.firstNm),true);d.setBigInt64(184,integer(s.regularNm),true);d.setBigUint64(192,integer(s.provenanceId),true);
 [sourceToleranceMm,a.matingToleranceMm,a.exportToleranceMm].forEach((v,i)=>d.setFloat64(200+8*i,finite(v),true));
 let at=256;for(const r of a.records){param(d,at,r);at+=40;}
 for(const m of materials){material(d,at,m);at+=24;}
 for(const r of regions){
  d.setUint32(at,uint(r.sourceIndex),true);d.setUint32(at+4,uint(r.contextSlot??0,32),true);
  // zero count means all canonical contours of that exact source selector.
  [0,r.contourCount??0,r.fillRule??0,r.overrideHeight?1:0].forEach((v,i)=>d.setUint32(at+8+i*4,uint(v),true));
  [r.semanticId,r.provenanceId,r.textGroup??0n].forEach((v,i)=>d.setBigUint64(at+24+8*i,integer(v),true));
  material(d,at+48,r.material);
  if(r.height)param(d,at+72,r.height);else need(!r.overrideHeight,'PRODUCT_HEIGHT_OVERRIDE_REQUIRED');
  at+=112;
 }
 for(const t of texts){
  d.setBigUint64(at,integer(t.semanticId),true);d.setBigUint64(at+8,integer(t.provenanceId),true);
  d.setUint32(at+16,uint(t.placement,1),true);d.setUint32(at+20,uint(t.baseOn?1:0,1),true);
  d.setFloat64(at+24,finite(t.basePad),true);d.setFloat64(at+32,finite(t.baseRound),true);
  param(d,at+40,t.height);param(d,at+80,t.baseHeight);at+=120;
 }
 for(const p of upstreamBindings){param(d,at,p);at+=40;}
 for(const b of bevelOverrides){
  d.setBigUint64(at,integer(b.targetId),true);d.setBigUint64(at+8,integer(b.provenanceId),true);
  [b.enabled?1:0,b.shape,b.steps,b.origin].forEach((v,i)=>d.setUint32(at+16+i*4,uint(v),true));d.setFloat64(at+32,finite(b.radius),true);at+=40;
 }
 bytes.set(evidence,at);return bytes;
}
const STRIDES=[0,160,176,48,56,200,168,8,40,40,32,40,176,32,32,104,120,24,40,40,1,72,40,48,16,16];
/** Read typed APMS sidecar copied under its root lease. No triangle arrays here.
 * Offsets/counts validated independently before any string/table reads. */
export function readProductSemantics(bytes){
 need(bytes instanceof Uint8Array&&bytes.length>=656&&bytes.length<=MAX_META,'PRODUCT_METADATA_SIZE');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>d.getUint32(o,true),f=o=>d.getFloat64(o,true),q=o=>d.getBigUint64(o,true).toString();
 need(u(0)===0x534d5041&&u(4)===1&&u(8)===bytes.length&&u(12)===25,'PRODUCT_METADATA_VERSION');
 need(u(148)===3,'PRODUCT_MECHANICS_SEMANTICS');
 need(u(152)===2,'PRODUCT_SOURCE_SEMANTICS');
 const tables=new Map(),spans=[];for(let i=0;i<25;i++){
  const at=256+16*i,tag=u(at),stride=u(at+4),count=u(at+8),offset=u(at+12);
  need(tag>=1&&tag<=25&&!tables.has(tag)&&stride===STRIDES[tag]&&offset>=656&&offset%8===0&&offset+stride*count<=bytes.length,'PRODUCT_METADATA_TABLE');
  if(count)spans.push([offset,offset+count*stride]);tables.set(tag,{offset,stride,count});
 }
 spans.sort((a,b)=>a[0]-b[0]);need(spans.every((x,i)=>!i||x[0]>=spans[i-1][1]),'PRODUCT_METADATA_OVERLAP');
 const rows=(tag,fn)=>{const t=tables.get(tag);return Array.from({length:t.count},(_,i)=>fn(t.offset+i*t.stride,i));};
 const str=(o,n)=>{const a=bytes.subarray(o,o+n),end=a.indexOf(0);need(end>=0,'PRODUCT_METADATA_STRING');return decoder.decode(new Uint8Array(a.subarray(0,end)));};
 const readParam=o=>({fieldId:u(o),field:fields.get(u(o))?.id??null,mode:u(o+4),origin:u(o+8),datum:u(o+12),referenceLayer:u(o+16),layerCount:u(o+20),value:f(o+24),provenanceId:q(o+32)});
 const features=rows(2,o=>({id:str(o,96),kind:u(o+96),parameterId:u(o+100),role:u(o+104),group:u(o+108),sourceId:q(o+112),provenanceId:q(o+120),dimensions:Array.from({length:6},(_,i)=>f(o+128+8*i))}));
 const parts=rows(1,(o,index)=>{const fi=u(o);need(fi<features.length,'PRODUCT_FEATURE_INDEX');const feature=features[fi];
  return {meshPart:index,id:feature.id,featureIndex:fi,role:u(o+4),slot:u(o+8),origin:u(o+12),assemblyGroup:u(o+16),provenanceId:q(o+24),sourceId:feature.sourceId,previewTransform:Array.from({length:16},(_,i)=>f(o+32+8*i))};
 });
 const t=tables.get(20),provenance=JSON.parse(decoder.decode(new Uint8Array(bytes.subarray(t.offset,t.offset+t.count))));
 return Object.freeze({schema:'APMS/1',mechanicsAbi:2,mechanicsSemantics:u(148),sourceSemantics:u(152),datumProbeVersion:u(156),sourceVerdict:u(16),mechanicsVerdict:u(20),exportBlocked:!!u(24),fitQualification:'unqualified',
 revision:q(32),sourceId:q(40),provenanceId:q(48),product:u(56),sourceOperations:u(60),
 sourceToleranceMm:f(64),matingToleranceMm:f(72),exportToleranceMm:f(80),sourceTransform:Array.from({length:6},(_,i)=>f(88+8*i)),bodyDatumZ:f(136),
 totalErrorBoundMm:null,parts,features,
 curves:rows(3,o=>({featureIndex:u(o),segments:u(o+4),side:u(o+8),frame:u(o+12),radius:f(o+16),signedMin:f(o+24),signedMax:f(o+32),requestedTolerance:f(o+40)})),
 intervals:rows(4,o=>{const available=u(o+12)!==0xffffffff;return {fieldId:u(o),datum:u(o+4),mode:u(o+8),conversionAvailable:available,referenceLayer:available?u(o+12):null,z0:f(o+16),z1:f(o+24),floorDelta:available?f(o+32):null,ceilDelta:available?f(o+40):null,nearestDelta:available?f(o+48):null};}),
 diagnostics:rows(5,o=>({code:u(o),fieldId:u(o+4),message:str(o+8,192)})),
 proposals:rows(6,o=>({fieldId:u(o),field:fields.get(u(o))?.id??null,mode:u(o+4),datum:u(o+8),referenceLayer:u(o+12),before:f(o+16),after:f(o+24),applicable:u(o+32),reason:str(o+40,128)})),
 layerBoundaries:rows(7,f),parameters:rows(8,readParam),
 sourceContacts:rows(9,o=>({slabA:u(o),slabB:u(o+4),kind:u(o+8),areaMm2:f(o+16),z0:f(o+24),z1:f(o+32)})),
 lineage:rows(10,o=>({sourceId:q(o),slabId:q(o+8),materialProvenanceId:q(o+16),stage:u(o+24),band:u(o+28)})),
 sourceIntervals:rows(11,o=>{const available=u(o+12)!==0xffffffff;return {fieldId:u(o),datum:u(o+4),mode:u(o+8),conversionAvailable:available,referenceLayer:available?u(o+12):null,semanticId:q(o+16),z0:f(o+24),z1:f(o+32),coordinateFrame:'manufacturing-z'};}),
 sourceDiagnostics:rows(12,o=>({code:u(o),fieldId:u(o+4),semanticId:q(o+8),message:str(o+16,160)})),
 sourceProposals:rows(13,o=>({fieldId:u(o),semanticId:q(o+8),before:f(o+16),proposed:f(o+24)})),
 sourceErrors:rows(14,o=>({stage:u(o),segments:u(o+4),radius:f(o+8),signedMinMm:f(o+16),signedMaxMm:f(o+24)})),
 inputRegions:rows(15,o=>({ringStart:u(o),ringCount:u(o+4),fillRule:u(o+8),overrideHeight:!!u(o+12),semanticId:q(o+16),provenanceId:q(o+24),textGroup:q(o+32),material:{role:u(o+40),rgba:u(o+44),slot:u(o+48),origin:u(o+52),provenanceId:q(o+56)},height:readParam(o+64)})),
 inputTexts:rows(16,o=>({semanticId:q(o),provenanceId:q(o+8),placement:u(o+16),baseOn:!!u(o+20),basePad:f(o+24),baseRound:f(o+32),height:readParam(o+40),baseHeight:readParam(o+80)})),
 provenance,tables,bytes});
}
export function readProductHead(b){
 need(b instanceof Uint8Array&&b.length===192,'PRODUCT_HEAD_SIZE');const d=new DataView(b.buffer,b.byteOffset,b.byteLength);
 need(d.getUint32(0,true)===0x44485250&&d.getUint32(4,true)===1&&d.getUint32(8,true)===192,'PRODUCT_HEAD_VERSION');
 const hex=(at,n=32)=>Array.from(b.subarray(at,at+n),x=>x.toString(16).padStart(2,'0')).join('');
 return {revision:d.getBigUint64(16,true).toString(),sourceGeneration:d.getUint32(24,true),product:d.getUint32(28,true),sourceHash:hex(32),canonicalSourceHash:hex(64),requestHash:hex(96),headHash:hex(128),proposalHash:hex(160)};
}
export function packProductConfirmation(descriptor,{headHash,revision}){
 readProductHead(descriptor);const b=new Uint8Array(232);b.set(descriptor);b.set(hashBytes(headHash),192);new DataView(b.buffer).setBigUint64(224,integer(revision),true);return b;
}
/** All calls stay on one existing Worker/module. No fetch or second factory.
 * The caller resets a fresh root generation before prepare/build/confirm. */
export function createProductOperations(Module){
 need(Module?._arch_abi_version?.()===2&&Module._arch_product_abi_version?.()===1,'PRODUCT_RUNTIME_UNAVAILABLE');
 const error=()=>decoder.decode(new Uint8Array(Module.HEAPU8.subarray(Module._arch_error_ptr(),Module._arch_error_ptr()+Module._arch_error_len())))||'PRODUCT_OPERATION_FAILED';
 const input=b=>{need(b instanceof Uint8Array&&b.byteLength>0&&b.byteLength<=16*1024*1024,'PRODUCT_INPUT_SIZE');const id=Module._arch_input_create(b.byteLength);need(id,'INPUT_ALLOCATION_FAILED');Module.HEAPU8.set(b,Module._arch_input_ptr(id));return id;};
 const copy=(id,kind)=>{const n=Module._arch_product_buffer_len(id,kind),p=Module._arch_product_buffer_ptr(id,kind);need(n<=MAX_META&&(!n||p&&p+n<=Module.HEAPU8.length),'PRODUCT_BUFFER_ABI');return new Uint8Array(Module.HEAPU8.subarray(p,p+n));};
 const failure=()=>{const code=error(),id=Module._arch_product_last_proposal();let proposal=null;
  if(id){try{proposal={id,semanticBytes:copy(id,1),descriptor:copy(id,4),sourceMetadata:JSON.parse(decoder.decode(copy(id,3)))};readProductSemantics(proposal.semanticBytes);readProductHead(proposal.descriptor);}
   catch(e){Module._arch_product_proposal_release(id);throw e;}}
  throw new ProductOperationError(code,proposal);
 };
 return Object.freeze({
  prepare(recipe,generation){
   need(recipe?.kind==='product'&&recipe.packed instanceof Uint8Array,'PRODUCT_RECIPE');
   const s=recipe.source;need(s&&['svg','raster','snapshot','contexts'].includes(s.kind),'PRODUCT_SOURCE_KIND');
   let req=0,src=0;try{
    req=input(recipe.packed);let id=0;
    if(s.kind==='svg'){need(typeof s.source==='string','PRODUCT_SVG_SOURCE');src=input(encoder.encode(s.source));
     id=Module._arch_product_prepare_svg(src,req,s.thicknessMm??.2,s.longEdgeMm??0,s.toleranceMm??.001,generation);}
    else if(s.kind==='raster')id=Module._arch_product_prepare_raster(uint(s.acceptedHandle),req,s.thicknessMm??.2,generation);
    else if(s.kind==='contexts'){
     need(Array.isArray(s.contexts)&&s.contexts.length>=1&&s.contexts.length<=33,'PRODUCT_CONTEXTS_LIMIT');
     const v=s.contexts.some(c=>c.translationNm!==undefined)?2:1,stride=v===2?56:40;
     const block=new Uint8Array(8+stride*s.contexts.length),d=new DataView(block.buffer);d.setUint32(0,v,true);d.setUint32(4,s.contexts.length,true);
     s.contexts.forEach((c,i)=>{const at=8+i*stride;d.setUint32(at,uint(c.id),true);d.setUint32(at+4,uint(c.generation),true);block.set(hashBytes(c.sourceHash),at+8);
      if(v===2){const t=c.translationNm??['0','0'];need(Array.isArray(t)&&t.length===2,'PRODUCT_CONTEXT_TRANSLATION');
       t.forEach((value,j)=>{need(typeof value==='string'&&/^-?(0|[1-9][0-9]{0,10})$/.test(value)&&value!=='-0','PRODUCT_CONTEXT_TRANSLATION');
        const n=BigInt(value);need(n>=-10000000000n&&n<=10000000000n,'PRODUCT_CONTEXT_TRANSLATION_RANGE');d.setBigInt64(at+40+j*8,n,true);});}
     });
     src=input(block);id=Module._arch_product_prepare_contexts(src,req,generation);
    }
    else id=Module._arch_product_request_create(uint(s.id),uint(s.generation),req);
    if(!id)failure();return id;
   }finally{if(src)Module._arch_input_release(src);if(req)Module._arch_input_release(req);}
  },
  buildRequest(request,generation){const id=Module._arch_product_build(request,generation);if(!id)failure();return id;},
  probeRequest(request,generation){
   need(Module._arch_product_datum_probe_version?.()===1,'PRODUCT_DATUM_PROBE_UNAVAILABLE');
   const result=Module._arch_product_datum_probe(request,generation);need(result===0,'PRODUCT_DATUM_PROBE_NO_MODEL');
   const code=error(),id=Module._arch_product_last_proposal();need(code==='PRODUCT_DATUM_PROBE'&&id,code);
   try{const proposal={id,semanticBytes:copy(id,1),descriptor:copy(id,4),sourceMetadata:JSON.parse(decoder.decode(copy(id,3)))};
    const sem=readProductSemantics(proposal.semanticBytes);need(sem.datumProbeVersion===1&&sem.parts.length===0&&sem.exportBlocked,'PRODUCT_DATUM_PROBE_REPLY');return proposal;
   }catch(e){Module._arch_product_proposal_release(id);throw e;}
  },
  releaseRequest(id){return Module._arch_product_request_release(id);},
  metadata(id){
   const semanticBytes=copy(id,1),descriptor=copy(id,4);readProductSemantics(semanticBytes);readProductHead(descriptor);
   return {semanticBytes,descriptor,sourceMetadata:JSON.parse(decoder.decode(copy(id,3)))};
  },
  releaseProposal(id){return Module._arch_product_proposal_release(id);},
  confirm(id,descriptor,current,generation){
   let inp=0,out=0;try{inp=input(packProductConfirmation(descriptor,current));out=Module._arch_product_confirm(id,inp,1,generation);if(!out)throw new ProductOperationError(error());
    const p=Module._arch_output_ptr(out),n=Module._arch_output_len(out);need(n===192&&p&&p+n<=Module.HEAPU8.length,'PRODUCT_RECEIPT_ABI');return new Uint8Array(Module.HEAPU8.subarray(p,p+n));
   }finally{if(inp)Module._arch_input_release(inp);if(out)Module._arch_output_release(out);}
  }
 });
}
