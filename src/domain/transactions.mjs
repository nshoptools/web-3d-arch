import { FIELD_SCHEMA, getField, normalizeField, candidateDefault, fieldAvailability } from './schema.mjs';
import { validateProject, effectiveValues, switchProductDraft } from './project.mjs';
import { createSchedule, previewMmToLayers, describeHeight } from './layers.mjs';
import { check, cloneData, deepFreeze, onlyKeys, equalData, errorRecord } from './safe.mjs';
import { dataHash } from './hash.mjs';
export const COMMAND_SCHEMA = deepFreeze([
  {id:'parameters.set',args:'{changes:[{id,value}]}',precondition:'Known, active IDs applicable to current product; whole final state valid.',undo:'snapshot transaction'},
  {id:'parameters.reset',args:'{ids:[id]}',precondition:'Same scope; clears user origin only for listed IDs.',undo:'snapshot transaction'},
  {id:'product.switch',args:'{product}',precondition:'Known product; preserved entries satisfy target constraints.',undo:'snapshot transaction'},
  {id:'schedule.set',args:'{firstLayerHeight?,layerHeight?}',precondition:'Valid schedule; all retained height domains remain valid.',undo:'snapshot transaction'},
  {id:'profile.apply',args:'{profileId,firstLayerHeight,layerHeight}',precondition:'Profile schedule proposed; preserve each user height override.',undo:'snapshot transaction'},
  {id:'parameter.convert-to-layers',args:'{id,binding:{datum,referenceLayer},rounding}',precondition:'Current mm height, explicit datum and rounding.',undo:'snapshot transaction'}
]);
function parameterRecord(next,field){
  check(field.lifecycle==='active'&&field.scope!=='schedule','command-scope','Use replacement/schedule command for this field.',{id:field.id});
  check(field.applicability.products.includes(next.product),'inapplicable-product','Cannot change a field belonging to another product.',{id:field.id});
  return field.scope==='common'?next.parameters.common:next.parameters.byProduct[next.product];
}
function runCommand(base,input) {
  const command=cloneData(input); onlyKeys(command,['id','args']);
  const args=command.args; let next=cloneData(base);
  if(command.id==='product.switch'){
    onlyKeys(args,['product']); return switchProductDraft(base,args.product);
  }
  if(command.id==='parameters.set'){
    onlyKeys(args,['changes']);
    check(Array.isArray(args.changes)&&args.changes.length>0&&args.changes.length<=128,'change-list','Expected 1–128 changes.');
    const seen=new Set();
    for(const change of args.changes){
      onlyKeys(change,['id','value']); const field=getField(change.id),record=parameterRecord(next,field);
      check(!seen.has(field.id),'duplicate-change','A field may be changed once per command.',{id:field.id}); seen.add(field.id);
      record[field.id]={origin:'user',value:normalizeField(field.id,change.value,{schedule:next.schedule})};
    }
  }else if(command.id==='parameters.reset'){
    onlyKeys(args,['ids']); check(Array.isArray(args.ids)&&args.ids.length>0&&args.ids.length<=128,'change-list','Expected field IDs.');
    const seen=new Set();
    for(const id of args.ids){
      const field=getField(id),record=parameterRecord(next,field);
      check(!seen.has(id),'duplicate-change','Duplicate reset ID.',{id}); seen.add(id);
      record[id]={origin:'auto',value:normalizeField(id,candidateDefault(id,next.product),{schedule:next.schedule})};
    }
  }else if(command.id==='schedule.set'){
    onlyKeys(args,['firstLayerHeight','layerHeight'],[]);
    check(Object.keys(args).length>0,'empty-command','A schedule change must specify at least one height.');
    const inputs={firstLayerHeight:next.schedule.firstLayerHeight,layerHeight:next.schedule.layerHeight,
      sources:{...next.schedule.sources},profileId:next.schedule.profileId};
    for(const key of Object.keys(args)){inputs[key]=args[key];inputs.sources[key]='user';}
    next.schedule=createSchedule(inputs);
  }else if(command.id==='profile.apply'){
    onlyKeys(args,['profileId','firstLayerHeight','layerHeight']);
    // Validate the complete proposed profile even if all user overrides will be retained.
    const proposal=createSchedule({...args,sources:{firstLayerHeight:'profile',layerHeight:'profile'}});
    const retained={profileId:proposal.profileId,sources:{...next.schedule.sources}};
    for(const key of ['firstLayerHeight','layerHeight'])
      retained[key]=next.schedule.sources[key]==='user'?next.schedule[key]:proposal[key];
    next.schedule=createSchedule(retained);
  }else if(command.id==='parameter.convert-to-layers'){
    onlyKeys(args,['id','binding','rounding']);
    const field=getField(args.id),record=parameterRecord(next,field),old=record[field.id].value;
    check(field.type==='height'&&old.heightMode==='mm','migration-height-mode','Only an explicit nominal-mm height can convert to layers.');
    const proposal=previewMmToLayers(old.mm,next.schedule,args.binding);
    const choice=proposal.options.find(o=>o.rounding===args.rounding);
    check(choice,'rounding-required','Choose an explicit migration rounding policy.');
    record[field.id]={origin:'user',value:normalizeField(field.id,choice.value,{schedule:next.schedule})};
  }else check(false,'unsupported-command','Unknown command ID.',{id:command.id});
  return next;
}
export function diffData(before,after,path='') {
  if(equalData(before,after))return [];
  if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
    return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(key=>{
      const nextPath=path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1');
      if(!Object.hasOwn(before,key))return [{path:nextPath,before:{absent:true},after:cloneData(after[key])}];
      if(!Object.hasOwn(after,key))return [{path:nextPath,before:cloneData(before[key]),after:{absent:true}}];
      return diffData(before[key],after[key],nextPath);
    });
  }
  return [{path:path||'/',before:cloneData(before),after:cloneData(after)}];
}
function effectsFor(before,after){
  const oldValues=effectiveValues(before),newValues=effectiveValues(after),effects=[];
  for(const f of FIELD_SCHEMA.filter(f=>f.lifecycle==='active')){
    const oldHas=Object.hasOwn(oldValues,f.id),newHas=Object.hasOwn(newValues,f.id);
    const oldAvailability=fieldAvailability(f.id,{product:before.product,sourceKind:before.sourceKind,values:oldValues});
    const newAvailability=fieldAvailability(f.id,{product:after.product,sourceKind:after.sourceKind,values:newValues});
    const oldHeight=f.type==='height'&&oldHas?describeHeight(oldValues[f.id],before.schedule):null;
    const newHeight=f.type==='height'&&newHas?describeHeight(newValues[f.id],after.schedule):null;
    const from={present:oldHas,value:oldHas?oldValues[f.id]:null,applicable:oldAvailability.applicable,reasons:oldAvailability.reasons,height:oldHeight};
    const to={present:newHas,value:newHas?newValues[f.id]:null,applicable:newAvailability.applicable,reasons:newAvailability.reasons,height:newHeight};
    if(!equalData(from,to))effects.push({id:f.id,before:from,after:to});
  }
  return effects;
}
const failure=(state,error,details={})=>Object.freeze({ok:false,state,issues:[errorRecord(error)],...details});
export function previewCommand(state,command) {
  let candidate;
  try{
    const before=validateProject(state);
    candidate=runCommand(before,command);
    candidate.revision=before.revision+1;
    const after=validateProject(candidate);
    const profileCompatibility=command.id==='profile.apply' ? {
      status:'unverified',userOverridesOutsideProposal:['firstLayerHeight','layerHeight'].filter(k=>after.schedule[k]!==createSchedule({...command.args,sources:{firstLayerHeight:'profile',layerHeight:'profile'}})[k])
    } : null;
    return deepFreeze({ok:true,command:cloneData(command),baseRevision:before.revision,beforeHash:dataHash(before),
      afterHash:dataHash(after),candidate:after,diff:diffData(before,after),effects:effectsFor(before,after),
      profileCompatibility,verification:{data:'valid',geometry:'unsupported',fit:'unverified'},requiresAcceptance:true});
  }catch(error){
    // A draft may be shown for conflict resolution, but is never a committed state.
    return failure(state,error,{proposedDiff:candidate?diffData(state,candidate):[]});
  }
}
function transaction(before,after,command){
  return deepFreeze({version:1,id:dataHash({before:dataHash(before),after:dataHash(after),command}),
    command:cloneData(command),before:cloneData(before),after:cloneData(after)});
}
export function commitPreview(state,preview){
  try{
    check(preview&&preview.ok===true,'preview-required','A successful preview must be accepted before commit.');
    check(state.revision===preview.baseRevision&&dataHash(validateProject(state))===preview.beforeHash,
      'stale-preview','Project changed since preview; prepare a fresh preview.');
    const recomputed=previewCommand(state,preview.command);
    check(recomputed.ok,'invalid-preview','Preview command no longer produces a valid state.');
    check(equalData(recomputed,preview),'preview-mismatch','Preview content changed; prepare a fresh preview.');
    const next=recomputed.candidate;
    return deepFreeze({ok:true,state:next,transaction:transaction(state,next,preview.command),diff:recomputed.diff,effects:recomputed.effects});
  }catch(error){return failure(state,error);}
}
/** Undo produces an inverse transaction. Undoing that inverse is redo.
 * Parent owns history budget/storage; stale branches cannot overwrite a newer state. */
export function undoTransaction(state,tx){
  try{
    tx=cloneData(tx);onlyKeys(tx,['version','id','command','before','after']);
    check(tx.version===1,'transaction-version','Unsupported history transaction.');
    const before=validateProject(tx.before),after=validateProject(tx.after);
    check(transaction(before,after,tx.command).id===tx.id,'transaction-hash','History payload integrity mismatch.');
    check(equalData(state,after),'stale-history','Undo requires the exact transaction result as current state.');
    const restored=validateProject({...cloneData(before),revision:state.revision+1});
    const inverse=transaction(state,restored,{id:'history.undo',args:{transactionId:tx.id}});
    return deepFreeze({ok:true,state:restored,transaction:inverse,diff:diffData(state,restored)});
  }catch(error){return failure(state,error);}
}
