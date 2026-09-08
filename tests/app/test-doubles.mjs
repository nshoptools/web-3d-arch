// TEST DOUBLES ONLY: analytical box kernel and binary STL writer, not production codecs.
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {VERSION,assert,decode} from '../../src/app/common.mjs';
import {effectiveValues,resolveFieldMm} from '../../src/domain/index.mjs';
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export function analyticalARCHBox(w,d,h,generation){
 const b=new Uint8Array(504),v=new DataView(b.buffer),u=(at,n)=>v.setUint32(at,n,true);
 [0x48435241,1,128,504,generation,8,12,1,0,0,0,0,128,320,464,504,504,504,504].forEach((n,i)=>u(i*4,n));
 new Float64Array(b.buffer,128,24).set([0,0,0,w,0,0,w,d,0,0,d,0,0,0,h,w,0,h,w,d,h,0,d,h]);
 new Uint32Array(b.buffer,320,36).set([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
 [0,8,0,12,0xff0000ff,0,0,0].forEach((n,i)=>u(464+i*4,n));v.setFloat64(496,w*d*h,true);readArchSnapshot(b);return b;
}
export async function testPNG(image){
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));assert(blob,'TEST_PNG_CAPABILITY');return new Uint8Array(await blob.arrayBuffer());
}
export function namedTestAdapters(){
 const controls={delay:null,fail:false,releases:[],models:[],downloads:[]};
 const engine={version:VERSION,identity:{id:'TEST-ONLY-analytical-cuboid',version:'1'},capabilities:[{id:'geometry.build',available:true}],
 async build({ticket,state}){
  if(controls.delay)await controls.delay.promise;if(controls.fail)throw Object.assign(new Error('Analytical injection'),{code:'TEST_BUILD_FAILURE'});
  const w=effectiveValues(state).size,h=resolveFieldMm(state,'baseH'),bytes=analyticalARCHBox(w,w/2,h,ticket.generation);let released=false;
  return {version:VERSION,ticket,generation:ticket.generation,leaseId:ticket.id,bytes(){assert(!released,'LEASE_RELEASED');return bytes;},stats:{widthMm:w,depthMm:w/2,heightMm:h,triangles:12,materialCount:1,verdict:'unverified'},blocks:[{id:'part-0',label:'Analytical TEST box',kind:'body',materialId:'red'}],release(){if(!released){released=true;controls.releases.push(ticket.id);}}};
 }};
 const source={version:VERSION,capabilities:[{id:'source.svg',available:true},{id:'source.edit',available:true}],
 async ingest({file,ticket}){
  assert(file.mediaType==='image/svg+xml'||file.mediaType==='image/png','TEST_SOURCE_TYPE');
  if(file.mediaType==='image/svg+xml')assert(decode(file.bytes).includes('<svg'),'TEST_SVG');
  return {version:VERSION,ticket,kind:file.mediaType==='image/svg+xml'?'svg':'raster',metadata:{testDouble:true},materials:[{id:'red',label:'Red test region',color:'#ff0000',slot:1,role:'region',overridden:false,backgroundEligible:true,excluded:false}]};
 }};
 const viewport={version:VERSION,capabilities:[{id:'viewport.webgl',available:false,reason:'Test recorder only'}],attach(){return ()=>{};},setModel(m){readArchSnapshot(m.lease.bytes());controls.models.push(m.revision);},setSelection(){},action(){},clear(){}};
 const exporter={version:VERSION,capabilities:[{id:'export.stl',available:true}],formats(){return [{id:'stl',label:'TEST analytical STL',extension:'stl',enabled:true,verdict:'unverified'}];},
 async export({model,ticket}){
  const s=readArchSnapshot(model.bytes()),bytes=new Uint8Array(84+s.triangles.length/3*50),d=new DataView(bytes.buffer);d.setUint32(80,s.triangles.length/3,true);
  for(let i=0;i<s.triangles.length;i+=3)for(let j=0;j<3;j++)for(let k=0;k<3;k++)d.setFloat32(84+i/3*50+12+j*12+k*4,s.vertices[s.triangles[i+j]*3+k],true);
  return {version:VERSION,ticket,bytes,mimeType:'model/stl',filename:'TEST-ONLY-cuboid.stl'};
 }};
 const download={async save(r){controls.downloads.push({...r,bytes:new Uint8Array(r.bytes)});}};
 return {controls,adapters:{engine,source,viewport,exporter,download,reset(){controls.resetCount=(controls.resetCount??0)+1;}}};
}
