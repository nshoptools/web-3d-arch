const ownership=new WeakMap();
function table(client){let m=ownership.get(client);if(!m){m=new WeakMap();ownership.set(client,m);}return m;}
function error(code){return Object.assign(new Error(code),{code});}
function checkOwner(client,value,version){
 const r=table(client).get(value);
 if(!r||r.version!==version)throw error('MESH_CLIENT_OWNERSHIP');
 if(r.epoch!==client.epoch)throw error('MESH_RUNTIME_RETIRED');
 if(r.released)throw error('MESH_TOKEN_RELEASED');return r;
}
export function releaseLateMeshResult(data,worker){if(data.type==='mesh-result'&&data.result?.token)worker.postMessage({type:'mesh-release',token:data.result.token});}
/** One additive onmessage hook. Constructor, integrity handshake, ASFR and
 * existing float/material result routes are intentionally outside this module. */
export function handleMeshMessage(client,data,worker,epoch){
 if(data.type!=='mesh-result')return false;
 const active=client.active,result=data.result;
 if(active.cancelled||active.type!=='mesh-operation'||data.generation!==active.generation||data.method!==active.method){
  releaseLateMeshResult(data,worker);client.finish(false,error(active.cancelled?'CANCELLED':'MESH_RESULT_ABI'));return true;
 }
 if(!result||typeof result.version!=='string'){releaseLateMeshResult(data,worker);client.finish(false,error('MESH_RESULT_ABI'));return true;}
 if(!result.token){client.finish(true,result);return true;}
 if(typeof result.token!=='string'||result.token.length>100){client.finish(false,error('MESH_RESULT_TOKEN'));return true;}
 const state={token:result.token,version:result.version,epoch,released:false};
 const span=result.preview?.byteOffset!==undefined?result.preview:null;
 if(span&&(!Number.isSafeInteger(span.byteOffset)||!Number.isSafeInteger(span.byteLength)||span.byteOffset<1||span.byteLength<128||span.byteLength>64_000_000||span.byteOffset+span.byteLength>client.memory.byteLength)){
  releaseLateMeshResult(data,worker);client.finish(false,error('MESH_PREVIEW_ABI'));return true;
 }
 const owned=Object.freeze({...result,epoch,
  previewBytes:span?()=>{checkOwner(client,owned,result.version);return new Uint8Array(client.memory,span.byteOffset,span.byteLength);}:undefined,
  release(){if(state.released)return;state.released=true;if(epoch===client.epoch&&worker===client.worker)worker.postMessage({type:'mesh-release',token:state.token});}
 });
 table(client).set(owned,state);client.finish(true,owned);return true;
}
export function createMeshClient(client){
 if(!client||typeof client.operation!=='function'||typeof client.assertSnapshot!=='function')throw error('MESH_ENGINE_CLIENT_REQUIRED');
 const run=(method,request,generation,epoch)=>client.operation({type:'mesh-operation',method,request},generation,epoch);
 return Object.freeze({
  previewImport(request,{generation}={}){return run('previewImport',request,generation);},
  async approveImport(preview,approval,{generation}={}){
   const o=checkOwner(client,preview,'arch-mesh-input-preview/1');
   const result=await run('approveImport',{token:o.token,...approval},generation,o.epoch);o.released=true;return result;
  },
  prepare(snapshot,prepared,{context,command},{generation}={}){
   client.assertSnapshot(snapshot);const o=checkOwner(client,prepared,'arch-mesh-prepared-import/1');
   return run('prepare',{snapshotId:snapshot.id,token:o.token,context,command:{...command,snapshotGeneration:snapshot.generation}},generation,o.epoch);
  },
  async confirm(proposal,approval,{generation}={}){
   const o=checkOwner(client,proposal,'arch-root-csg-proposal/1');
   const result=await run('confirm',{token:o.token,...approval},generation,o.epoch);o.released=true;return result;
  },
  assertOwned(value){return checkOwner(client,value,value?.version);},
  release(value){checkOwner(client,value,value?.version);value.release();}
 });
}
