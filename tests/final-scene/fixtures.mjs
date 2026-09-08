// Analytic test fixtures only; never imported by production composition.
export function box(min=[0,0,0],max=[1,1,1]){
 const vertices=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(p=>p.map((v,i)=>min[i]+v*(max[i]-min[i])));
 const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
 return {vertices,faces};
}
export function tetra(){return {vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]};}
export function arch(input,{separateParts=true,generation=7}={}){
 const meshes=Array.isArray(input)?input:[input],vertices=[],faces=[],parts=[];
 for(const m of meshes){const vs=vertices.length,fs=faces.length;vertices.push(...m.vertices);faces.push(...m.faces.map(f=>f.map(i=>i+vs)));parts.push({vs,vc:m.vertices.length,fs,fc:m.faces.length});}
 if(!separateParts)parts.splice(0,parts.length,{vs:0,vc:vertices.length,fs:0,fc:faces.length});
 const counts=[vertices.length,faces.length,parts.length,0,0,0,0],strides=[24,12,40,16,16,4,16],align=[8,4,8,8,4,4,4],offsets=[];let length=128;
 for(let i=0;i<7;i++){length=Math.ceil(length/align[i])*align[i];offsets.push(length);length+=counts[i]*strides[i];}
 const bytes=new Uint8Array(length),d=new DataView(bytes.buffer);
 [0x48435241,1,128,length,generation,...counts,...offsets].forEach((v,i)=>d.setUint32(i*4,v,true));
 vertices.forEach((p,i)=>p.forEach((v,k)=>d.setFloat64(offsets[0]+24*i+8*k,v,true)));
 faces.forEach((f,i)=>f.forEach((v,k)=>d.setUint32(offsets[1]+12*i+4*k,v,true)));
 parts.forEach((p,i)=>{[p.vs,p.vc,p.fs,p.fc,0xff0000ff,i,0,0].forEach((v,k)=>d.setUint32(offsets[2]+40*i+4*k,v,true));d.setFloat64(offsets[2]+40*i+32,1,true);});
 return bytes;
}
export function stl(mesh){const b=new Uint8Array(84+50*mesh.faces.length),d=new DataView(b.buffer);d.setUint32(80,mesh.faces.length,true);
 mesh.faces.forEach((f,i)=>f.forEach((n,j)=>mesh.vertices[n].forEach((v,k)=>d.setFloat32(84+50*i+12+12*j+4*k,v,true))));return b;}
export const reverse=m=>({...m,faces:m.faces.map(f=>[f[0],f[2],f[1]])});
