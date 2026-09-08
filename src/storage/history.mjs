import {check,cloneJSON,canonicalJSON,jsonHash,hashId,integer,identity,encoder,keys} from './common.mjs';
const DEFAULT_BUDGET={transactions:20,bytes:24*1024*1024};
export async function domainStateFingerprint(state){
  const copy=cloneJSON(state);integer(copy.revision);delete copy.revision;
  return jsonHash(copy);
}
export async function snapshotReference(state,{assetHashes=[],manifestHash=null}={}){
  const unique=[...new Set(assetHashes)];unique.forEach(hashId);unique.sort();if(manifestHash!==null)hashId(manifestHash);
  return {stateHash:await domainStateFingerprint(state),projectRevision:state.revision,assetHashes:unique,manifestHash};
}
function snapshot(input){
  const s=cloneJSON(input);keys(s,['stateHash','projectRevision','assetHashes','manifestHash']);
  hashId(s.stateHash);integer(s.projectRevision);
  check(Array.isArray(s.assetHashes)&&new Set(s.assetHashes).size===s.assetHashes.length,'HISTORY_ASSETS','Invalid snapshot references.');
  s.assetHashes.forEach(hashId);if(s.manifestHash!==null)hashId(s.manifestHash);return s;
}
function catalog(input){
  const result={};
  for(const a of cloneJSON(input)){
    keys(a,['hash','byteLength']);hashId(a.hash);integer(a.byteLength);
    check(!Object.hasOwn(result,a.hash)||result[a.hash]===a.byteLength,'HISTORY_ASSET_SIZE','One asset hash has conflicting byte lengths.');
    result[a.hash]=a.byteLength;
  }
  return result;
}
function validate(h){
  h=cloneJSON(h);keys(h,['kind','version','historyRevision','current','transactions','cursor','assets','budget']);
  check(h.kind==='web-3d-arch.history'&&h.version===1,'HISTORY_VERSION','Unsupported history version.');
  integer(h.historyRevision);h.current=snapshot(h.current);integer(h.cursor,0,h.transactions.length);
  keys(h.budget,['transactions','bytes']);integer(h.budget.transactions,1,20);integer(h.budget.bytes,0,24*1024*1024);
  for(const [hash,size]of Object.entries(h.assets)){hashId(hash);integer(size,0,128*1024*1024);}
  const ids=new Set();
  for(const tx of h.transactions){
    keys(tx,['id','before','after','command']);identity(tx.id);check(!ids.has(tx.id),'HISTORY_ID','Duplicate transaction ID.');ids.add(tx.id);
    tx.before=snapshot(tx.before);tx.after=snapshot(tx.after);
  }
  for(let i=1;i<h.transactions.length;i++)check(h.transactions[i-1].after.stateHash===h.transactions[i].before.stateHash,'HISTORY_CHAIN','History snapshot chain is broken.');
  if(h.transactions.length){
    const expected=h.cursor===0?h.transactions[0].before:h.transactions[h.cursor-1].after;
    check(h.current.stateHash===expected.stateHash,'HISTORY_CURSOR','History cursor and actual content disagree.');
  }
  for(const s of [h.current,...h.transactions.flatMap(t=>[t.before,t.after])])
    for(const hash of s.assetHashes)check(Object.hasOwn(h.assets,hash)&&Number.isSafeInteger(h.assets[hash])&&h.assets[hash]>=0,'HISTORY_ASSET_MISSING','Unknown asset size in history budget.',{hash});
  return h;
}
export function createHistory(current,{assets=[],budget=DEFAULT_BUDGET}={}){
  return validate({kind:'web-3d-arch.history',version:1,historyRevision:0,current:snapshot(current),transactions:[],cursor:0,assets:catalog(assets),budget:cloneJSON(budget)});
}
export function historyCost(input){
  const h=validate(input),baseline=new Set(h.current.assetHashes),referenced=new Set();
  for(const tx of h.transactions)for(const s of [tx.before,tx.after])s.assetHashes.forEach(hash=>referenced.add(hash));
  const incremental=[...referenced].filter(hash=>!baseline.has(hash));
  const assetBytes=incremental.reduce((n,hash)=>n+h.assets[hash],0);
  const payloadBytes=encoder.encode(canonicalJSON({historyRevision:h.historyRevision,cursor:h.cursor,transactions:h.transactions,assets:h.assets})).length;
  return {transactions:h.transactions.length,payloadBytes,assetBytes,totalBytes:payloadBytes+assetBytes,incrementalAssetHashes:incremental.sort(),
    currentExcludedFromHistoryBudget:true};
}
function trim(h){
  const evicted=[];
  while(h.transactions.length&&(historyCost(h).totalBytes>h.budget.bytes||h.transactions.length>h.budget.transactions)){
    if(h.cursor>0){evicted.push(h.transactions.shift().id);h.cursor--;}
    else evicted.push(h.transactions.pop().id);
  }
  const referenced=new Set([h.current,...h.transactions.flatMap(t=>[t.before,t.after])].flatMap(s=>s.assetHashes));
  h.assets=Object.fromEntries(Object.entries(h.assets).filter(([hash])=>referenced.has(hash)));
  return evicted;
}
export async function planHistoryAppend(input,{id,after,command,assets=[]}){
  const h=validate(input),beforeHash=await jsonHash(h),next=cloneJSON(h);
  identity(id);after=snapshot(after);
  check(after.projectRevision>h.current.projectRevision,'STALE_HISTORY_BRANCH','New snapshot revision must advance.');
  const extra=catalog(assets);
  for(const [hash,size]of Object.entries(extra)){
    check(!Object.hasOwn(next.assets,hash)||next.assets[hash]===size,'HISTORY_ASSET_SIZE','Conflicting asset size.');next.assets[hash]=size;
  }
  const discardedRedo=next.transactions.slice(next.cursor).map(t=>t.id);
  next.transactions=next.transactions.slice(0,next.cursor);
  next.transactions.push({id,before:cloneJSON(h.current),after,command:cloneJSON(command)});
  next.cursor=next.transactions.length;next.current=after;next.historyRevision++;
  validate(next);const evicted=trim(next);
  const request={id,after,command:cloneJSON(command),assets:cloneJSON(assets)};
  return {kind:'history-append-plan',beforeHash,request,next:validate(next),evicted,discardedRedo,requiresPruningAcceptance:evicted.length>0,cost:historyCost(next)};
}
export async function acceptHistoryAppend(input,plan,{acceptPruning=false}={}){
  const h=validate(input);check(plan.kind==='history-append-plan'&&await jsonHash(h)===plan.beforeHash,'STALE_HISTORY_BRANCH','History changed since append proposal.');
  const expected=await planHistoryAppend(h,plan.request);
  check(canonicalJSON(plan)===canonicalJSON(expected),'HISTORY_PLAN_CHANGED','Append proposal was changed.');
  check(!plan.requiresPruningAcceptance||acceptPruning,'HISTORY_PRUNING_REQUIRED','Confirm the listed history reduction before committing the edit.',{evicted:plan.evicted});
  return validate(plan.next);
}
export async function planHistoryMove(input,direction){
  const h=validate(input);
  check(direction==='undo'||direction==='redo','HISTORY_DIRECTION','Expected undo or redo.');
  const index=direction==='undo'?h.cursor-1:h.cursor;
  check(index>=0&&index<h.transactions.length,'HISTORY_EMPTY','No history transaction in this direction.');
  integer(h.current.projectRevision,0,Number.MAX_SAFE_INTEGER-1);
  const tx=h.transactions[index],target=direction==='undo'?tx.before:tx.after;
  return {kind:'history-move-plan',direction,beforeHash:await jsonHash(h),transactionId:tx.id,target:snapshot(target),
    expectedCurrentStateHash:h.current.stateHash,expectedProjectRevision:h.current.projectRevision,
    nextProjectRevision:h.current.projectRevision+1,targetCursor:direction==='undo'?h.cursor-1:h.cursor+1,
    action:'restore-validated-domain-snapshot',mutatesDomain:false};
}
/** Candidate adapter for parent adjudication. It does not call strict undoTransaction.
 * validateDomain is the parent's real schema/domain validator, and must reject invalid targets.
 */
