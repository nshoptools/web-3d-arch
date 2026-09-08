import {cloneJSON,keys,check,integer,identity,hashId} from './common.mjs';
export function validateHead(input){
  const h=cloneJSON(input);
  keys(h,['schemaVersion','projectId','revision','currentHash','previousHash','historyHashes','previousHistoryHashes','transactionId']);
  check(h.schemaVersion===1,'UNSUPPORTED_HEAD_VERSION','Head schema version is not supported.');
  identity(h.projectId);integer(h.revision,1);hashId(h.currentHash);if(h.previousHash!==null)hashId(h.previousHash);identity(h.transactionId);
  for(const k of ['historyHashes','previousHistoryHashes']){
    check(Array.isArray(h[k])&&h[k].length<=41&&new Set(h[k]).size===h[k].length,'HEAD_REFERENCES','Invalid retained manifest references.');
    h[k].forEach(hashId);
  }
  return h;
}
