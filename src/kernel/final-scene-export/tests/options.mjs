export function partCount(fixture){return fixture===12?3:fixture===200?160:[2,3,7,8,11,14,15].includes(fixture)?1:2;}
export function configuration(fixture,settings={}){
 const n=partCount(fixture);
 return {format:1,orientation:0,rest:0,sectionMode:0,side:0,color:0,units:0,inspection:0,z0:0,z1:0,step:0,error:.004,
  matrix:Array(12).fill(0),limits:[200000,400000,256,256,200000,16*1024*1024,128*1024*1024,0],generation:1,gates:0,verdict:1,revision:'1',expectedRevision:'1',filename:'Móc khóa kiểm thử',
  mapping:Array.from({length:n},(_,part)=>({part,slot:1,rgba:0xff0000ff,source:101+part,materialSource:900+part,reserved:0})),...settings};
}
export function pack(c){
 const name=new TextEncoder().encode(c.filename),b=new Uint8Array(256+24*c.mapping.length+name.length),d=new DataView(b.buffer);
 [1,208,c.format,c.orientation,c.rest,c.sectionMode,c.side,c.color,c.units,c.inspection,0,0].forEach((v,i)=>d.setUint32(i*4,v,true));
 [c.z0,c.z1,c.step,c.error].forEach((v,i)=>d.setFloat64(48+8*i,v,true));c.matrix.forEach((v,i)=>d.setFloat64(80+8*i,v,true));c.limits.forEach((v,i)=>d.setUint32(176+4*i,v,true));
 [0x58454641,1,c.generation,c.gates,c.verdict,c.inspection,c.mapping.length,name.length].forEach((v,i)=>d.setUint32(208+4*i,v,true));
 d.setBigUint64(240,BigInt(c.revision),true);d.setBigUint64(248,BigInt(c.expectedRevision),true);
 c.mapping.forEach((m,i)=>[m.part,m.slot,m.rgba,m.source,m.materialSource,m.reserved].forEach((v,j)=>d.setUint32(256+24*i+4*j,v,true)));b.set(name,256+24*c.mapping.length);
 for(const p of c.patch??[]){d[p.type==='f64'?'setFloat64':'setUint32'](p.offset,p.value,true)}
 return b;
}