export async function restoreDomainSnapshot(current,targetState,plan,{validateDomain}={}){
  check(typeof validateDomain==='function','DOMAIN_VALIDATOR_REQUIRED','Parent must supply its actual domain validator.');
  const before=cloneJSON(current),target=cloneJSON(targetState);
  check(plan.kind==='history-move-plan'&&before.revision===plan.expectedProjectRevision&&await domainStateFingerprint(before)===plan.expectedCurrentStateHash,
    'STALE_HISTORY_BRANCH','Current branch differs from the planned restore.');
  check(await domainStateFingerprint(target)===plan.target.stateHash,'HISTORY_TARGET','Restore target content differs from retained snapshot.');
  target.revision=plan.nextProjectRevision;
  const candidate=cloneJSON(await validateDomain(target));
  check(candidate.revision===plan.nextProjectRevision&&await domainStateFingerprint(candidate)===plan.target.stateHash,
    'HISTORY_TARGET','Domain validation changed target content or revision.');
  return {candidate,appliedReference:await snapshotReference(candidate,{assetHashes:plan.target.assetHashes,manifestHash:plan.target.manifestHash}),
    requiresAtomicProjectCommit:true,geometryVerified:false};
}
export async function acceptHistoryMove(input,plan,appliedReference,{acceptPruning=false}={}){
  const h=validate(input),applied=snapshot(appliedReference);
  check(plan.kind==='history-move-plan'&&await jsonHash(h)===plan.beforeHash,'STALE_HISTORY_BRANCH','Cursor/branch changed since undo/redo proposal.');
  const expected=await planHistoryMove(h,plan.direction);
  check(canonicalJSON(plan)===canonicalJSON(expected),'HISTORY_PLAN_CHANGED','Undo/redo proposal was changed.');
  check(applied.stateHash===plan.target.stateHash&&applied.projectRevision===plan.nextProjectRevision&&
    canonicalJSON(applied.assetHashes)===canonicalJSON(plan.target.assetHashes),'HISTORY_NOT_APPLIED','Parent has not supplied the matching restored snapshot.');
  const next={...h,current:applied,cursor:plan.targetCursor,historyRevision:h.historyRevision+1};
  const evicted=trim(next);
  check(!evicted.length||acceptPruning,'HISTORY_PRUNING_REQUIRED','Moving history changes incremental retained-byte cost; confirm reduction.',{evicted});
  return validate(next);
}
export function retainedHistoryManifests(input){
  const h=validate(input);
  return [...new Set([h.current,...h.transactions.flatMap(t=>[t.before,t.after])].map(s=>s.manifestHash).filter(Boolean))].sort();
}
