import * as domain from '../domain/index.mjs';
import {FIELD_MAP} from '../kernel/mechanics/src/catalog-map.mjs';
import {canonicalJSON,cloneJSON,sha256} from '../storage/common.mjs';
import {domainStateFingerprint} from '../storage/history.mjs';

const VERSION='arch-app-adapters/1',fields=new Map(FIELD_MAP.map(f=>[f.abiId,f.id]));
const need=(ok,code,details)=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);

/** Turn a checked native no-mesh proposal into a reviewable domain command.
 * Confirmation acknowledges the original native head. Only the controller
 * commits the listed command and rebuilds with a fresh ticket. */
export async function nativeParameterProposal(proposal,input){
  need(proposal?.version==='arch-product-geometry-proposal/1'&&proposal.code==='PRODUCT_NEEDS_ACCEPTANCE','GEOMETRY_PROPOSAL_KIND');
  need(same(proposal.ticket,input.ticket),'GEOMETRY_PROPOSAL_TICKET');
  const head=cloneJSON(proposal.head),m=proposal.metadata;
  need(head.headHash===await domainStateFingerprint(input.state)&&head.revision===String(input.state.revision),'GEOMETRY_PROPOSAL_HEAD');
  need(m?.mechanicsSemantics===3&&m.sourceSemantics===2&&m.parts?.length===0&&(m.mechanicsVerdict===3||m.sourceVerdict===3),'GEOMETRY_PROPOSAL_SEMANTICS');
  const values=domain.effectiveValues(input.state),entries=domain.effectiveEntries(input.state),byField=new Map();
  const offers=[...(m.proposals??[]).map(p=>({...p,after:p.after})),...(m.sourceProposals??[]).map(p=>({...p,after:p.proposed,applicable:1}))];
  need(offers.length>0&&offers.length<=200,'GEOMETRY_PROPOSAL_EMPTY');
  for(const p of offers){
    const id=fields.get(p.fieldId),field=id&&domain.getField(id);
    need(field&&field.lifecycle==='active'&&['height','decimal'].includes(field.type),'GEOMETRY_PROPOSAL_FIELD',{field:id});
    need(p.applicable===1&&Number.isFinite(p.before)&&Number.isFinite(p.after)&&p.after>p.before,'GEOMETRY_PROPOSAL_VALUE',{field:id});
    const before=field.type==='height'?domain.resolveFieldMm(input.state,id):values[id];
    need(Number.isFinite(before)&&Math.abs(before-p.before)<=1e-9,'GEOMETRY_PROPOSAL_BEFORE',{field:id});
    if(p.semanticId!==undefined)need(p.semanticId===m.sourceId,'GEOMETRY_PROPOSAL_SOURCE');
    // Native suggestions enlarge the current feature. Round UP to the storage
    // grid and disclose the resulting value, including any extra micrometre.
    // Never round down a requested minimum or change a field during preview.
    const step=field.domain.quantum,minimum=field.domain.min;
    need(Number.isFinite(step)&&step>0&&Number.isFinite(minimum),'GEOMETRY_PROPOSAL_GRID');
    const units=Math.ceil((p.after-minimum)/step),target=Number((minimum+units*step).toFixed(6));
    need(Number.isFinite(target)&&target>=p.after-1e-12&&target<=field.domain.max,'GEOMETRY_PROPOSAL_DOMAIN',{field:id,requested:p.after});
    const prior=byField.get(id);byField.set(id,{field,before:p.before,target:Math.max(prior?.target??-Infinity,target)});
  }
  const parameters=[],changes=[];
  for(const [id,{field,before,target}]of byField){
    let value=target;const old=entries[id].value;
    if(field.type==='height'){
      need(['mm','layers'].includes(old.heightMode),'GEOMETRY_PROPOSAL_HEIGHT_MODE',{field:id});
      value={heightMode:'mm',mm:target,...(old.datum?{datum:cloneJSON(old.datum),referenceLayer:old.referenceLayer}:{})};
    }
    parameters.push({id,value});
    changes.push(`${field.ui.label}: ${before} → ${target} mm${old?.heightMode==='layers'?' (chuyển từ số lớp sang mm, giữ mốc bắt đầu đã khai báo)':''}.`);
  }
  const command={id:'parameters.set',args:{changes:parameters}},preview=domain.previewCommand(input.state,command);
  need(preview.ok,'GEOMETRY_PROPOSAL_DOMAIN',{issues:preview.issues});
  changes.push('Chỉ áp dụng sau khi xác nhận; dựng lại từ nguồn gốc với tham số mới và kiểm lại hình học.');
  const descriptor=Object.freeze({head:Object.freeze(head),parameters:Object.freeze(parameters.map(p=>Object.freeze(cloneJSON(p))))});
  const fingerprint=await sha256(canonicalJSON(descriptor));let consumed=false,released=false;
  return Object.freeze({version:VERSION,status:'parameters-proposal',ticket:Object.freeze(cloneJSON(input.ticket)),...descriptor,
    fingerprint,changes:Object.freeze(changes),
    async confirm(control){
      need(!consumed&&!released,'GEOMETRY_PROPOSAL_CONSUMED');consumed=true;
      need(same(control.ticket,input.ticket)&&!control.signal.aborted,'GEOMETRY_PROPOSAL_TICKET');
      need(await sha256(canonicalJSON(descriptor))===fingerprint,'GEOMETRY_PROPOSAL_CHANGED');
      return proposal.confirm(control);
    },
    release(){if(!released){released=true;proposal.release();}}
  });
}

/** Callback ownership bridge for createProductAdapters.onGeometryProposal. */
export function createGeometryProposalBridge(){
  const calls=new Map();let epoch=0;
  return {
    onGeometryProposal(proposal){
      const call=calls.get(proposal.ticket?.id);
      if(!call||call.proposal||!same(call.input.ticket,proposal.ticket))return false;
      call.proposal=proposal;return true;
    },
    wrap(engine){return {...engine,async build(input){
      const id=input.ticket.id,started=epoch,call={input,proposal:null};
      need(!calls.has(id),'GEOMETRY_PROPOSAL_DUPLICATE');calls.set(id,call);
      let transferred=false;
      try{return await engine.build(input);}
      catch(e){
        if(e.code!=='PRODUCT_GEOMETRY_PROPOSAL'||!call.proposal)throw e;
        const result=await nativeParameterProposal(call.proposal,input);
        need(started===epoch&&!input.signal.aborted,'GEOMETRY_PROPOSAL_RETIRED');
        transferred=true;return result;
      }finally{if(calls.get(id)===call)calls.delete(id);if(!transferred)call.proposal?.release();}
    }};},
    reset(){epoch++;for(const call of calls.values())call.proposal?.release();calls.clear();}
  };
}
