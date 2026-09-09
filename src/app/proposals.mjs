import {assert,error,data,canonicalJSON,sha256,uuid} from './common.mjs';
/** Human titles for the confirmation dialog. The machine `kind` stays untouched in
 * `controller.pendingChange.kind`; an unknown kind is shown behind a generic prefix. */
const PROPOSAL_TITLES=Object.freeze({
 'geometry parameter change':'Xác nhận thay đổi tham số hình học',
 'geometry approximation':'Xác nhận phép xấp xỉ hình học',
 'export conditioning':'Xác nhận điều chỉnh khi xuất',
 'export approximation':'Xác nhận phép xấp xỉ khi xuất',
 'source import':'Xác nhận nhập nguồn',
 'source conversion':'Xác nhận chuyển đổi nguồn',
 'align manufacturing face':'Xác nhận căn mặt chế tạo',
 'product source update':'Xác nhận cập nhật nguồn sản phẩm',
 'đơn vị và vật liệu khối nhập':'Xác nhận đơn vị và vật liệu khối nhập',
 'áp dụng khối nhập':'Xác nhận áp dụng khối nhập'
});
export function proposalTitle(kind){return Object.hasOwn(PROPOSAL_TITLES,kind)?PROPOSAL_TITLES[kind]:'Xác nhận: '+kind;}
export async function candidateHash(state,assets){
 const hashes=[];for(const [hash,a]of assets){assert(await sha256(a.bytes)===hash,'PROPOSAL_OUTPUT_CHANGED');hashes.push(hash);}
 return sha256(canonicalJSON({state,assets:hashes.sort()}));
}
export class ProposalOperations {
 discardProposal(){const p=this.pendingOperation;this.pendingOperation=null;p?.release?.();}
 discardPendingProposal(id){
  assert(typeof id==='string'&&id.length>0,'STALE_CONFIRMATION');
  assert(this.acceptingProposal?.id!==id,'APPROVAL_IN_PROGRESS');
  const operation=this.pendingOperation?.id===id,change=this.pendingChange?.id===id;
  assert(operation||change,'STALE_CONFIRMATION');
  assert(!(operation?this.pendingOperation:this.pendingChange).accepting,'APPROVAL_IN_PROGRESS');
  try{if(operation)this.discardProposal();if(change)this.pendingChange=null;}
  finally{this.emit();}
 }
 async proposeOperation({kind,changes,outputHash,verify,apply,release=()=>{},control=null,handoff=false}){
  this.discardProposal();this.pendingChange=null;this.requireProject();assert(Array.isArray(changes)&&changes.length>0&&changes.length<=200&&changes.every(s=>typeof s==='string'&&s.length<=2000),'PROPOSAL_DESCRIPTION');
  const ownedJob=this.job?.id===control?.ticket.id&&this.job?.abort.signal===control?.signal?this.job:null;
  let released=false;
  const releaseOnce=()=>{if(released)return;released=true;
   const next=this.pendingOperation,transferred=handoff===true&&ownedJob&&next&&next!==p&&next.control===control&&this.job===ownedJob&&!control.signal.aborted;
   if(!transferred)ownedJob?.abort.abort();try{release();}finally{if(ownedJob&&!transferred)this.finishJob(ownedJob);}};
  const p={id:uuid(),kind,changes:data(changes),outputHash,verify,apply,release:releaseOnce,control,projectId:this.projectId,revision:this.doc.state.revision,headRevision:this.headRevision,epoch:this.epoch,originScope:this.activeScope??null};
  this.pendingOperation=p;this.emit();const e=error('PROPOSAL_REQUIRED');
  e.confirmation={title:proposalTitle(kind),changes:p.changes,retry:{type:'proposal.accept',id:p.id,confirmed:true}};throw e;
 }
 async acceptOperation(id,confirmed){
  const p=this.pendingOperation;assert(p?.id===id&&confirmed===true,'STALE_CONFIRMATION');
  assert(!p.accepting,'APPROVAL_IN_PROGRESS');p.accepting=true;this.acceptingProposal=p;
  try{
   this.guard(p.epoch);assert(this.projectId===p.projectId&&this.doc.state.revision===p.revision&&this.headRevision===p.headRevision,'STALE_CONFIRMATION');
   const committed=await this.store.load(p.projectId);assert(committed.headRevision===p.headRevision,'STALE_CONFIRMATION');
   assert(await p.verify()===p.outputHash,'PROPOSAL_OUTPUT_CHANGED');
   if(this.onlineSession)await this.preflight(p.epoch);
   this.guard(p.epoch);assert(this.pendingOperation===p&&this.doc.state.revision===p.revision&&this.headRevision===p.headRevision,'STALE_CONFIRMATION');
   // CAS publication in apply still checks cross-tab state. No unknown proposal is rerun with new defaults.
   this.pendingOperation=null;const value=await p.apply();if(p.originScope)this.retireRefusals(p.originScope);return value;
  }finally{
   if(this.pendingOperation===p)this.pendingOperation=null;
   if(this.acceptingProposal===p)this.acceptingProposal=null;
   p.release();this.emit();
  }
 }
}
