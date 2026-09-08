/** Typed wire contract for the opt-in C++ sidecar; no app/Worker publication here. */
export type BudgetClass = 'kernel' | 'mating' | 'export';
export interface ExactHead { generation: bigint; sourceSHA256: Uint8Array; settingsSHA256: Uint8Array }
export interface ConditioningOptions {
  chordLinfNm: number; maxOutputPoints: number; maxWorkUnits: bigint;
  priorBoundNm: number; totalBudgetNm: number; priorVerified: boolean;
  budgetClass: BudgetClass; maxPartPoints: number;
}
export interface ConditioningLedger {
  sourceVertices: number; outputVertices: number; sourceEdges: number; outputEdges: number;
  chains: number; pins: number; components: number; loops: number; changed: boolean;
  conditioningLinfNm: number; conditioningEuclideanNm: number; meshConversionNm: number;
  float32Nm: number; priorNm: number; totalNm: number; budgetNm: number;
  sourceOccurrences: number; outputOccurrences: number; partCount: number;
  workUnits: bigint; intersectionPairs: bigint; nestingTests: bigint;
}
function u32(n:number,min=0,max=0xffffffff):number {
  if(!Number.isInteger(n)||n<min||n>max)throw Error('CONDITIONING_INVALID_OPTIONS');return n;
}
export function encodeHead(head:ExactHead):Uint8Array {
  if(typeof head.generation!=='bigint'||head.generation<1n||head.generation>0xffffffffffffffffn||
     head.sourceSHA256.length!==32||head.settingsSHA256.length!==32)throw Error('CONDITIONING_INVALID_HEAD');
  const bytes=new Uint8Array(72);new DataView(bytes.buffer).setBigUint64(0,head.generation,true);
  bytes.set(head.sourceSHA256,8);bytes.set(head.settingsSHA256,40);return bytes;
}
export function encodeOptions(o:ConditioningOptions):Uint8Array {
  const kind={kernel:1,mating:2,export:3}[o.budgetClass];
  if(!kind||typeof o.priorVerified!=='boolean'||typeof o.maxWorkUnits!=='bigint'||o.maxWorkUnits<1n||o.maxWorkUnits>100000000n)throw Error('CONDITIONING_INVALID_OPTIONS');
  const bytes=new Uint8Array(48),v=new DataView(bytes.buffer);
  [1,48,u32(o.chordLinfNm,0,1414),u32(o.maxOutputPoints,3,32768)].forEach((x,i)=>v.setUint32(4*i,x,true));
  v.setBigUint64(16,o.maxWorkUnits,true);
  const cap=kind===1?2000:kind===2?1000:4000;
  [u32(o.priorBoundNm,0,4000),u32(o.totalBudgetNm,1,cap),Number(o.priorVerified),kind,u32(o.maxPartPoints,3,8192),0].forEach((x,i)=>v.setUint32(24+4*i,x,true));
  return bytes;
}
export function readDescriptor(bytes:Uint8Array):{serial:bigint;head:Uint8Array;options:Uint8Array;ledger:ConditioningLedger} {
  if(bytes.byteLength!==272)throw Error('CONDITIONING_DESCRIPTOR_FORMAT');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=(p:number)=>v.getUint32(p,true);
  if(u(0)!==0x444e4f43||u(4)!==1||u(8)!==272||u(12)!==0||u(144)!==1||u(148)!==128||u(152)!==1||u(156)!==1||u(236)||u(264)||u(268))throw Error('CONDITIONING_DESCRIPTOR_FORMAT');
  const at=144;
  const ledger:ConditioningLedger={
    sourceVertices:u(at+16),outputVertices:u(at+20),sourceEdges:u(at+24),outputEdges:u(at+28),
    chains:u(at+32),pins:u(at+36),components:u(at+40),loops:u(at+44),changed:u(at+48)===1,
    conditioningLinfNm:u(at+52),conditioningEuclideanNm:u(at+56),meshConversionNm:u(at+60),
    float32Nm:u(at+64),priorNm:u(at+68),totalNm:u(at+72),budgetNm:u(at+76),
    sourceOccurrences:u(at+80),outputOccurrences:u(at+84),partCount:u(at+88),
    workUnits:v.getBigUint64(at+96,true),intersectionPairs:v.getBigUint64(at+104,true),nestingTests:v.getBigUint64(at+112,true)
  };
  if(ledger.totalNm!==ledger.priorNm+ledger.conditioningEuclideanNm+ledger.meshConversionNm+ledger.float32Nm||
    ledger.totalNm>ledger.budgetNm||u(at+48)>1)throw Error('CONDITIONING_LEDGER_FORMAT');
  return {serial:v.getBigUint64(16,true),head:bytes.slice(24,96),options:bytes.slice(96,144),ledger};
}
export interface ProofSection {id:number;stride:number;count:number;offset:number}
export function proofSections(bytes:Uint8Array):ProofSection[] {
  if(bytes.length<144||bytes.length>32*1024*1024)throw Error('CONDITIONING_PROOF_FORMAT');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=(p:number)=>v.getUint32(p,true);
  if(u(0)!==0x48504743||u(4)!==1||u(8)!==bytes.length||u(12)!==8)throw Error('CONDITIONING_PROOF_FORMAT');
  const strides=[16,16,16,4,4,16,4,4];let end=144;
  return strides.map((stride,i)=>{
    const p=16+16*i,s={id:u(p),stride:u(p+4),count:u(p+8),offset:u(p+12)};
    if(s.id!==i+1||s.stride!==stride||s.offset%8||s.offset<end||s.count>800000||
       s.offset+s.count*s.stride>bytes.length)throw Error('CONDITIONING_PROOF_FORMAT');
    end=s.offset+s.count*s.stride;if(i===7&&end!==bytes.length)throw Error('CONDITIONING_PROOF_FORMAT');return s;
  });
}
/** Ownership boundary for parent integration (not a Worker implementation).
 * Prepare/confirm run serially in the kernel Worker. Store descriptor+source and
 * ledger in a derived feature after explicit acceptance. Re-read exact head at
 * commit. Failed/cancelled operations keep the previous published snapshot.
 * Never use an unaccepted preview pointer as an exportable snapshot lease.
 */
