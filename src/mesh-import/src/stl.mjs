import {STLLoader} from 'three/addons/loaders/STLLoader.js';
export const STL_LIMITS=Object.freeze({bytes:64_000_000,faces:400_000,parts:128});
export const UNITS=Object.freeze({millimeter:[1,1],centimeter:[2,10],inch:[3,25.4],foot:[4,304.8],meter:[5,1000],micron:[6,.001]});
export class ImportError extends Error {constructor(code){super(code);this.name='ImportError';this.code=code;}}
export function check(ok,code){if(!ok)throw new ImportError(code);}
const number=/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const ws=/[ \t\r\n]*/y;
function asciiPreflight(bytes){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 check(text.startsWith('solid')&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text),'STL_ASCII_ENCODING');
 let at=0,faces=0,conversionError=0;const groups=[],identities=new Map();
 function space(){ws.lastIndex=at;ws.exec(text);at=ws.lastIndex;}
 function word(w){space();check(text.startsWith(w,at),'STL_GRAMMAR');at+=w.length;check(at===text.length||/[ \t\r\n]/.test(text[at]),'STL_GRAMMAR');}
 function num(coordinate=false){
  space();number.lastIndex=at;const match=number.exec(text);check(match&&match[0].length<=128,'STL_NUMBER');
  at=number.lastIndex;check(at===text.length||/[ \t\r\n]/.test(text[at]),'STL_NUMBER');
  const n=Number(match[0]);check(Number.isFinite(n)&&Number.isFinite(Math.fround(n)),'STL_NONFINITE');
  if(coordinate)check(match[0].split(/[eE]/)[0].replace(/[+.-]/g,'').replace(/^0+/,'').replace(/0+$/,'').length<=15,'STL_DECIMAL_PRECISION_UNSUPPORTED');
  if(coordinate)conversionError=Math.max(conversionError,Math.abs(Math.fround(n)-n)+Math.abs(n)*4*Number.EPSILON);
  return n;
 }
 while(at<text.length){
  const header=/solid[ \t]*([^\r\n]*)\r?\n/y;header.lastIndex=at;const h=header.exec(text);
  check(h,'STL_SOLID_HEADER');at=header.lastIndex;
  const name=h[1].trim();check(name.length<=256&&!/solid|facet|vertex|normal|loop/.test(name),'STL_NAME_UNSUPPORTED');
  const first=faces;space();
  while(text.startsWith('facet',at)){
   check(++faces<=STL_LIMITS.faces,'STL_FACE_BOUND');
   word('facet');word('normal');for(let k=0;k<3;k++)num();
   word('outer');word('loop');
   for(let i=0;i<3;i++){
    word('vertex');const source=[num(true),num(true),num(true)],rounded=source.map(Math.fround).join(','),exact=source.join(',');
    check(!identities.has(rounded)||identities.get(rounded)===exact,'STL_PRECISION_TOPOLOGY_COLLISION');
    identities.set(rounded,exact);check(identities.size<=1_000_000,'STL_VERTEX_BOUND');
   }
   word('endloop');word('endfacet');space();
  }
  check(faces>first,'STL_EMPTY_SOLID');
  const tail=/endsolid[ \t]*([^\r\n]*)(?:\r?\n|$)/y;tail.lastIndex=at;const t=tail.exec(text);
  check(t&&(!t[1].trim()||t[1].trim()===name),'STL_ENDSOLID');at=tail.lastIndex;space();
  groups.push({name,start:first*3,count:(faces-first)*3});
  check(groups.length<=STL_LIMITS.parts,'STL_PART_BOUND');
 }
 check(faces>0,'STL_EMPTY');
 return {encoding:'ascii',faces,groups,conversionError};
}
export function decodeSTL(bytes){
 check(bytes instanceof Uint8Array&&bytes.byteLength>=84&&bytes.byteLength<=STL_LIMITS.bytes,'STL_BYTE_BOUND');
 // Exact binary length takes precedence even when its 80-byte header says "solid".
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint32(80,true);
 let preflight;
 if(84+50*count===bytes.length){
  check(count>0&&count<=STL_LIMITS.faces,'STL_FACE_BOUND');
  const header=new TextDecoder('latin1').decode(bytes.subarray(0,80));
  check(!header.includes('COLOR='),'STL_COLOR_EXTENSION_UNSUPPORTED');
  for(let f=0;f<count;f++){
   const at=84+50*f;check(view.getUint16(at+48,true)===0,'STL_ATTRIBUTE_EXTENSION_UNSUPPORTED');
   for(let k=0;k<12;k++)check(Number.isFinite(view.getFloat32(at+4*k,true)),'STL_NONFINITE');
  }
  preflight={encoding:'binary',faces:count,groups:[{name:'',start:0,count:count*3}],conversionError:0};
 }else preflight=asciiPreflight(bytes);
 const array=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.slice().buffer;
 const geometry=new STLLoader().parse(array);
 try{
  const positions=geometry.getAttribute('position')?.array;
  check(positions instanceof Float32Array&&positions.length===preflight.faces*9,'STL_LIBRARY_COUNT_MISMATCH');
  check(!geometry.hasColors&&!geometry.getAttribute('color'),'STL_COLOR_EXTENSION_UNSUPPORTED');
  if(preflight.encoding==='ascii'){
   check(geometry.groups.length===preflight.groups.length,'STL_LIBRARY_GROUP_MISMATCH');
   for(let i=0;i<preflight.groups.length;i++){
    const a=preflight.groups[i],b=geometry.groups[i];check(a.start===b.start&&a.count===b.count,'STL_LIBRARY_GROUP_MISMATCH');
   }
  }
  return {...preflight,positions,decoder:'three/STLLoader@0.185.1',indexing:'exact-coordinate-only'};
 }finally{geometry.dispose();}
}
