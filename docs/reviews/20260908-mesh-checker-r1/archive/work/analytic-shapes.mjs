// Independent analytical generators. No supplied geometry fixture is imported.
export function prism(polygon,z0=0,z1=1){
 const n=polygon.length,vertices=polygon.map(([x,y])=>[x,y,z0]).concat(polygon.map(([x,y])=>[x,y,z1])),faces=[];
 for(let i=1;i<n-1;i++){faces.push([0,i+1,i],[n,n+i,n+i+1]);}
 for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,n+j],[i,n+j,n+i]);}
 return {vertices,faces};
}
export const cuboid=(a=[0,0,0],b=[2,3,5])=>prism([[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]],a[2],b[2]);
export const invert=m=>({vertices:m.vertices.map(p=>p.slice()),faces:m.faces.map(([a,b,c])=>[a,c,b])});
export const join=meshes=>{const vertices=[],faces=[];for(const m of meshes){const base=vertices.length;vertices.push(...m.vertices.map(p=>p.slice()));faces.push(...m.faces.map(f=>f.map(i=>base+i)));}return {vertices,faces};};
export const tetrahedron=(pts=[[0,0,0],[2,0,0],[0,3,0],[0,0,5]])=>({vertices:pts,faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]});
export function encodeArch(meshes,{generation=7,colors=[],sourceIndices=[]}={}){
 if(!Array.isArray(meshes))meshes=[meshes];
 const nv=meshes.reduce((n,m)=>n+m.vertices.length,0),nf=meshes.reduce((n,m)=>n+m.faces.length,0);
 const counts=[nv,nf,meshes.length,0,0,0,0],strides=[24,12,40,16,16,4,16],align=[8,4,8,8,4,4,4];
 const offsets=[];let total=128;for(let i=0;i<7;i++){total=Math.ceil(total/align[i])*align[i];offsets.push(total);total+=counts[i]*strides[i];}
 const bytes=new Uint8Array(total),d=new DataView(bytes.buffer),u=(o,n)=>d.setUint32(o,n,true);
 [0x48435241,1,128,total,generation,...counts,...offsets].forEach((n,i)=>u(i*4,n));
 let v=0,f=0;meshes.forEach((m,i)=>{const p=offsets[2]+40*i;
  [v,m.vertices.length,f,m.faces.length,colors[i]??0xff00ffff,sourceIndices[i]??i,0,0].forEach((x,j)=>u(p+4*j,x));d.setFloat64(p+32,1,true); // deliberately non-authoritative native volume
  m.vertices.forEach((xyz,j)=>xyz.forEach((x,k)=>d.setFloat64(offsets[0]+24*(v+j)+8*k,x,true)));
  m.faces.forEach((tri,j)=>tri.forEach((x,k)=>u(offsets[1]+12*(f+j)+4*k,x+v)));v+=m.vertices.length;f+=m.faces.length;
 });return bytes;
}
export function scenarios(){
 const basic=cuboid(),outer=cuboid([0,0,0],[10,10,10]),inner=cuboid([2,2,2],[8,8,8]);
 const fan=tetrahedron(),back=invert(tetrahedron(fan.vertices.map(p=>p.map(x=>-x))));
 const pinched={vertices:[...fan.vertices,...back.vertices.slice(1)],faces:[...fan.faces,...back.faces.map(f=>f.map(i=>i===0?0:i+3))]};
 return [
  ['rectangular-solid',basic,'pass'],['slanted-tetrahedron',tetrahedron([[0,0,0],[4,0,0],[1,3,0],[1,1,2]]),'pass'],
  ['open-solid',{...basic,faces:basic.faces.slice(1)},'fail'],['inverted-solid',invert(basic),'fail'],
  ['duplicate-face',{...basic,faces:[...basic.faces,basic.faces[0]]},'fail'],
  ['collinear-tetrahedron',tetrahedron([[0,0,0],[1,0,0],[2,0,0],[0,0,1]]),'fail'],
  ['disconnected-vertex-link',pinched,'fail'],['two-separated-shells',join([basic,cuboid([5,0,0],[7,3,5])]),'pass'],
  ['self-crossing-shells',join([basic,cuboid([1,1,1],[3,4,6])]),'fail'],
  ['touching-unwelded-shell-vertex',join([basic,cuboid([2,3,5],[4,6,10])]),'fail'],
  ['proper-cavity',join([outer,invert(inner)]),'pass'],['incorrect-cavity-winding',join([outer,inner]),'fail'],
  ['island-inside-cavity',join([outer,invert(inner),cuboid([3,3,3],[4,4,4])]),'pass'],
  ['two-material-interior-crossing',[basic,cuboid([1,1,1],[3,4,6])],'fail'],
  ['contained-material',[outer,inner],'fail'],['coincident-material',[basic,basic],'fail'],
  ['shared-material-face',[basic,cuboid([2,0,0],[4,3,5])],'pass'],
  ['material-in-empty-cavity',[join([outer,invert(inner)]),cuboid([3,3,3],[4,4,4])],'pass'],
  ['edge-only-material-contact',[basic,cuboid([2,3,0],[4,6,5])],'unverified'],
  ['point-only-material-contact',[basic,cuboid([2,3,5],[4,6,10])],'unverified'],
  ['binary64-small-gap',[basic,cuboid([2+2**-40,0,0],[4,3,5])],'pass'],
  ['subnormal-solid',cuboid([0,0,0],[Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE]),'pass']
 ];
}
