// Labelled client transport double, backed by the actual same-Module root float
// helper, native registry, proof and serializer. RPC is tested separately.
import {prepareFinalFloat,confirmFinalFloat} from '../../src/kernel/final-scene-export/float-runtime.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function installFloatRuntime(T){
 const M=T.M;if(M._arch_final_float_version?.()!==1)fail('TEST_FLOAT_RUNTIME_REQUIRED');
 const owned=new WeakSet(),leases=[],calls={prepare:0,confirm:0,release:0};
 T.client.serviceCapabilities.finalFloat=true;
 T.client.prepareFinalFloat=async(root,options,policy,{generation})=>{
  calls.prepare++;await T.before.floatPrepare?.(root,options,policy,generation);
  const r=prepareFinalFloat(M,root.id,{...structuredClone(options),generation:root.generation},policy,generation);
  let released=false;const p=Object.freeze({version:'arch-final-float-proposal/1',id:r.id,metadata:r.metadata,confirmation:Object.freeze({...r.metadata.confirmation}),
   view(kind){if(released)fail('FLOAT_PROPOSAL_RELEASED');const b=r.buffers.find(b=>b.kind===kind);if(!b)fail('FLOAT_BUFFER_KIND');const C=kind===1||kind===3?Float64Array:Uint32Array;return new C(new C(M.HEAPU8.buffer,b.byteOffset,b.byteLength/C.BYTES_PER_ELEMENT));},
   release(){if(released)return;released=true;calls.release++;if(M._arch_final_float_release(r.id)!==1)fail('TEST_FLOAT_RELEASE');owned.delete(p);}});
  owned.add(p);leases.push(p);await T.before.floatPrepared?.(p);return p;
 };
 T.client.confirmFinalFloat=async(p,descriptor,{generation})=>{if(!owned.has(p))fail('FLOAT_PROPOSAL_OWNERSHIP');calls.confirm++;await T.before.floatConfirm?.(p,descriptor,generation);return confirmFinalFloat(M,p.id,descriptor,generation);};
 T.client.releaseFinalFloat=p=>p.release();
 return {calls,leases,retired(){return leases.every(p=>M._arch_final_float_buffer_ptr(p.id,9)===0);},restore(){leases.forEach(p=>p.release());T.client.serviceCapabilities.finalFloat=false;for(const name of ['prepareFinalFloat','confirmFinalFloat','releaseFinalFloat'])delete T.client[name];}};
}

// Independent numeric checks over original/candidate typed geometry; no Manifold
// status, encoder volume or claimed displacement is accepted as the oracle.
export function floatCorrespondenceOracle(p){
 const v=p.view(1),t=p.view(2),w=p.view(3),f=p.view(4),map=p.view(5),retained=p.view(6),removed=p.view(7),pairs=p.view(8),m=p.metadata.conditioning;
 const check=(v,why)=>{if(!v)throw Error('float oracle '+why);};
 check(v.length===map.length*3&&f.length===retained.length*3&&t.length/3===retained.length+removed.length,'buffer counts');
 let maximumDisplacementMm=0;const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],edges=new Set();
 for(let i=0;i<map.length;i++){check(map[i]<w.length/3,'map range');let d=0;for(let k=0;k<3;k++){const c=w[3*map[i]+k];check(c===Math.fround(c),'exact binary32');d+=(v[3*i+k]-c)**2;}maximumDisplacementMm=Math.max(maximumDisplacementMm,Math.sqrt(d));}
 check(maximumDisplacementMm<=m.hausdorffUpperBoundMm,'outward displacement bound');
 for(let i=0;i<retained.length;i++)for(let k=0;k<3;k++){const a=f[3*i+k],b=f[3*i+(k+1)%3];check(a===map[t[retained[i]*3+k]],'source face image');edges.add([a,b].sort((a,b)=>a-b).join(','));}
 for(const index of removed){const ids=[...new Set([0,1,2].map(k=>map[t[3*index+k]]))];check(ids.length<=2,'degenerate removed face');if(ids.length===2)check(edges.has(ids.sort((a,b)=>a-b).join(',')),'covered removed face image');}
 for(let i=0;i<w.length;i++){const k=i%3;bounds[k]=Math.min(bounds[k],w[i]);bounds[k+3]=Math.max(bounds[k+3],w[i]);}
 check(pairs.length/2===m.collapsedEdges,'paired edge count');
 return {maximumDisplacementMm,bounds,sourceVertices:v.length/3,candidateVertices:w.length/3,sourceTriangles:t.length/3,candidateTriangles:f.length/3,removed:removed.length,pairs:pairs.length/2};
}
