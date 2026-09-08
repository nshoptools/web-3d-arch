export const VERSION='arch-text-source/1';
export const LIMITS=Object.freeze({
  fontBytes:16000000,assetBytes:16000000,cacheBytes:64000000,fonts:4,
  graphemes:500,textCodeUnits:16000,lines:64,runs:128,glyphs:4096,
  pathCommands:100000,paintOperations:65536,paintDepth:32,gradientStops:2048,
  maxEdge:1280,maxPixels:1638400,maxCoordinateMm:10000,svgBytes:1048576,
  maxJobs:256,maxWork:5000000,
});
export class SourceError extends Error {
  constructor(code,message,details={}){super(message);this.name='SourceError';this.code=code;this.details=details;}
}
export const fail=(code,message,details)=>{throw new SourceError(code,message,details);};
export function record(v,name){
  if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail('INVALID_INPUT',name+' must be a plain record');
  return v;
}
export function keys(v,allowed,name){record(v,name);for(const k of Object.keys(v))if(!allowed.includes(k))fail('INVALID_INPUT','Unknown '+name+' field '+k);}
export function finite(v,min,max,name,integer=false){
  if(!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))fail('INVALID_INPUT',name+' outside bounds',{min,max});return v;
}
export function string(v,max,name){
  if(typeof v!=='string'||v.length>max)fail('INVALID_INPUT',name+' must be a bounded string');return v;
}
export function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(v))fail('INVALID_INPUT','Invalid identifier');return v;}
export function sha(v){if(typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))fail('INVALID_INPUT','Expected lowercase SHA-256');return v;}
export function choice(v,list,name){if(!list.includes(v))fail('INVALID_INPUT','Invalid '+name,{allowed:list});return v;}
export function ownedBytes(bytes,max=LIMITS.assetBytes){
  if(bytes instanceof ArrayBuffer)bytes=new Uint8Array(bytes);
  if(!(bytes instanceof Uint8Array)||!(bytes.buffer instanceof ArrayBuffer)||bytes.buffer.resizable||!bytes.byteLength||bytes.byteLength>max)
    fail('RESOURCE_LIMIT','Expected bounded, nonshared, non-resizable bytes');
  return new Uint8Array(bytes);
}
export async function hash(bytes){
  if(!globalThis.crypto?.subtle)fail('CORE_UNAVAILABLE','Web Crypto required');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
}
export const hashRecord=v=>hash(new TextEncoder().encode(JSON.stringify(v)));
export function token(v){keys(v,['sourceId','revision'],'expected');return {sourceId:id(v.sourceId),revision:finite(v.revision,0,Number.MAX_SAFE_INTEGER-1,'revision',true)};}
export const sameToken=(a,b)=>a.sourceId===b.sourceId&&a.revision===b.revision;
export function dimensions(width,height){
  finite(width,1,LIMITS.maxEdge,'width',true);finite(height,1,LIMITS.maxEdge,'height',true);
  if(width*height>LIMITS.maxPixels)fail('RESOURCE_LIMIT','Raster pixel budget');return width*height;
}
export function color(c=[0,0,0,255]){
  if(!Array.isArray(c)||(c.length!==3&&c.length!==4))fail('INVALID_INPUT','Expected RGB[A] bytes');
  return [0,1,2,3].map(i=>finite(i===3&&c.length===3?255:c[i],0,255,'channel',true));
}
export function fontEntry(v){
  record(v,'font catalog entry');id(v.id);sha(v.sha256);finite(v.bytes,1,LIMITS.fontBytes,'font bytes',true);
  finite(v.unitsPerEm,16,16384,'unitsPerEm',true);finite(v.glyphCount,1,1000000,'glyphCount',true);
  if(Object.keys(v.axes??{}).length>32)fail('RESOURCE_LIMIT','Font axis count limit');
  for(const [tag,a] of Object.entries(v.axes??{})){
    if(!/^[ -~]{4}$/.test(tag))fail('INVALID_INPUT','Invalid axis tag');
    finite(a.min,-1000000,1000000,'axis.min');finite(a.max,a.min,1000000,'axis.max');finite(a.default,a.min,a.max,'axis.default');
  }
  return structuredClone(v);
}
export function variations(v={},entry){
  record(v,'variations');const out={...entry.defaultVariation,...v};
  for(const [tag,axis] of Object.entries(entry.axes??{}))out[tag]??=axis.default;
  for(const [tag,value] of Object.entries(out)){
    const a=entry.axes?.[tag];if(!a)fail('INVALID_VARIATION','Unknown variation '+tag);
    if(!Number.isFinite(value)||value<a.min||value>a.max)fail('INVALID_VARIATION','Out of range variation '+tag);
  }
  return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export function outline(commands,work){
  if(!Array.isArray(commands)||commands.length>LIMITS.pathCommands)fail('RESOURCE_LIMIT','Outline size limit');
  let open=false;const arity={M:2,L:2,Q:4,C:6,Z:0};
  for(const c of commands){
    if(!(c.type in arity)||!Array.isArray(c.values)||c.values.length!==arity[c.type])fail('INVALID_GEOMETRY','Invalid path command');
    c.values.forEach(v=>finite(v,-10000000,10000000,'font coordinate'));
    if(c.type==='M'){if(open)fail('INVALID_GEOMETRY','Unclosed contour');open=true;}
    else if(!open)fail('INVALID_GEOMETRY','Path without move');
    else if(c.type==='Z')open=false;
  }
  if(open)fail('INVALID_GEOMETRY','Unclosed contour');
  if(work){work.commands+=commands.length;if(work.commands>LIMITS.pathCommands)fail('RESOURCE_LIMIT','Total path command limit');}
  return commands;
}
export function transform(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
export function multiply(a,b){return [
  a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5],
];}
export function emptyBounds(){return {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};}
export function extendBounds(b,x,y){finite(x,-LIMITS.maxCoordinateMm,LIMITS.maxCoordinateMm,'X mm');finite(y,-LIMITS.maxCoordinateMm,LIMITS.maxCoordinateMm,'Y mm');b.minX=Math.min(b.minX,x);b.minY=Math.min(b.minY,y);b.maxX=Math.max(b.maxX,x);b.maxY=Math.max(b.maxY,y);}
export function finishBounds(b){return Number.isFinite(b.minX)?{...b,width:b.maxX-b.minX,height:b.maxY-b.minY,kind:'conservative-control-hull'}:null;}
export class Work {
  constructor(expected,options={},cancelled=()=>false){
    keys(options,['signal','onProgress','isCurrent','yieldControl','maxWork'],'control');
    this.expected=expected;this.options=options;this.cancelled=cancelled;this.work=0;this.commands=0;
    this.maxWork=finite(options.maxWork??LIMITS.maxWork,1,LIMITS.maxWork,'maxWork',true);
    for(const k of ['onProgress','isCurrent','yieldControl'])if(options[k]!==undefined&&typeof options[k]!=='function')fail('INVALID_INPUT','Invalid callback '+k);
  }
  check(){
    if(this.options.signal?.aborted||this.cancelled())fail('CANCELLED','Source preparation cancelled');
    if(this.options.isCurrent&&this.options.isCurrent({...this.expected})!==true)fail('STALE_SOURCE','Source revision changed');
  }
  async step(n,phase){
    this.check();this.work+=n;if(this.work>this.maxWork)fail('RESOURCE_LIMIT','Source work budget exceeded');
    this.options.onProgress?.({phase,work:this.work,maxWork:this.maxWork});
    await (this.options.yieldControl?.()??new Promise(r=>setTimeout(r,0)));this.check();
  }
}
export function translateFontError(error){
  if(error instanceof SourceError)throw error;
  const reason=String(error?.message??error);
  const code=/Missing glyph/.test(reason)?'MISSING_GLYPH':/variation/.test(reason)?'INVALID_VARIATION':/integrity/.test(reason)?'HASH_MISMATCH':'FONT_READER_ERROR';
  fail(code,reason);
}
