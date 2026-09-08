/** Checked borrowed views into ARCH/1. Call again after a heap grows; never retain
 * these views beyond the caller's snapshot lease. This validates transport and
 * indexing only, not printability or geometric self-intersection. */
export class ViewportError extends Error {
  constructor(code, detail='') { super(detail || code); this.name='ViewportError'; this.code=code; }
}
const requireValue=(condition,code)=>{if(!condition)throw new ViewportError(code);};

export function readArchSnapshot(bytes) {
  requireValue(bytes instanceof Uint8Array,'SNAPSHOT_BYTES');
  requireValue(bytes.byteLength>=128&&bytes.byteLength<=256*1024*1024,'SNAPSHOT_SIZE');
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u=offset=>data.getUint32(offset,true);
  requireValue(u(0)===0x48435241&&u(4)===1&&u(8)===128,'SNAPSHOT_ABI');
  requireValue(u(12)===bytes.byteLength,'SNAPSHOT_LENGTH');
  const generation=u(16);
  requireValue(generation>0&&generation<0xffffffff,'SNAPSHOT_GENERATION');
  const counts=Array.from({length:7},(_,i)=>u(20+i*4));
  const offsets=Array.from({length:7},(_,i)=>u(48+i*4));
  const strides=[24,12,40,16,16,4,16],alignment=[8,4,8,8,4,4,4];
  let end=128;
  for(let i=0;i<counts.length;i++) {
    requireValue(counts[i]<=4_000_000,'SNAPSHOT_RESOURCE_LIMIT');
    requireValue(offsets[i]>=end&&(bytes.byteOffset+offsets[i])%alignment[i]===0,'SNAPSHOT_LAYOUT');
    end=offsets[i]+strides[i]*counts[i];
    requireValue(end<=bytes.byteLength,'SNAPSHOT_EXTENT');
  }
  requireValue(end===bytes.byteLength,'SNAPSHOT_TRAILING_BYTES');
  const vertices=new Float64Array(bytes.buffer,bytes.byteOffset+offsets[0],counts[0]*3);
  const triangles=new Uint32Array(bytes.buffer,bytes.byteOffset+offsets[1],counts[1]*3);
  const bounds=counts[0]?{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}:null;
  for(let i=0;i<vertices.length;i++) {
    const value=vertices[i];
    requireValue(Number.isFinite(value)&&Math.abs(value)<=10_000,'SNAPSHOT_COORDINATE');
    const axis=i%3;bounds.min[axis]=Math.min(bounds.min[axis],value);bounds.max[axis]=Math.max(bounds.max[axis],value);
  }
  const parts=[];let vertexEnd=0,faceEnd=0;
  for(let index=0;index<counts[2];index++) {
    const offset=offsets[2]+40*index;
    const part={index,vertexStart:u(offset),vertexCount:u(offset+4),faceStart:u(offset+8),faceCount:u(offset+12),
      color:u(offset+16),sourceIndex:u(offset+20),contourStart:u(offset+24),contourCount:u(offset+28),volumeMm3:data.getFloat64(offset+32,true)};
    requireValue(part.vertexStart===vertexEnd&&part.faceStart===faceEnd,'SNAPSHOT_PART_LAYOUT');
    vertexEnd+=part.vertexCount;faceEnd+=part.faceCount;
    requireValue(part.vertexCount>=4&&part.faceCount>=4&&vertexEnd<=counts[0]&&faceEnd<=counts[1],'SNAPSHOT_PART_EXTENT');
    requireValue(part.contourStart+part.contourCount<=counts[4],'SNAPSHOT_CONTOUR_EXTENT');
    requireValue(Number.isFinite(part.volumeMm3)&&part.volumeMm3>0,'SNAPSHOT_VOLUME');
    for(let i=part.faceStart*3;i<faceEnd*3;i++)
      requireValue(triangles[i]>=part.vertexStart&&triangles[i]<vertexEnd,'SNAPSHOT_PART_INDEX');
    parts.push(Object.freeze(part));
  }
  requireValue(vertexEnd===counts[0]&&faceEnd===counts[1],'SNAPSHOT_UNOWNED_GEOMETRY');
  if(bounds){bounds.size=bounds.max.map((v,i)=>v-bounds.min[i]);bounds.center=bounds.min.map((v,i)=>(v+bounds.max[i])/2);}
  return Object.freeze({generation,vertices,triangles,parts:Object.freeze(parts),bounds});
}

/** Own GPU upload arrays for one part; manufacturing doubles are never changed. */
export function gpuPart(snapshot,part) {
  const positions=new Float32Array(part.vertexCount*3);
  const indices=new Uint32Array(part.faceCount*3);
  positions.set(snapshot.vertices.subarray(part.vertexStart*3,(part.vertexStart+part.vertexCount)*3));
  for(let i=0;i<indices.length;i++)indices[i]=snapshot.triangles[part.faceStart*3+i]-part.vertexStart;
  return {positions,indices};
}

/** Axis-aligned bed-center placement proposal. Bed containment and exclusion
 * validation belong to the manufacturing controller before accepting it. */
export function centerProposal(bounds,bedPolygonMm) {
  requireValue(bounds&&Array.isArray(bedPolygonMm)&&bedPolygonMm.length>=3,'PRINTER_REQUIRED');
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
  for(const p of bedPolygonMm){requireValue(Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000),'PRINTER_BED');for(let i=0;i<2;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}}
  requireValue(min.every((n,i)=>n<max[i]),'PRINTER_BED');
  return Object.freeze({kind:'placement-proposal',translationMm:[(min[0]+max[0])/2-bounds.center[0],(min[1]+max[1])/2-bounds.center[1],-bounds.min[2]],requiresValidation:true,requiresCommit:true});
}
