// Hand-authored, axis-aligned solids. No triangulation/boolean implementation.
import {sealed,sha256} from '../src/contracts.mjs';
export function cube(x=0,y=0,z=0,size=10){
 const v=[0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1];
 const faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
 return {vertices:v.map((n,i)=>n*size+[x,y,z][i%3]),faces};
}
export function ring(){
 const xy=[[0,0],[20,0],[20,20],[0,20],[6,6],[14,6],[14,14],[6,14]];
 const vertices=[...xy.flatMap(([x,y])=>[x,y,0]),...xy.flatMap(([x,y])=>[x,y,2])],faces=[];
 const quad=(a,b,c,d)=>faces.push(a,b,c,a,c,d);
 for(let i=0;i<4;i++){const j=(i+1)%4;
  quad(i+8,j+8,j+12,i+12);quad(i,i+4,j+4,j);quad(i,j,j+8,i+8);quad(j+4,i+4,i+12,j+12);
 }
 return {vertices,faces};
}
export function meshScene(geometries){
 const vertices=[],faces=[],facePartIds=[],parts=[];
 for(const [index,g] of geometries.entries()){
  const offset=vertices.length/3,id='part-'+index;
  vertices.push(...g.vertices);faces.push(...g.faces.map(n=>n+offset));facePartIds.push(...Array(g.faces.length/3).fill(id));
  parts.push({id,name:'Phần '+index,materialId:'material-'+index});
 }
 return {state:'complete',revision:'analytic-v1',unit:'mm',vertices,faces,facePartIds,parts};
}
export async function request(profile,kind='adjacent',first){
 const payload=profile.payload;
 const gs=kind==='ring'?[ring()]:kind==='cube'?[cube()]:[cube(),cube(10)];
 const mesh=meshScene(gs);
 const materialTable={schemaVersion:1,materials:gs.map((_,i)=>({id:'material-'+i,name:'Vật liệu '+i,type:payload.settings.filament_type?.[i]??'PLA',
  color:payload.settings.filament_colour[i],slot:i+1,extruder:payload.printer.slotExtruders[i]}))};
 const source=JSON.stringify(gs);
 const schedule=await sealed({schemaVersion:1,kind:'constant-first-regular',profileId:payload.id,profileHash:profile.sha256,
  firstLayerHeight:first??Number(payload.settings.initial_layer_print_height),layerHeight:0.20,
  origin:{firstLayerHeight:first===undefined?'profile':'user',layerHeight:'user'}});
 return {schemaVersion:1,purpose:'inspection',revision:'analytic-v1',mesh,materialTable,printerProfile:profile,schedule,
  sourceHashes:[{id:'analytic-'+kind,sha256:await sha256(new TextEncoder().encode(source))}]};
}
