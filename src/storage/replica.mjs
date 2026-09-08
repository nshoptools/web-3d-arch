import {check,cloneJSON,hashId,integer} from './common.mjs';
export const CLOUD_REPLICA_CAPABILITY=Object.freeze({
  id:'cloud-replica',status:'unsupported',requires:['immutable-object-put-get-sha256','conditional-head-put-etag-or-revision','owner-scope'],
  never:'silent-last-writer-wins',localCommitIndependent:true
});
export function planReplicaPublication({local,remote,expectedETag}){
  local=cloneJSON(local);remote=remote===null?null:cloneJSON(remote);
  hashId(local.manifestHash);integer(local.revision);
  check(expectedETag===null||typeof expectedETag==='string','ETAG_REQUIRED','Caller must provide expected remote ETag explicitly.');
  if(remote)hashId(remote.manifestHash);
  if((remote?.etag??null)!==expectedETag)
    return {status:'conflict',localCopy:local,remoteCopy:remote,resolutionRequired:true,networkPerformed:false};
  return {status:'proposal',putObjectsBeforeHead:true,headCondition:{ifMatch:expectedETag,createOnly:expectedETag===null},
    candidate:local,networkPerformed:false,capability:'unsupported-until-provider-adapter'};
}
