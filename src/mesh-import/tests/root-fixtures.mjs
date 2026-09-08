import {source,makeRequest} from '../../../tests/product-runtime/fixtures.mjs';
export {source};
const encoder=new TextEncoder();
export const mm=mm=>({heightMode:'mm',mm});
export function productFixture({sourceHash,headHash,product='keychain',extra=[]}){
 const changes=[{id:'size',value:40},{id:'offset',value:0},{id:'weld',value:0},{id:'cornerR',value:0},
  {id:'fillHoles',value:false},{id:'baseH',value:mm(6)},{id:'artH',value:mm(1)},...(product==='keychain'?[{id:'ringOn',value:false}]:[]),
  ...(product==='strap'?[{id:'strapCham',value:0},{id:'strapD',value:4},{id:'strapZ',value:3}]:[]),...extra];
 return makeRequest(product,'noi',{sourceHash,headHash,changes});
}
export const toolMaterial={id:'800',name:'Imported analytic tool',rgba:0x30353bff};
export const sourceMaterial={sourceMaterialId:'800',materialId:'800',slot:8,rgba:0x30353bff};
export function prism(points,z0,z1){
 const vertices=[...points.map(p=>[...p,z0]),...points.map(p=>[...p,z1])],n=points.length;
 // Only triangle/quadrilateral ANALYTIC TEST fixtures. No production parser
 // triangulation or general polygon/holes algorithm is implemented here.
 if(n!==3&&n!==4)throw Error('ANALYTIC_FIXTURE_ONLY');
 const triangles=[];
 for(let i=1;i<n-1;i++){triangles.push([0,i+1,i],[n,n+i,n+i+1]);}
 for(let i=0;i<n;i++){const j=(i+1)%n;triangles.push([i,j,n+j],[i,n+j,n+i]);}
 return {vertices,triangles};
}
export const triangle=()=>prism([[0,0],[2,0],[0,2]],0,3);
export function asciiSTL(mesh,name='analytic-prism'){
 return encoder.encode('solid '+name+'\n'+mesh.triangles.map(t=>'facet normal 0 0 0\nouter loop\n'+t.map(i=>'vertex '+mesh.vertices[i].join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid '+name+'\n');
}
export function binarySTL(mesh){
 const b=new Uint8Array(84+50*mesh.triangles.length),d=new DataView(b.buffer);d.setUint32(80,mesh.triangles.length,true);
 mesh.triangles.forEach((t,i)=>t.forEach((v,k)=>mesh.vertices[v].forEach((x,a)=>d.setFloat32(84+50*i+12+12*k+4*a,x,true))));return b;
}
export function obj(mesh,{name='analytic-prism',material='tool'}={}){
 return encoder.encode('o '+name+'\n'+mesh.vertices.map(p=>'v '+p.join(' ')).join('\n')+'\nusemtl '+material+'\n'+mesh.triangles.map(t=>'f '+t.map(i=>i+1).join(' ')).join('\n')+'\n');
}
export function affine(angle,x,y,z,scale=1){
 const a=angle*Math.PI/180,c=Math.cos(a)*scale,s=Math.sin(a)*scale;
 return [c,s,0,-s,c,0,0,0,scale,x,y,z];
}
export const identity=[1,0,0,0,1,0,0,0,1,0,0,0];
export function inputFixture(format='stl',encoding='ascii',mesh=triangle()){
 return {bytes:format==='obj'?obj(mesh):encoding==='binary'?binarySTL(mesh):asciiSTL(mesh),
  format,sourceId:'authored-analytic-import',name:'tool.'+format,unit:'millimeter',materials:[toolMaterial],
  ...(format==='obj'?{sourceMaterialAssignments:[{sourceName:'tool',materialId:'800'}]}:{partMaterialIds:['800']}),maxErrorMm:.002};
}
export function bindingInventory(arch,sem){
 const d=new DataView(arch.buffer,arch.byteOffset,arch.byteLength),po=d.getUint32(56,true),materials=[],bySlot=new Map();
 const bindings=sem.parts.map((p,i)=>{
  const rgba=d.getUint32(po+i*40+16,true),key=p.slot+':'+rgba;
  if(!bySlot.has(key)){bySlot.set(key,materials.length);materials.push({materialId:String(900+p.slot),slot:p.slot,rgba});}
  return {semanticId:String(10000+i),sourceId:p.sourceId,provenanceId:p.provenanceId,
   sourceIndex:d.getUint32(po+i*40+20,true),materialIndex:bySlot.get(key)};
 });
 let target=sem.parts.findIndex(p=>p.role===0);if(target<0)target=0;
 return {bindings,materials,targets:[bindings[target].semanticId],target};
}
export function commandFor(inventory,transform,operation){
 const {bindings,materials,targets}=structuredClone(inventory);
 return {featureId:'7001',operation,materialPolicy:'keepSelectedTargetMaterial',transform,bindings,materials,targets,
  queryToleranceCeilingMm:.002,limits:{vertices:100000,triangles:100000,parts:128,operations:2000000},separateImportedAssemblyGroup:2};
}
export function selectionFor(transform){
 return {unit:'millimeter',transform,materials:[sourceMaterial],sourceNumericId:'7002',provenanceNumericId:'7003',
  repair:'none',conditioning:'none'};
}

export function tilted(x=3,y=-2,z=1){
 const a=21*Math.PI/180,b=17*Math.PI/180,c=29*Math.PI/180;
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cc=Math.cos(c),sc=Math.sin(c);
 return [cc*cb,sc*cb,-sb,cc*sb*sa-sc*ca,sc*sb*sa+cc*ca,cb*sa,cc*sb*ca+sc*sa,sc*sb*ca-cc*sa,cb*ca,x,y,z];
}
export function squareTube(){
 const xy=[[0,0],[4,0],[4,4],[0,4],[1,1],[3,1],[3,3],[1,3]],vertices=[...xy.map(p=>[...p,0]),...xy.map(p=>[...p,1])],triangles=[];
 for(let i=0;i<4;i++){const j=(i+1)%4;
  triangles.push([i,j,j+8],[i,j+8,i+8],[i+4,j+12,j+4],[i+4,i+12,j+12],[i+8,j+8,j+12],[i+8,j+12,i+12],[i,j+4,j],[i,i+4,j+4]);
 }return {vertices,triangles};
}
export function extendedCases(){return [
 {name:'three-axis-stl-difference',input:inputFixture(),transform:tilted(),operation:'difference',expected:'published'},
 {name:'three-axis-obj-difference',input:inputFixture('obj'),transform:tilted(),operation:'difference',expected:'published'},
 {name:'rotated-holed-stl-difference',input:inputFixture('stl','ascii',squareTube()),transform:affine(27,3,-2,1),operation:'difference',expected:'published'},
 {name:'rotated-holed-obj-difference',input:inputFixture('obj','ascii',squareTube()),transform:affine(27,3,-2,1),operation:'difference',expected:'published'},
 {name:'signed-zero-transform',input:inputFixture(),transform:affine(0,3,-2,1),operation:'difference',expected:'published'},
];}