export interface ConditioningInput {
  xy: BigInt64Array; contourEnds: Uint32Array; shapeEnds: Uint32Array;
  fillRules: Uint32Array; colors: Uint32Array; z0: Float64Array; z1: Float64Array;
}
export interface ConditioningProposalLease {
  readonly descriptor: Uint8Array;
  readonly proof: Uint8Array;
  readonly ledger: ConditioningLedger;
  release():void;
}
export interface RegionChange {
  sourceRegion:number; sourceTwiceAreaNm2:bigint; derivedTwiceAreaNm2:bigint;
  signedTwiceAreaDeltaNm2:bigint;
  /** Signed minX/maxX/minY/maxY changes on the canonical grid; extrema are pinned. */
  signedBoundsDeltaNm:readonly bigint[];
}
/** Exact grid area deltas for proposal UI/audit; not mechanical-fit certification. */
export function regionChanges(proof:Uint8Array):RegionChange[] {
  const sections=proofSections(proof),v=new DataView(proof.buffer,proof.byteOffset,proof.byteLength);
  const ps=sections[0],loops=sections[2],indices=sections[3],kept=sections[7];
  const retained=new Set<number>();for(let i=0;i<kept.count;i++)retained.add(v.getUint32(kept.offset+4*i,true));
  const point=(id:number):[bigint,bigint]=>{
    if(id>=ps.count)throw Error('CONDITIONING_PROOF_FORMAT');
    return [v.getBigInt64(ps.offset+16*id,true),v.getBigInt64(ps.offset+16*id+8,true)];
  };
  const accumulated=new Map<number,RegionChange>();
  for(let i=0;i<loops.count;i++){
    const p=loops.offset+i*16,region=v.getUint32(p,true),from=v.getUint32(p+4,true),count=v.getUint32(p+8,true);
    if(count<3||from+count>indices.count)throw Error('CONDITIONING_PROOF_FORMAT');
    const ids=Array.from({length:count},(_,j)=>v.getUint32(indices.offset+4*(from+j),true));
    const original=ids.map(point),derived=ids.filter(id=>retained.has(id)).map(point);
    if(derived.length<3)throw Error('CONDITIONING_PROOF_FORMAT');
    const twiceArea=(points:[bigint,bigint][])=>points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-p[1]*q[0];},0n);
    const bounds=(points:[bigint,bigint][])=>[0,1].flatMap(axis=>[
      points.reduce((a,p)=>p[axis]<a?p[axis]:a,10000000001n),
      points.reduce((a,p)=>p[axis]>a?p[axis]:a,-10000000001n)]);
    const before=bounds(original),after=bounds(derived);
    const delta=after.map((n,j)=>n-before[j]);
    // Every loop pins all four extrema, so each region union has zero grid bounds drift.
    if(delta.some(n=>n!==0n))throw Error('CONDITIONING_PROOF_FORMAT');
    const a=twiceArea(original),b=twiceArea(derived);
    const entry=accumulated.get(region)??{sourceRegion:region,sourceTwiceAreaNm2:0n,derivedTwiceAreaNm2:0n,signedTwiceAreaDeltaNm2:0n,signedBoundsDeltaNm:[0n,0n,0n,0n]};
    entry.sourceTwiceAreaNm2+=a;entry.derivedTwiceAreaNm2+=b;entry.signedTwiceAreaDeltaNm2+=b-a;
    accumulated.set(region,entry);
  }
  return [...accumulated.values()].sort((a,b)=>a.sourceRegion-b.sourceRegion);
}