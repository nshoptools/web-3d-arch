/** Exact LE wire schema for root ABI2/raster ABI1, document2. No runtime instantiation. */
export class RasterError extends Error {
  constructor(code, message=code, details={}) { super(message); this.name='RasterError'; this.code=code; this.details=details; }
}
export function check(ok, code='RASTER_SCHEMA', message=code) { if (!ok) throw new RasterError(code,message); }
export const MAX_PACKET_BYTES=64*1024*1024;
export const DEFAULT_OPTIONS=Object.freeze({k:4,res:520,smooth:3,minA:5,denoise:1,eps:35,tension:65,longEdgeMm:45,alpha:Object.freeze({policy:'reject-partial'}),palette:Object.freeze([]),backgroundLabels:Object.freeze([])});
export const DEFAULT_LIMITS=Object.freeze({maxSourceBytes:16777216,maxDimension:32768,maxDecodedPixels:4194304,maxDecodedBytes:33554432,maxMetadataBytes:1048576,maxWorkingBytes:100663296,maxProcessingPixels:1638400,maxUniqueColors:262144,maxVertices:1000000,maxEdges:2000000,maxRegions:100000,maxWorkUnits:250000000});
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
const U32MAX=0xffffffff, HASH=/^[a-f0-9]{64}$/;
export function hex(bytes) { return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''); }
export function hashBytes(s) { check(typeof s==='string'&&HASH.test(s),'RASTER_HASH'); return Uint8Array.from(s.match(/../g),x=>parseInt(x,16)); }
export function integer(n,min,max,code='RASTER_OPTIONS') { check(Number.isSafeInteger(n)&&n>=min&&n<=max,code); return n; }
export function record(o,keys,code='RASTER_OPTIONS') {
  check(o&&[Object.prototype,null].includes(Object.getPrototypeOf(o)),code);
  for(const key of Reflect.ownKeys(o)) {
    const d=Object.getOwnPropertyDescriptor(o,key);
    check(typeof key==='string'&&keys.includes(key)&&d.enumerable&&'value' in d,code);
  }
}
function rgb(v) { check(Array.isArray(v)&&v.length===3,'RASTER_OPTIONS'); return v.map(x=>integer(x,0,255)); }
export function normalizeOptions(value={}) {
  record(value,Object.keys(DEFAULT_OPTIONS));
  const o={...DEFAULT_OPTIONS,...value};
  for(const [k,min,max] of [['k',2,16],['smooth',0,6],['minA',0,100],['denoise',0,3],['eps',0,100],['tension',0,100]]) integer(o[k],min,max);
  check([360,520,720,960,1280].includes(o.res),'RASTER_OPTIONS');
  check(Number.isFinite(o.longEdgeMm)&&o.longEdgeMm>0&&o.longEdgeMm<=10000,'RASTER_OPTIONS');
  record(o.alpha,['policy','cutoff','matte']);
  if(o.alpha.policy==='reject-partial') { check(Object.keys(o.alpha).length===1,'RASTER_OPTIONS'); o.alpha={policy:'reject-partial'}; }
  else if(o.alpha.policy==='threshold') { check(Object.keys(o.alpha).length===2&&!('matte' in o.alpha),'RASTER_OPTIONS'); o.alpha={policy:'threshold',cutoff:integer(o.alpha.cutoff,1,255)}; }
  else { check(o.alpha.policy==='matte'&&Object.keys(o.alpha).length===2&&!('cutoff' in o.alpha),'RASTER_OPTIONS'); o.alpha={policy:'matte',matte:rgb(o.alpha.matte)}; }
  check(Array.isArray(o.palette)&&o.palette.length<=o.k,'RASTER_OPTIONS');
  o.palette=o.palette.map(rgb); check(new Set(o.palette.map(v=>v.join(','))).size===o.palette.length,'RASTER_OPTIONS');
  check(Array.isArray(o.backgroundLabels)&&o.backgroundLabels.length<=16,'RASTER_OPTIONS');
  o.backgroundLabels=o.backgroundLabels.map(x=>integer(x,1,16)); check(new Set(o.backgroundLabels).size===o.backgroundLabels.length,'RASTER_OPTIONS');
  return o;
}
export function normalizeLimits(value={}) {
  record(value,Object.keys(DEFAULT_LIMITS),'RASTER_LIMITS'); const result={...DEFAULT_LIMITS,...value};
  for(const key of Object.keys(result)) integer(result[key],1,DEFAULT_LIMITS[key],'RASTER_LIMITS'); return result;
}
const packedRGB=v=>v[0]|v[1]<<8|v[2]<<16;
export function encodeOptions(value={},origin=null) {
  const o=normalizeOptions(value), b=new Uint8Array(200), d=new DataView(b.buffer);
  const alpha=['reject-partial','threshold','matte'].indexOf(o.alpha.policy);
  const words=[2,200,2,o.k,o.res,o.smooth,o.minA,o.denoise,o.eps,o.tension,alpha,o.alpha.cutoff??0,o.alpha.matte?packedRGB(o.alpha.matte):0,o.palette.length,o.backgroundLabels.length,origin?1:0];
  words.forEach((x,i)=>d.setUint32(i*4,x,true)); d.setFloat64(64,o.longEdgeMm,true);
  o.palette.forEach((x,i)=>d.setUint32(72+i*4,packedRGB(x),true));
  o.backgroundLabels.forEach((x,i)=>d.setUint32(136+i*4,x,true)); return b;
}
export function encodeLimits(value={}) {
  const o=normalizeLimits(value), b=new Uint8Array(104), d=new DataView(b.buffer);
  d.setUint32(0,1,true);d.setUint32(4,104,true);
  Object.values(o).forEach((v,i)=>d.setBigUint64(8+i*8,BigInt(v),true));return b;
}
export function encodeOrigin(o=null) {
  if(o===null)return new Uint8Array();
  record(o,['sourceHash','settingsHash','renderer','confirmationId'],'RASTER_ORIGIN');
  const strings=[o.renderer,o.confirmationId].map(s=>{check(typeof s==='string'&&!s.includes('\0'),'RASTER_ORIGIN');const b=encoder.encode(s);check(b.length>0&&b.length<=256,'RASTER_ORIGIN');check(decodeText(b)===s,'RASTER_ORIGIN');return b;});
  const b=new Uint8Array(72+strings[0].length+strings[1].length),d=new DataView(b.buffer);
  b.set(hashBytes(o.sourceHash));b.set(hashBytes(o.settingsHash),32);
  d.setUint32(64,strings[0].length,true);d.setUint32(68,strings[1].length,true);
  b.set(strings[0],72);b.set(strings[1],72+strings[0].length);return b;
}
export function decodeText(b) { try { return decoder.decode(b); } catch { throw new RasterError('RASTER_UTF8'); } }
export function view(b) { return new DataView(b.buffer,b.byteOffset,b.byteLength); }
export function equalBytes(a,b) { if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true; }
export function freeze(v) { if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v; }
export function decodeOptions(b) {
  check(b.length===200);const d=view(b),u=i=>d.getUint32(i,true),p=i=>{const n=u(i);check(n<=0xffffff);return [n&255,n>>>8&255,n>>>16&255];};
  check(u(0)===2&&u(4)===200&&u(8)===2&&u(60)<=1&&u(52)<=16&&u(56)<=16);
  const alpha=u(40)===0?{policy:'reject-partial'}:u(40)===1?{policy:'threshold',cutoff:u(44)}:{policy:'matte',matte:p(48)};
  check(u(40)<=2);
  const options=normalizeOptions({k:u(12),res:u(16),smooth:u(20),minA:u(24),denoise:u(28),eps:u(32),tension:u(36),longEdgeMm:d.getFloat64(64,true),alpha,palette:Array.from({length:u(52)},(_,i)=>p(72+i*4)),backgroundLabels:Array.from({length:u(56)},(_,i)=>u(136+i*4))});
  check(equalBytes(b,encodeOptions(options,u(60)?{}:null)));return {options,originKind:u(60)};
}
export function decodeLimits(b) {
  check(b.length===104);const d=view(b);check(d.getUint32(0,true)===1&&d.getUint32(4,true)===104);
  const o={};Object.keys(DEFAULT_LIMITS).forEach((k,i)=>{const n=d.getBigUint64(8+i*8,true);check(n<=BigInt(DEFAULT_LIMITS[k]));o[k]=Number(n);});return normalizeLimits(o);
}
export function decodeOrigin(b) {
  if(!b.length)return null;check(b.length>=74&&b.length<=584);const d=view(b),a=d.getUint32(64,true),c=d.getUint32(68,true);check(72+a+c===b.length);
  const o={sourceHash:hex(b.subarray(0,32)),settingsHash:hex(b.subarray(32,64)),renderer:decodeText(b.subarray(72,72+a)),confirmationId:decodeText(b.subarray(72+a))};
  check(equalBytes(encodeOrigin(o),b));return o;
}
export function decodeSummary(b) {
  check(b.length===256); const d=view(b),u=i=>d.getUint32(i,true),f=i=>d.getFloat64(i,true),n=i=>d.getBigUint64(i,true).toString();
  check(u(0)===0x50534152&&u(4)===2&&u(8)===256&&u(12)<=2&&u(20)<=31&&u(76)===1048576&&u(248)===1&&u(252)===0);
  const s={schema:2,status:['ready','empty','requires-confirmation'][u(12)],publicationGeneration:u(16),flags:u(20),accepted:!!(u(20)&16),encoded:!!(u(20)&1),confirmedRender:!!(u(20)&2),constrainedIdentity:!!(u(20)&4),requiresConfirmation:!!(u(20)&8),
    inputWidth:u(24),inputHeight:u(28),width:u(32),height:u(36),materials:u(40),regions:u(44),rawVertices:u(48),rawEdges:u(52),vertices:u(56),edges:u(60),loops:u(64),chains:u(68),curves:u(72),unitsPerPixel:u(76),
    widthMm:f(80),heightMm:f(88),mmPerPixelX:f(96),mmPerPixelY:f(104),derivedErrorBoundMm:f(112),totalLinfUnits:n(120),
    proposalHash:hex(b.subarray(128,160)),originalRGBAHash:hex(b.subarray(160,192)),sourceHash:hex(b.subarray(192,224)),
    workUnits:n(224),estimatedWorkingBytes:n(232),attenuation:u(240),rejectedTrials:u(244),boundDomain:'final-label-grid-before-root-quantization'};
  integer(s.publicationGeneration,1,0xfffffffe,'RASTER_SCHEMA');
  for(const v of [s.inputWidth,s.inputHeight])integer(v,1,32768,'RASTER_SCHEMA');
  check(s.inputWidth*s.inputHeight<=4194304);
  for(const v of [s.width,s.height])integer(v,1,1280,'RASTER_SCHEMA');
  check(s.width<=s.inputWidth&&s.height<=s.inputHeight&&s.materials<=16&&s.regions<=100000&&s.rawVertices<=1000000&&s.vertices<=1000000&&s.rawEdges<=2000000&&s.edges<=2000000&&s.loops<=2000000&&s.chains<=2000000&&s.curves<=2000000);
  for(const v of [s.widthMm,s.heightMm,s.mmPerPixelX,s.mmPerPixelY])check(Number.isFinite(v)&&v>0&&v<=10000);
  check(Number.isFinite(s.derivedErrorBoundMm)&&s.derivedErrorBoundMm>=0&&(!s.accepted||!s.requiresConfirmation));
  const near=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,a,b);
  check(near(s.width*s.mmPerPixelX,s.widthMm)&&near(s.height*s.mmPerPixelY,s.heightMm));return freeze(s);
}
const TEXT_TAGS={1:'semantics',2:'geometryAlgorithm',3:'paletteAlgorithm',4:'resamplingAlgorithm',13:'comparisonDomain',15:'boundaryAlgorithm',16:'rootQuantizationPolicy',18:'decoder',19:'certificateAlgorithm',20:'colorInterpretation',21:'colorNote',26:'coordinates',27:'sourceQuantizationNote'};
export function decodeMetadata(b) {
  check(b.length<=1048576,'RASTER_METADATA_LIMIT');
  const out={diagnostics:[],confirmationReasons:[],rejectedTrials:[],ledger:[],unknownTags:[]},seen=new Set();let pos=0,records=0;
  while(pos<b.length) {
    check(++records<=4096&&pos+8<=b.length);const h=view(b.subarray(pos)),tag=h.getUint16(0,true),flags=h.getUint16(2,true),n=h.getUint32(4,true),end=pos+8+n,next=Math.ceil(end/8)*8;
    check(end<=b.length&&next<=b.length&&flags<=1&&tag>0);for(let i=end;i<next;i++)check(b[i]===0);
    check(!seen.has(tag)||[5,6,7,14].includes(tag));seen.add(tag);
    const p=b.subarray(pos+8,end),d=view(p),u=i=>d.getUint32(i,true),s=i=>d.getBigUint64(i,true).toString(),f=i=>{const x=d.getFloat64(i,true);check(Number.isFinite(x)&&x>=0);return x;},exact=x=>check(n===x),words=count=>{exact(count*8);return Array.from({length:count},(_,i)=>s(i*8));};
    if(TEXT_TAGS[tag])out[TEXT_TAGS[tag]]=decodeText(p);
    else if(tag===5) {check(n>=8&&u(0)+u(4)+8===n);out.diagnostics.push({code:decodeText(p.subarray(8,8+u(0))),message:decodeText(p.subarray(8+u(0)))});}
    else if(tag===6)out.confirmationReasons.push(decodeText(p));
    else if(tag===7)out.rejectedTrials.push(decodeText(p));
    else if(tag===8){exact(8);check(u(0)<=8&&u(4)<=1);out.orientation={exif:u(0)||null,applied:!!u(4)};}
    else if(tag===9)out.geometryLedger=words(8);
    else if(tag===10)out.decisions=words(12);
    else if(tag===11){exact(32);out.topology={components:u(0),loops:u(4),holes:u(8),junctions:u(12),intersectionPairs:s(16),nestingTests:s(24)};}
    else if(tag===12){exact(32);out.comparison={changedPixels:s(0),alphaChangedPixels:s(8),maxError:f(16),meanSquaredError:f(24)};}
    else if(tag===14){check(n>=24&&u(0)<=1&&u(12)===0&&24+u(4)+u(8)===n);const bound=f(16);check(u(0)||bound===0);out.ledger.push({boundMm:u(0)?bound:null,stage:decodeText(p.subarray(24,24+u(4))),note:decodeText(p.subarray(24+u(4)))});}
    else if(tag===17){exact(16);check(u(0)<=3&&u(12)<=1);out.source={format:['rgba','png','jpeg','webp'][u(0)],encodedWidth:u(4),encodedHeight:u(8),downsampled:!!u(12)};}
    else if(tag===22){exact(8);check(u(0)<=1&&u(4)<=1);out.color={declaredSrgb:!!u(0),requiresConfirmation:!!u(4)};}
    else if(tag===23){exact(32);out.crateProposalHash=hex(p);}
    else if(tag===24){exact(32);check(u(16)<=1);const bound=f(24);check(u(16)||bound===0);out.errorDomain={boundaryApproximationPx:f(0),processingPixelDiagonalMm:f(8),sourceBoundMm:u(16)?bound:null,paletteIterations:u(20)};}
    else if(tag===25){exact(24);out.rootQuantization={radiusDyadic:s(0),checkedPairs:s(8),perAxisBoundMm:f(16)};}
    else {check(!(flags&1),'RASTER_CRITICAL_TLV');out.unknownTags.push({tag,flags,byteLength:n});}
    pos=next;
  }
  for(const tag of [1,2,3,4,8,9,10,11,12,13,15,16,17,19,23,24,25,26,27])check(seen.has(tag));
  check(out.semantics==='raster-parameters-proposal-v2','RASTER_SEMANTICS');return freeze(out);
}
export function bufferMap(packet) {
  check(packet?.version==='arch-raster-packet/1'&&Array.isArray(packet.buffers)&&packet.buffers.length===31);
  const map=new Map(),owners=new Set();let total=0;
  for(let i=0;i<31;i++){const row=packet.buffers[i];check(row?.kind===i+1&&row.bytes instanceof Uint8Array&&row.bytes.buffer instanceof ArrayBuffer&&row.bytes.byteOffset===0&&row.bytes.byteLength===row.bytes.buffer.byteLength);check(!owners.has(row.bytes.buffer),'RASTER_OWNERSHIP');owners.add(row.bytes.buffer);total+=row.bytes.byteLength;check(total<=MAX_PACKET_BYTES,'RASTER_OUTPUT_BUDGET');map.set(i+1,row.bytes);}
  return map;
}
/** Structural/cross-reference validation; native topology certificate remains authoritative. */
export function validatePacket(packet) {
  const b=bufferMap(packet),s=decodeSummary(b.get(1)),m=decodeMetadata(b.get(18));
  const expected={1:256,3:s.inputWidth*s.inputHeight*4,4:s.width*s.height*4,5:s.width*s.height*4,6:s.width*s.height*2,8:s.rawVertices*8,9:s.rawEdges*24,10:s.vertices*16,11:s.vertices*4,12:s.edges*32,13:s.loops*16,15:s.chains*32,17:s.curves*48,20:200,21:104,23:s.regions*48,30:s.loops*16,28:s.vertices*16};
  for(const [kind,size] of Object.entries(expected))check(b.get(Number(kind)).length===size);
  const strides={7:24,14:4,16:4,19:32,24:16,25:4,26:8,27:4,29:4};
  for(const [kind,stride] of Object.entries(strides))check(b.get(Number(kind)).length%stride===0);
  check(b.get(2).length<=16777216&&b.get(31).length<=1048576&&s.encoded===!!b.get(2).length);
  const {options,originKind}=decodeOptions(b.get(20)),limits=decodeLimits(b.get(21)),origin=decodeOrigin(b.get(22));
  check(originKind===Number(!!origin)&&s.confirmedRender===!!origin&&(!origin||origin.sourceHash===s.sourceHash)&&!(s.encoded&&origin));
  check(m.source.format==='rgba'?!s.encoded:s.encoded);
  const words=k=>new Uint32Array(b.get(k).buffer),labels=new Uint16Array(b.get(6).buffer);
  // Typed array convenience is little-endian only; DataView above always handles the wire.
  check(new Uint8Array(new Uint32Array([1]).buffer)[0]===1,'RASTER_ENDIAN');
  const palette=words(7),validLabels=new Set([0]);
  check(palette.length<=16*6);
  for(let i=0;i<palette.length;i+=6){check(palette[i]>=1&&palette[i]<=16&&!validLabels.has(palette[i])&&palette[i+1]>>>24===255);validLabels.add(palette[i]);}
  for(const label of labels)check(validLabels.has(label));
  const regions=words(23),regionLabels=new Map();let pixelSum=0;
  for(let i=0;i<regions.length;i+=12){
    check(!regionLabels.has(regions[i])&&regions[i]!==U32MAX&&regions[i+1]>0&&validLabels.has(regions[i+1])&&regions[i+3]===0&&regions[i+8]<=1&&regions[i+11]===0);
    check(regions[i+4]<=regions[i+6]&&regions[i+6]<=s.width&&regions[i+5]<=regions[i+7]&&regions[i+7]<=s.height);
    regionLabels.set(regions[i],regions[i+1]);pixelSum+=regions[i+2];
    check(regions[i+9]+regions[i+10]<=b.get(24).length/16);
  }
  check(pixelSum<=labels.length);
  const incidence=(ll,rl,lr,rr)=>{check(validLabels.has(ll)&&validLabels.has(rl)&&ll!==rl);check(lr===U32MAX?ll===0:regionLabels.get(lr)===ll);check(rr===U32MAX?rl===0:regionLabels.get(rr)===rl);};
  const rawXY=words(8);for(let i=0;i<rawXY.length;i+=2)check(rawXY[i]<=s.width&&rawXY[i+1]<=s.height);
  for(const [kind,stride,count] of [[9,6,s.rawVertices],[12,8,s.vertices]]){const a=words(kind);for(let i=0;i<a.length;i+=stride){check(a[i]<count&&a[i+1]<count&&a[i]!==a[i+1]);incidence(...a.subarray(i+2,i+6));if(kind===12)check(a[i+6]<s.chains&&a[i+7]===0);}}
  for(const x of words(11))check(x===U32MAX||x<s.rawVertices);
  for(const x of words(14))check(x<s.vertices);
  const loops=words(13),indices=words(14);let endIndex=0;
  for(let i=0;i<loops.length;i+=4){const [start,count,region,label]=loops.subarray(i,i+4);check(start===endIndex&&count>=4&&start+count<=indices.length&&indices[start]===indices[start+count-1]&&regionLabels.get(region)===label);endIndex=start+count;}check(endIndex===indices.length);
  const chains=words(15);let edgeEnd=0,sourceEnd=0,curveEnd=0;
  for(let i=0;i<chains.length;i+=8){const [e,ec,r,rc,c,cc,component,reserved]=chains.subarray(i,i+8);check(e===edgeEnd&&ec>0&&e+ec<=s.edges&&r===sourceEnd&&rc>0&&r+rc<=b.get(16).length/4&&c===curveEnd&&c+cc<=s.curves&&component<m.topology.components&&reserved===0);edgeEnd=e+ec;sourceEnd=r+rc;curveEnd=c+cc;}
  check(edgeEnd===s.edges&&sourceEnd===b.get(16).length/4&&curveEnd===s.curves);
  for(const k of [16,25])for(const x of words(k))check(Math.floor(x/2)<s.rawEdges);
  for(const x of words(27))check(x<s.rawVertices);
  for(const x of words(29))check(Math.floor(x/2)<s.chains);
  const rawLoops=words(24);for(let i=0;i<rawLoops.length;i+=4)check(rawLoops[i]+rawLoops[i+1]<=b.get(25).length/4&&rawLoops[i+1]>=4&&regionLabels.get(rawLoops[i+2])===rawLoops[i+3]);
  const ranges=words(30);for(let i=0;i<ranges.length;i+=4)check(regionLabels.has(ranges[i])&&ranges[i+2]+ranges[i+3]<=b.get(29).length/4);
  const adjacent=words(26);for(let i=0;i<adjacent.length;i+=2)check(validLabels.has(adjacent[i])&&validLabels.has(adjacent[i+1])&&adjacent[i]<adjacent[i+1]);
  const mm=new BigInt64Array(b.get(28).buffer),xy=new BigInt64Array(b.get(10).buffer);
  for(let i=0;i<mm.length;i++){check(mm[i]>=-10000000000n&&mm[i]<=10000000000n);check(xy[i]>=0n&&xy[i]<=BigInt(i%2?s.height:s.width)*1048576n);}
  check(m.topology.loops===s.loops);
  return {summary:s,metadata:m,options:freeze(options),limits:freeze(limits),origin:freeze(origin)};
}
export function readableSummary(summary,metadata) {
  return freeze({proposalHash:summary.proposalHash,status:summary.status,accepted:summary.accepted,width:summary.width,height:summary.height,widthMm:summary.widthMm,heightMm:summary.heightMm,materials:summary.materials,regions:summary.regions,vertices:summary.vertices,curves:summary.curves,derivedErrorBoundMm:summary.derivedErrorBoundMm,boundDomain:summary.boundDomain,sourceBoundMm:metadata.errorDomain.sourceBoundMm,
    orientation:metadata.orientation,semantics:metadata.semantics,geometryAlgorithm:metadata.geometryAlgorithm,
    confirmationReasons:metadata.confirmationReasons.slice(0,32).map(s=>s.slice(0,1500)),omittedReasons:Math.max(0,metadata.confirmationReasons.length-32),
    diagnostics:metadata.diagnostics.slice(0,32).map(d=>({code:d.code.slice(0,128),message:d.message.slice(0,1500)})),omittedDiagnostics:Math.max(0,metadata.diagnostics.length-32)});
}
